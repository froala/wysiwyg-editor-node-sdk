
// test if an image is valid
function isImageValid(filename, mimetype) {

  var allowedExts = ['gif', 'jpeg', 'jpg', 'png', 'blob'];
  var allowedMimeTypes = ['image/gif', 'image/jpeg', 'image/pjpeg', 'image/x-png', 'image/png'];

  return isBasicFileValid(filename, mimetype, allowedExts, allowedMimeTypes);
}

// test if a file is valid
function isFileValid(filename, mimetype) {

  var allowedExts = ['txt', 'pdf', 'doc'];
  var allowedMimeTypes = ['text/plain', 'application/msword', 'application/x-pdf', 'application/pdf'];

  return isBasicFileValid(filename, mimetype, allowedExts, allowedMimeTypes);
}

// test if a file is valid based on its extension and mime type
function isBasicFileValid(filename, mimetype, allowedExts, allowedMimeTypes) {

  var extension = getExtension(filename);

  return allowedExts.indexOf(extension.toLowerCase()) != -1  &&
    allowedMimeTypes.indexOf(mimetype) != -1
  ;
}

// mapping keys with validating behaviours
var validationMap = {
  'image': isImageValid,
  'file': isFileValid
}
var validationKeys = Object.keys(validationMap);

// generic file validation
function handleValidation(validation, filename, mimetype) {

  // no validation means you dont want to validate, so return affirmative
  if (!validation) {
    return true;
  }

  // validation is a function provided by the user
  if (typeof(validation) == 'function') {
    return validation(filename, mimetype);
  }

  // validation is a key to a specific validating behaviour
  if (validationKeys.indexOf(validation) != -1) {
    return validationMap[validation](filename, mimetype);
  }

  // else: no specific validating behaviour found
  return false;
}


// gets a filename extension
function getExtension(filename) {
  return filename.split('.').pop();
}

// default options
var defaultUploadOptions = {
  fileFolder: null,
  fileRoute: '/uploads/',
  validation: null, 
}
var defaultImageUploadOptions = defaultUploadOptions;
var defaultFileUploadOptions = defaultUploadOptions;


// exporting...

exports.handleValidation = handleValidation;

exports.defaultUploadOptions = defaultUploadOptions;
exports.defaultImageUploadOptions = defaultImageUploadOptions;
exports.defaultFileUploadOptions = defaultFileUploadOptions;
