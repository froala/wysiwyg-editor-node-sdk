# Node.js SDK for Froala Editor

Easing the [Froala WYSIWYG HTML Editor](https://github.com/froala/wysiwyg-editor) inclusion in Node.js projects

## Installation

1. Clone this repo or download the zip.

2. Run `npm install`

3. Load `lib` directory in your project and import it: `var FroalaEditor = require('path/to/lib/froalaEditor.js');`

4. To run examples: 
* `npm start` to start a nodejs server form `examples` directory at `http://localhost:3000/`  

## Usage

### Import lib
```javascript
var FroalaEditor = require('path/to/lib/froalaEditor.js');
```

### Upload image to disk

`FroalaEditor.Image.upload(req, options, callback);`

* `req` http multipart request stream

* `options` object (can be `null`)

Properties:

`fileRoute`: default is '/uploads/'. It represents the public location where your files will be stored, eg: www.site.com/uploads/.

`validation`: default is null and it verifies if the image extension is 'gif', 'jpeg', 'jpg', 'png' or 'blob' and if the mimetype is 'image/gif', 'image/jpeg', 'image/pjpeg', 'image/x-png' or 'image/png'.

It can be a function with filename, mimetype as parameters:

```javascript
function isImageValid(filename, mimetype) {
  //return true if the image is valid, false otherwise
}
```

* `callback` function(err, data):

`err` is `null` if no error occured

`data` is the object that needs to be sent back to the editor: `{link: 'link/to/image'}`.

* If fileRoute is '/uploads/' and image name is image.png then the link will be '/uploads/image.png'. 

The link should be public in your server so you can access it. With express you can achieve it like this:

```javascript
var express = require('express');
var app = express();
app.use(express.static(__dirname + '/uploads/'));
```

Example:
```javascript
FroalaEditor.Image.upload(req, null, function(err, data) {

  if (err) {
    return res.send(err);
  }
  res.send(data);
});
```

### Upload file to disk

`FroalaEditor.File.upload(req, options, callback);`

* `req` http multipart request stream

* `options` object (can be `null`)

Properties:

`fileRoute`: default is '/uploads/'. It represents the public location where your files will be stored, eg: www.site.com/uploads/.

`validation`: default is null and it verifies if the file extension is 'txt', 'pdf' or 'doc' and if the mimetype is 'text/plain', 'application/msword', 'application/x-pdf' or 'application/pdf'.

It can be a function with filename, mimetype as parameters:

```javascript
function isFileValid(filename, mimetype) {
  //return true if the file is valid, false otherwise
}
```

* `callback` function(err, data):

`err` is `null` if no error occured

`data` is the object that needs to be sent back to the editor: `{link: 'link/to/file'}`.

* If fileRoute is '/uploads/' and file name is file.pdf then the link will be '/uploads/file.pdf'. 

The link should be public in your server so you can access it. With express you can achieve it like this:

```javascript
var express = require('express');
var app = express();
app.use(express.static(__dirname + '/uploads/'));
```

Example:
```javascript
FroalaEditor.File.upload(req, {fileRoute: '/uploads/pdfs/'}, function(err, data) {

  if (err) {
    return res.status(404).end(err);
  }
  res.send(data);
});
```

### Delete image from disk

`FroalaEditor.Image.delete(link, callback);`

* `link` public link to image

* `callback` function(err):

`err` is `null` if no error occured

Example:
```javascript
FroalaEditor.Image.delete(req.body.src, function(err) {

  if (err) {
    return res.status(404).end(err);
  }
  return res.end();
});
```

### Delete file from disk

`FroalaEditor.File.delete(link, callback);`

* `link` public link to file

* `callback` function(err):

`err` is `null` if no error occured

Example:
```javascript
FroalaEditor.File.delete(req.body.src, function(err) {

  if (err) {
    return res.status(404).end(err);
  }
  return res.end();
});
```

### Load images into [Image Manager](https://www.froala.com/wysiwyg-editor/docs/concepts/image-manager)

`FroalaEditor.Image.list(route, callback);`

* `route` public route to image. If the image link is '/uploads/image.png' then the route is '/uploads/'

* `callback` function(err):

`err` is `null` if no error occured

Example:
```javascript
FroalaEditor.Image.list(req.body.route, function(err) {

  if (err) {
    return res.status(404).end(err);
  }
  return res.end();
});
```

### Get Amazon S3 upload configs with v2 signature

`FroalaEditor.S3.getHash(config, FroalaEditor.S3.SIGNATURE_V2);`

* `config` object:

```javascript
{
  bucket: 'bucketName',
  region: 'v2Region',
  keyStart: 'editor/',
  acl: 'public-read',
  awsAccessKey: 'YOUR-AMAZON-S3-PUBLIC-ACCESS-KEY',
  awsSecretAccessKey: 'YOUR-AMAZON-S3-SECRET-ACCESS-KEY'
}
```

* returns the needed object for the editor to work with Amazon S3

```javascript
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
```

### Example:

* Frontend

```javascript
$(function() {

  $.get( "get_amazon_v2_hash", {})
  .done(function( data ) {

    $('#edit-amazon-v2').froalaEditor({
      imageUploadToS3: data,
      fileUploadToS3: data
    })
  });
});
``` 

* Backend

```javascript
app.get('/get_amazon_v2_hash', function (req, res) {

  var config = {
    bucket: 'testv2',
    region: 'v2Region',
    keyStart: 'editor/',
    acl: 'public-read',
    awsAccessKey: '',
    awsSecretAccessKey: ''
  }

  var hash = FroalaEditor.S3.getHash(config, FroalaEditor.S3.SIGNATURE_V2);
  res.send(hash);
});
```

### Get Amazon S3 upload configs with v4 signature 

`FroalaEditor.S3.getHash(config, FroalaEditor.S3.SIGNATURE_V4);`

* `config` object:

```javascript
{
  bucket: 'bucketName',
  region: 'v4Region',
  keyStart: 'editor/',
  acl: 'public-read',
  awsAccessKey: 'YOUR-AMAZON-S3-PUBLIC-ACCESS-KEY',
  awsSecretAccessKey: 'YOUR-AMAZON-S3-SECRET-ACCESS-KEY'
}
```

* returns the needed object for the editor to work with Amazon S3

```javascript
{
  bucket: bucket,
  region: region,
  keyStart: keyStart,
  params: {
    acl: acl,
    policy: policy,
    'x-amz-algorithm': 'AWS4-HMAC-SHA256',
    'x-amz-credential': xAmzCredential,
    'x-amz-date': xAmzDate,
    'x-amz-signature': signature
  }
}
```

### Example:

* Frontend

```javascript
$(function() {

  $.get( "get_amazon_v4_hash", {})
  .done(function( data ) {

    $('#edit-amazon-v4').froalaEditor({
      imageUploadToS3: data,
      fileUploadToS3: data
    })
  });
});
```

* Backend

```javascript
app.get('/get_amazon_v4_hash', function (req, res) {

  var config = {
    bucket: 'testv4',
    region: 'v4Region',
    keyStart: 'editor/',
    acl: 'public-read',
    awsAccessKey: '',
    awsSecretAccessKey: ''
  }

  var hash = FroalaEditor.S3.getHash(config, FroalaEditor.S3.SIGNATURE_V4);
  res.send(hash);
});
```

## License

The `froala-editor-node-sdk` project is under MIT license. However, in order to use Froala WYSIWYG HTML Editor plugin you should purchase a license for it.

Froala Editor has [3 different licenses](http://froala.com/wysiwyg-editor/pricing) for commercial use.
For details please see [License Agreement](http://froala.com/wysiwyg-editor/terms).


