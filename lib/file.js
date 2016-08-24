var merge = require('merge');
var diskManagement = require('./utils/disk.management.js');
var utils = require('./utils/utils.js');
var path = require('path');

var defaultFileUploadOptions = merge({validation: 'file'}, utils.defaultUploadOptions);

/**

File upload to disk.

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
  options = merge(defaultFileUploadOptions, options);
  diskManagement.upload(req, options, callback);  
}

/**

Delete file from disk

@param res response stream
@param fileFolder string
@param fileName string

*/
var doDelete = function(src, callback) {

  diskManagement.delete(src, callback);  
}

exports.File = {
  upload: upload,
  'delete': doDelete
}