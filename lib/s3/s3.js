/**


*/
function getConfigsObjForV2(configs) {

  var bucket = configs.bucket;
  var region = configs.region;
  var keyStart = configs.keyStart;
  var acl = configs.acl;


  var accessKeyId = configs.awsAccessKey;
  var secret = configs.awsSecretAccessKey;

  var expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 1);

  var policy = JSON.stringify({
      // ISO 8601 - date('c'); generates uncompatible date, so better do it manually
      'expiration': expirationDate.toISOString(),
      'conditions': [
          {'bucket': bucket},
          {'acl': acl},
          {'success_action_status': '201'},
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

*/
function getConfigsObjForV4(configs) {

  var bucket = configs.bucket;
  var region = configs.region;
  var keyStart = configs.keyStart;
  var acl = configs.acl;

  var accessKeyId = configs.awsAccessKey;
  var secret = configs.awsSecretAccessKey;

  var expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 1);

  var policy = JSON.stringify({
      // ISO 8601 - date('c'); generates uncompatible date, so better do it manually
      'expiration': expirationDate.toISOString().slice(0,10).replace(/-/g,""),
      'conditions': [
          {'bucket': bucket},
          {'acl': acl},
          {'success_action_status': '201'},
          {'x-requested-with': 'xhr'},
          ['starts-with', '$key', keyStart],
          ['starts-with', '$Content-Type', ''] // accept all files
      ]
    }
  );
  
  policy = new Buffer(policy).toString('base64');

  var crypto = require('crypto');
  var kDate = crypto.createHmac('sha256', 'AWS4' + secret).update((new Date()).toISOString().slice(0,10).replace(/-/g,"")).digest('binary');
  var kRegion = crypto.createHmac('sha256', kDate).update(region).digest('binary');
  var kService = crypto.createHmac('sha256', kRegion).update('S3').digest('binary');
  var kSignature = crypto.createHmac('sha256', kService).update("aws4_request").digest('binary');
  var signature = crypto.createHmac('sha256', kSignature).update(policy).digest('hex');

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

exports.S3 = {
  getConfigsObjForV2: getConfigsObjForV2,
  getConfigsObjForV4: getConfigsObjForV4
}