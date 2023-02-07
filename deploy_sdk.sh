#!/usr/bin/env bash

# Steps
    # Identify the build agent. Check whether build agent is same as deployment server
    # Login to build server and build, run, check the new changes.
    # --force-recreate for docker-compose
    # --no-cache for docker build
    # -f for npm install
    # -v --rmi all for docker compose down

if [ "${TRAVIS_PULL_REQUEST}" != "false" ];  then echo "Not deploying on a pull request !!!" && exit 0; fi

# Define the global variables
export BRANCH_NAME=$(echo "${TRAVIS_BRANCH}" | tr '[:upper:]' '[:lower:]')
export PACKAGE_VERSION="$(jq '.version' version.json | tr -d '"')"
export IMAGE_NAME="$(echo "froala-${BUILD_REPO_NAME}_${TRAVIS_BRANCH}:${PACKAGE_VERSION}" | tr '[:upper:]' '[:lower:]')"
export BASE_DOMAIN="froala-infra.com"
export AO_IDENTIFIER="${TRAVIS_BRANCH}"
export BASE_DOMAIN="froala-infra.com"
export SHORT_REPO_NAME="${BUILD_REPO_NAME:0:17}"
export BRANCH_LENGHT=$(echo "${TRAVIS_BRANCH}" |awk '{print length}')
export CT_INDEX=0
export MAX_DEPLOYMENTS_NR=0
export SDK_ENVIRONMENT=""
export DEPLOYMENT_SERVER=""
export SERVICE_NAME=""
export CONTAINAER_NAME=""
export OLDEST_CONTAINER=""

# Copy the ssh key
echo "${SSH_KEY}"  | base64 --decode > /tmp/sshkey.pem
chmod 400 /tmp/sshkey.pem

# Select the deployment server based on the branch.
case "${BRANCH_NAME}" in
    dev*) SDK_ENVIRONMENT="dev" && DEPLOYMENT_SERVER="${FROALA_SRV_DEV}";;
    ao-dev*) SDK_ENVIRONMENT="dev" && DEPLOYMENT_SERVER="${FROALA_SRV_DEV}";;
    qa*) SDK_ENVIRONMENT="qa" && DEPLOYMENT_SERVER="${FROALA_SRV_QA}";;
    qe*) SDK_ENVIRONMENT="qe" && DEPLOYMENT_SERVER="${FROALA_SRV_QE}";;
    rc*) SDK_ENVIRONMENT="stg" && DEPLOYMENT_SERVER="${FROALA_SRV_STAGING}";;
    release-master*) SDK_ENVIRONMENT="stg" && DEPLOYMENT_SERVER=${FROALA_SRV_STAGING};;
    ft*) echo "Building only on feature branch ${TRAVIS_BRANCH}... will not deploy..." && exit 0;;
    bf*) echo "Building only on bugfix branch ${TRAVIS_BRANCH}... will not deploy..." && exit 0;;
    *) echo "Not a deployment branch" && exit 1;;
esac

# Set the short branch name
if [ "${BRANCH_LENGHT}" -lt 18 ]; then 
    SHORT_TRAVIS_BRANCH="${TRAVIS_BRANCH}"
else
    SHORT_TRAVIS_BRANCH="${TRAVIS_BRANCH:0:8}${TRAVIS_BRANCH: -8}"
fi
SHORT_TRAVIS_BRANCH="$(echo "${SHORT_TRAVIS_BRANCH}" | sed -e 's/-//g' -e 's/\.//g' -e 's/_//g')"

# Get the maximum allowed deployment for given environment
function get_max_deployments_per_env(){
    local ENVIRONMENT=$1
    echo "getting max deployments for environment ${ENVIRONMENT}"
    MAX_DEPLOYMENTS_NR=$(jq --arg sdkenvironment "${ENVIRONMENT}"  '.[$sdkenvironment]' version.json | tr -d '"')
    echo "detected max deployments: ${MAX_DEPLOYMENTS_NR}"
}
get_max_deployments_per_env $SDK_ENVIRONMENT
echo "Selected environment :${SDK_ENVIRONMENT}, deployment server ${DEPLOYMENT_SERVER}, max allowed deployments: ${MAX_DEPLOYMENTS_NR}"

# Get the old container name, no of deployments, and generate the new index and container name
function generate_container_name(){
    local LW_REPO_NAME=$1
    local LW_SHORT_TRAVIS_BRANCH=$2
    local SDK_ENVIRONMENT=$3
    local DEPLOYMENT_SERVER=$4
    echo "searching for ${LW_REPO_NAME} depl..."

    RUNNING_DEPL=$(ssh -o "StrictHostKeyChecking no" -i  /tmp/sshkey.pem "${SSH_USER}"@"${DEPLOYMENT_SERVER}" "sudo docker ps | grep -i ${LW_REPO_NAME}")
    echo "running depl var: ${RUNNING_DEPL}"
    echo "looking for ${LW_REPO_NAME} deployments"
    echo "getting indexes for oldest and latest deployed container"

    DEPL=$(ssh -o "StrictHostKeyChecking no" -i  /tmp/sshkey.pem "${SSH_USER}"@"${DEPLOYMENT_SERVER}" sudo docker ps | grep -i "${LW_REPO_NAME}"-"${AO_IDENTIFIER}")
    echo "show docker containers ssh cmd:  ${DEPL}"
    echo "${DEPL}" > file.txt
    echo "running conatiners: "
    cat file.txt

    CT_LOWER_INDEX=$(awk -F'-' '{print $NF }' < file.txt | sort -nk1 | head -1)
    CT_HIGHER_INDEX=$(awk -F'-' '{print $NF }' < file.txt | sort -nk1 | tail -1)
    echo "lowest index : ${CT_LOWER_INDEX} ; and highest index : ${CT_HIGHER_INDEX}"	

    if [ -z "${RUNNING_DEPL}" ]; then
        echo "first deployment"
        CT_INDEX=1
        CONTAINER_NAME="${LW_REPO_NAME}-${AO_IDENTIFIER}-${CT_INDEX}"
        SERVICE_NAME="${LW_REPO_NAME}-${LW_SHORT_TRAVIS_BRANCH}" 
    else
        echo "multiple deployments"
        CT_INDEX=${CT_HIGHER_INDEX} && CT_INDEX=$((CT_INDEX+1))
        OLDEST_CONTAINER="${LW_REPO_NAME}-${AO_IDENTIFIER}-${CT_LOWER_INDEX}"
        CONTAINER_NAME="${LW_REPO_NAME}-${AO_IDENTIFIER}-${CT_INDEX}"
        SERVICE_NAME="${LW_REPO_NAME}-${LW_SHORT_TRAVIS_BRANCH}-${CT_INDEX}"
        echo "New index: ${CT_INDEX}, Old container: ${OLDEST_CONTAINER}"
    fi
}
LW_REPO_NAME=$(echo "${BUILD_REPO_NAME}" | tr '[:upper:]' '[:lower:]' | sed -e 's/-//g' -e 's/\.//g' -e 's/_//g')
LW_SHORT_TRAVIS_BRANCH=$(echo "${SHORT_TRAVIS_BRANCH}" | tr '[:upper:]' '[:lower:]')
generate_container_name "${LW_REPO_NAME}" "${LW_SHORT_TRAVIS_BRANCH}" "${DEPLOYMENT_SERVER}" "${DEPLOYMENT_SERVER}" 

# Set the deployment URL
export DEPLOYMENT_URL="${SHORT_REPO_NAME}-${SHORT_TRAVIS_BRANCH}.${SDK_ENVIRONMENT}-${CT_INDEX}.${BASE_DOMAIN}"
# export DEPLOYMENT_URL="${SHORT_REPO_NAME}-${SHORT_TRAVIS_BRANCH}.${SDK_ENVIRONMENT}.${BASE_DOMAIN}"

# Modify the compose file and run the docker-compose.
function deploy_service(){

    # Copy the docker-compose template to docker-compose.yml
    cp docker-compose.yml.template docker-compose.yml
    # Replace the sample values
    sed -i "s/ImageName/${NEXUS_CR_TOOLS_URL}\/${IMAGE_NAME}/g" docker-compose.yml
    sed -i "s/UrlName/${DEPLOYMENT_URL}/g" docker-compose.yml
    sed -i "s/ServiceName/${SERVICE_NAME}/g" docker-compose.yml
    sed -i "s/PortNum/${CONTAINER_SERVICE_PORTNO}/g" docker-compose.yml
    sed -i "s/ContainerName/${CONTAINER_NAME}/g" docker-compose.yml

    # Run docker-compose down on deployment_server
    ssh -o "StrictHostKeyChecking no" -i  /tmp/sshkey.pem "${SSH_USER}"@"${DEPLOYMENT_SERVER}" "if [ -d /services/${SERVICE_NAME} ];  then sudo docker-compose -f /services/${SERVICE_NAME}/docker-compose.yml down -v --rmi all; fi"
    
    # Remove the old docker-compose from deployment_server
    ssh -o "StrictHostKeyChecking no" -i  /tmp/sshkey.pem "${SSH_USER}"@"${DEPLOYMENT_SERVER}" "if [ -d /services/${SERVICE_NAME} ];  then rm -rf /services/${SERVICE_NAME}; fi && mkdir /services/${SERVICE_NAME}"
    
    # Copy the current docker-compose file to deployment_server
    scp  -o "StrictHostKeyChecking no" -i  /tmp/sshkey.pem docker-compose.yml "${SSH_USER}"@"${DEPLOYMENT_SERVER}":/services/"${SERVICE_NAME}"/docker-compose.yml

    # Run docker-compose pull on deployment_server
    ssh -o "StrictHostKeyChecking no" -i  /tmp/sshkey.pem "${SSH_USER}"@"${DEPLOYMENT_SERVER}" "cd /services/${SERVICE_NAME}/ && sudo docker-compose pull"
    sleep 10
    
    # Run docker-compose up on deployment_server
    ssh -o "StrictHostKeyChecking no" -i  /tmp/sshkey.pem "${SSH_USER}"@"${DEPLOYMENT_SERVER}" "cd /services/${SERVICE_NAME}/ && sudo docker-compose up -d --force-recreate"
    sleep 60
    
    RET_CODE=$(curl -k -s -o /tmp/notimportant.txt -w "%{http_code}" https://"${DEPLOYMENT_URL}")
    echo "validation code: $RET_CODE for  https://${DEPLOYMENT_URL}"
    if [ "${RET_CODE}" -ne 200 ]; then 
        echo "Deployment validation failed!!! Please check pipeline logs." 
        exit 1 
    else 
        echo "Service available at URL: https://${DEPLOYMENT_URL}"
    fi
}
deploy_service