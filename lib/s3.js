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
          {success_action_status: '201'},
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

  var bucket = config.bucket;
  var region = config.region;
  var keyStart = config.keyStart;
  var acl = config.acl;

  // These can be found on your Account page, under Security Credentials > Access Keys.
  var accessKeyId = config.accessKey;
  var secret = config.secretKey;

  var date = new Date().toISOString();
  var dateString = date.substr(0, 4) + date.substr(5, 2) + date.substr(8, 2); // Ymd format.

  var credential = [accessKeyId, dateString, region, 's3/aws4_request'].join('/');
  var xAmzDate = dateString + 'T000000Z';

  var policy = {
    // 5 minutes into the future
    expiration: new Date((new Date).getTime() + (5 * 60 * 1000)).toISOString(),
    conditions: [
      {bucket: bucket},
      {acl: acl },
      {'success_action_status': '201'},
      {'x-requested-with': 'xhr'},
      // Optionally control content type and file size
      // {'Content-Type': 'application/pdf'},
      {'x-amz-algorithm': 'AWS4-HMAC-SHA256'},
      {'x-amz-credential': credential},
      {'x-amz-date': xAmzDate},
      ['starts-with', '$key', keyStart],
      ['starts-with', '$Content-Type', ''] // accept all files
    ],
  }
  var policyBase64 = new Buffer(JSON.stringify(policy)).toString('base64');


  function hmac(key, string) {
    var hmac = require('crypto').createHmac('sha256', key);
    hmac.end(string);
    return hmac.read();
  }

  var dateKey = hmac('AWS4' + secret, dateString);
  var dateRegionKey = hmac(dateKey, region);
  var dateRegionServiceKey = hmac(dateRegionKey, 's3');
  var signingKey = hmac(dateRegionServiceKey, 'aws4_request');
  var signature = hmac(signingKey, policyBase64).toString('hex');


  return {
    bucket: bucket,
    region: region != 's3' ? 's3-' + region : 's3',
    keyStart: keyStart,
    params: {
      acl: acl,
      policy: policyBase64,
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': credential,
      'x-amz-date': xAmzDate,
      'x-amz-signature': signature
    }
  }
}

exports.S3 = {
  getHashV2: getHashV2,
  getHashV4: getHashV4
}