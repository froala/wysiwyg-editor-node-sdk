FROM node:14.17.3

LABEL maintainer="rizwan@celestialsys.com"

ARG PackageName
ARG PackageVersion
ARG NexusUser
ARG NexusPassword

RUN apt update -y \
    && apt install -y jq unzip curl



WORKDIR /app/
COPY . .

RUN wget --no-check-certificate --user ${NexusUser}  --password ${NexusPassword} https://nexus.tools.froala-infra.com/repository/Froala-npm/${PackageName}/-/${PackageName}-${PackageVersion}.tgz

RUN npm install
RUN npm install -g bower
RUN bower install --allow-root

RUN rm -rf bower_components/froala-wysiwyg-editor/

RUN tar -xvf ${PackageName}-${PackageVersion}.tgz

RUN mv package/ bower_components/froala-wysiwyg-editor/
RUN rm -rf ${PackageName}-${PackageVersion}.tgz

WORKDIR /app/examples
CMD ["npm","run","start"]

