var utils = require('./utils/utils.js');
var Busboy = require('busboy');
var merge = require('merge');
var path = require('path');
var fs = require('fs');
var sha1 = require('sha1');

/**

Image upload to disk.

@param req request stream
@param res response stream
@param options 
  {
    fileFolder: string
    fileRoute: string
    validation: string: 'file', 'image'. OR function

  }
*/
function uploadImage(req, res, options) {

  // merge options with default options
  options = merge(utils.defaultImageUploadOptions, options);

  upload(req, res, options);
}

/**

File upload to disk.

@param req request stream
@param res response stream
@param options 
  {
    fileFolder: string
    fileRoute: string
    validation: string: 'file', 'image'. OR function
  }
*/
function uploadFile(req, res, options) {

  // merge options with default options
  options = merge(utils.defaultFileUploadOptions, options);

  upload(req, res, options);  
}

/**

Generic upload to disk.

@param req request stream
@param res response stream
@param options 
  {
    fileFolder: string
    fileRoute: string
    validation: string: 'file', 'image'. OR function
  }
*/
function upload(req, res, options) {

  // merge options with default options
  options = merge(utils.defaultUploadOptions, options);

  var busboy = new Busboy({ headers: req.headers });

  // this is used for sending response
  var link = null;

  // handle file arrival
  busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        
    // validate uploaded file
    if (!utils.handleValidation(options.validation, filename, mimetype)) {

      // stop receiving from this stream
      return file.resume();
    }

    // generate link
    var randomName = sha1(new Date().getTime()); //+ '.' + getFileExtension(filename);
    link = options.fileRoute + randomName;

    // generate path where the file will be saved
    var saveTo = path.join(options.fileFolder || __dirname, randomName);

    // pipe reader stream (file from client) into writer stream (file from disk)
    file.pipe(fs.createWriteStream(saveTo));
  });

  // handle file upload termination
  busboy.on('finish', function() {

    // the file stream was resumed
    if (!link) {

      // send fail response
      return res.send({status: "error"});
    }
    
    // send success response
    return res.send({link: link});
  });

  // pipe reader stream into writer stream
  return req.pipe(busboy);
}

// exporting:
exports.uploadImage = uploadImage;
exports.uploadFile = uploadFile;
exports.upload = upload;