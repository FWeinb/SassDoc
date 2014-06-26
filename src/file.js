'use strict';

var fs     = require('fs');
var rimraf = require('rimraf');
var swig   = require('swig');
var extras = require('swig-extras');
var Q      = require('q');
var parser = require('./parser');
var utils  = require('./utils');
var logger = require('./log');
extras.useFilter(swig, 'markdown');

/**
 * Data holder
 * @constructs
 */
function Data() {
  this.data = [];
  this.index = {};
}

/**
 * Push a value into Data
 * @param {Object} value
 */
Data.prototype.push = function (value) {
  this.data.push(value);
  this.index[value.name] = value;
};

/**
 * Create a data object from an array
 * @param  {Array} array
 * @return {Data}
 */
Data.fromArray = function (array) {
  var data = new Data();
  array.forEach(data.push.bind(data));
  return data;
};

exports = module.exports = {

  /**
   * Folder API
   */
  folder: {
    /**
     * @see {@link http://nodejs.org/api/fs.html#fs_fs_readdir_path_callback}
     * @see {@link https://github.com/kriskowal/q/wiki/API-Reference#interfacing-with-nodejs-callbacks}
     */
    read: Q.denodeify(fs.readdir),

    /**
     * @see {@link http://nodejs.org/api/fs.html#fs_fs_mkdir_path_mode_callback}
     * @see {@link https://github.com/kriskowal/q/wiki/API-Reference#interfacing-with-nodejs-callbacks}
     */
    create: Q.denodeify(fs.mkdir),
    
    /**
     * @see {@link https://github.com/isaacs/rimraf}
     * @see {@link https://github.com/kriskowal/q/wiki/API-Reference#interfacing-with-nodejs-callbacks}
     */
    remove: Q.denodeify(rimraf),
    
    /**
     * Remove then create a folder
     * @param  {String} folder
     * @return {Q.Promise}
     */
    refresh: function (folder) {
      return exports.folder.remove(folder).then(function() {
        logger.log('Folder `' + folder + '` successfully removed.');
        return exports.folder.create(folder);
      }, function () {
        return exports.folder.create(folder);
      });
    },

    /**
     * Parse a folder
     * @param  {String} folder
     * @return {Q.Promise}
     */
    parse: function (folder) {
      return exports.folder.read(folder).then(function (files) {
        var path, 
            promises = [],
            data = [];

        files.forEach(function (file) {
          path = folder + '/' + file;

          // Folder
          if (exports.isDirectory(path)) {
            promises.push(exports.folder.parse(path).then(function (response) {
              data = data.concat(response);
            }));
          }

          // SCSS file
          else if (utils.getExtension(path) === "scss") {
            promises.push(exports.file.process(path).then(function (response) {
              data = data.concat(response);
            }));
          }

          // Else
          else {
            logger.log('File `' + path + '` is not a `.scss` file. Omitted.');
          }
        });

        return Q.all(promises).then(function () {
          return data;
        });

      }, function (err) {
        console.error(err);
      });
    }
  },

  /**
   * File API
   */
  file: {
    /**
     * @see {@link http://nodejs.org/api/fs.html#fs_fs_readfile_filename_options_callback}
     * @see {@link https://github.com/kriskowal/q/wiki/API-Reference#interfacing-with-nodejs-callbacks}
     */
    read: Q.denodeify(fs.readFile),

    /**
     * @see {@link http://nodejs.org/api/fs.html#fs_fs_writefile_filename_data_options_callback}
     * @see {@link https://github.com/kriskowal/q/wiki/API-Reference#interfacing-with-nodejs-callbacks}
     */
    create: Q.denodeify(fs.writeFile),

    /**
     * @see {@link http://nodejs.org/api/fs.html#fs_fs_unlink_path_callback}
     * @see {@link https://github.com/kriskowal/q/wiki/API-Reference#interfacing-with-nodejs-callbacks}
     */
    remove: Q.denodeify(fs.unlink),

    /**
     * Process a file
     * @param  {String} file
     * @return {Q.Promise}
     */
    process: function (file) {
      return exports.file.read(file, 'utf-8').then(function (data) {
        return parser.parseFile(data);
      });
    },

    /**
     * Copy a file
     * @param  {String} source
     * @param  {String} destination
     * @return {Q.Promise}
     */
    copy: function (source, destination) {
      return fs.createReadStream(source).pipe(fs.createWriteStream(destination));
    }
  },

  /**
   * Test if path is a directory
   * @param  {String}  path
   * @return {Boolean}
   */
  isDirectory: function (path) {
    return fs.lstatSync(path).isDirectory();
  },

  /**
   * Dump CSS
   * @param  {String} destination
   * @return {Q.Promise}
   */
  dumpAssets: function (destination) {
    return exports.folder.create(destination + '/css').then(function () {
      return exports.file.copy(__dirname + '/../assets/css/styles.css', destination + '/css/styles.css');
    }, function (err) {
      console.error(err);
    });
  },

  /**
   * Generate a document
   * @param {Array}  data
   * @param {String} destination
   */
  generate: function (data, destination) {
    var template = swig.compileFile(__dirname + '/../assets/templates/docs.html.swig');
    
    return exports.file.create(destination, template({ 'data': data }));
  },

  /**
   * Get data
   */
  getData: function (folder) {
    return exports.folder.parse(folder).then(function (response) {
      var data = Data.fromArray(response);
      exports.compileAliases(data);
      return exports.splitData(data.data.sort(function (a, b) {
        if (a.name > b.name) return 1;
        if (a.name < b.name) return -1;
        return 0;
      }));
    });
  },

  splitData: function (data) {
    var _data = {
      'functions': [],
      'mixins': [],
      'variables': []
    };

    data.forEach(function (item) {
      _data[item.type + 's'].push(item);
    });

    return _data;
  },

  /**
   * Compile aliases for each function
   */
  compileAliases: function (data) {
    for (var item in data.index) {
      if (!data.index[item].alias) {
        continue;
      }

      if (typeof data.index[data.index[item].alias].aliased === "undefined") {
        data.index[data.index[item].alias].aliased = [];
      }
      
      data.index[data.index[item].alias].aliased.push(item);
    }
  }

};
