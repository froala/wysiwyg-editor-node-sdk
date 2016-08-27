var merge = require('merge');
var diskManagement = require('./utils/disk.management.js');
var utils = require('./utils/utils.js');

var defaultImageUploadOptions = merge({validation: 'image'}, utils.defaultUploadOptions);

/**

Image upload to disk.

@param req request stream
@param options [optional]
  {
    fileFolder: string
    fileRoute: string
    validation: string: 'file', 'image'. OR function

  }
@param callback
*/
function upload(req, options, callback) {

  if (typeof options == 'function') {

    callback = options;
    options = {};
  }
  // merge options with default options
  options = merge(defaultImageUploadOptions, options);

  diskManagement.upload(req, options, callback);
}

/**

Delete image from disk

@param res response stream
@param fileFolder string
@param fileName string

*/
var _delete = function(src, callback) {

  diskManagement.delete(src, callback);
}

/**

List images from disk

@param res response stream
@param fileFolder string
@param fileName string

*/
function list(folderName, callback) {

  diskManagement.list(folderName, callback);  
}

exports.Image = {
  upload: upload,
  'delete': _delete,
  list: list
}