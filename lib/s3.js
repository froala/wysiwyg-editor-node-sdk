/**

@params configs:
  {
    bucket: 'bucketName',
    region: 's3',
    keyStart: 'editor/',
    acl: 'public-read',
    accessKey: 'YOUR-AMAZON-S3-PUBLIC-ACCESS-KEY',
    secretKey: 'YOUR-AMAZON-S3-SECRET-ACCESS-KEY'
  }

@return:
  {
    bucket: bucket,
    region: region,
    keyStart: keyStart,
    params: {
      acl: acl,
      AWSAccessKeyId: accessKeyId,
      policy: policy,
      signature: signature,
    }
  }
*/
function getHashV2(config) {

  var bucket = config.bucket;
  var region = config.region;
  var keyStart = config.keyStart;
  var acl = config.acl;


  var accessKeyId = config.accessKey;
  var secret = config.secretKey;

  var expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 1);

  var policy = JSON.stringify({
      'expiration': expirationDate.toISOString(),
      'conditions': [
          {'bucket': bucket},
          {'acl': acl},
          { success_action_status: '201' },
          {'x-requested-with': 'xhr'},
          ['starts-with', '$key', keyStart],
          ['starts-with', '$Content-Type', ''] // accept all files
      ]
    }
  );

  policy = new Buffer(policy).toString('base64');

  var crypto = require('crypto')
  var signature = crypto.createHmac('sha1', secret).update(policy).digest('base64');

  return {
    bucket: bucket,
    region: region,
    keyStart: keyStart,
    params: {
      acl: acl,
      AWSAccessKeyId: accessKeyId,
      policy: policy,
      signature: signature,
    }
  }
}

/**

@params config:
  {
    bucket: 'bucketName',
    region: 's3',
    keyStart: 'editor/',
    acl: 'public-read',
    accessKey: 'YOUR-AMAZON-S3-PUBLIC-ACCESS-KEY',
    secretKey: 'YOUR-AMAZON-S3-SECRET-ACCESS-KEY'
  }

@return:
  {
    bucket: bucket,
    region: region,
    keyStart: keyStart,
    params: {
      acl: acl,
      AWSAccessKeyId: accessKeyId,
      policy: policy,
      signature: signature,
    }
  }
*/
function getHashV4(config) {

  // Returns the parameters that must be passed to the API call
  function s3Params(config) {
    var credential = amzCredential(config);
    var policy = s3UploadPolicy(config, credential);
    var policyBase64 = new Buffer(JSON.stringify(policy)).toString('base64');
    return {
      acl: 'public-read',
      policy: policyBase64,
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': credential,
      'x-amz-date': dateString() + 'T000000Z',
      'x-amz-signature': s3UploadSignature(config, policyBase64, credential)
    }
  }

  function dateString() {
    var date = new Date().toISOString();
    return date.substr(0, 4) + date.substr(5, 2) + date.substr(8, 2);
  }

  function amzCredential(config) {
    return [config.accessKey, dateString(), config.region, 's3/aws4_request'].join('/')
  }

  // Constructs the policy
  function s3UploadPolicy(config, credential) {
    return {
      // 5 minutes into the future
      expiration: new Date((new Date).getTime() + (5 * 60 * 1000)).toISOString(),
      conditions: [
        { bucket: config.bucket },
        { acl: config.acl },
        { 'success_action_status': '201'},
        {'x-requested-with': 'xhr'},
        // Optionally control content type and file size
        // {'Content-Type': 'application/pdf'},
        { 'x-amz-algorithm': 'AWS4-HMAC-SHA256' },
        { 'x-amz-credential': credential },
        { 'x-amz-date': dateString() + 'T000000Z' },
        ['starts-with', '$key', config.keyStart],
        ['starts-with', '$Content-Type', ''] // accept all files
      ],
    }
  }

  function hmac(key, string) {
    var hmac = require('crypto').createHmac('sha256', key);
    hmac.end(string);
    return hmac.read();
  }

  // Signs the policy with the credential
  function s3UploadSignature(config, policyBase64, credential) {
    var dateKey = hmac('AWS4' + config.secretKey, dateString());
    var dateRegionKey = hmac(dateKey, config.region);
    var dateRegionServiceKey = hmac(dateRegionKey, 's3');
    var signingKey = hmac(dateRegionServiceKey, 'aws4_request');
    return hmac(signingKey, policyBase64).toString('hex');
  }

  return {
    bucket: config.bucket,
    region: config.region != 's3' ? 's3-' + config.region : 's3',
    keyStart: config.keyStart,
    params: s3Params(config)
  }
}

exports.S3 = {
  getHashV2: getHashV2,
  getHashV4: getHashV4
}