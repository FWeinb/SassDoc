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

      exports.postTreatData(data);

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
   * Post treat data to fill missing informations
   * @param  {Object} data
   */
  postTreatData: function (data) {
    exports.compileAliases(data);
    exports.compileRequires(data);
    exports.raiseWarnings(data);
  },

  /**
   * Compile aliases for each item
   * @param  {Object} data
   */
  compileAliases: function (data) {
    var item, name;

    for (name in data.index) {
      item = data.index[name];

      // If item has no @alias, skip
      if (!utils.isset(item.alias)) {
        continue;
      }

      // If @alias maps to a valid item, update aforesaid item
      if (utils.isset(data.index[item.alias])) {

        // If `aliased` key doesn't exist yet, create it
        if (!utils.isset(data.index[item.alias].aliased)) {
          data.index[item.alias].aliased = [];
        }

        data.index[item.alias].aliased.push(item.name);
      }

      // Incorrect @alias
      else {
        logger.log("Item `" + name + " is an alias of `" + item.alias + "` but this item doesn't exist."); 
      }
    }
  },

  /**
   * Compile requires for each item
   * @param  {Object} data
   */
  compileRequires: function (data) {
    var item, name;

    for (name in data.index) {
      item = data.index[name];

      // If item has no @requires, skip
      if (!utils.isset(item.requires)) {
        continue;
      }

      // For each @requires
      for (var i = 0; i < item.requires.length; i++) {
        // If @requires type is defined, skip
        if (utils.isset(item.requires[i].type)) {
          continue;
        } 

        // If @requires maps to a valid item, update aforesaid item
        if (utils.isset(data.index[item.requires[i].item])) {
          data.index[name].requires[i].type = data.index[item.requires[i].item].type;

          // And fill `usedBy` key
          if (!utils.isset(data.index[item.requires[i].item].usedBy)) {
            data.index[item.requires[i].item].usedBy = [];
          }

          data.index[item.requires[i].item].usedBy.push({ 'item': item.name, 'type': item.type });
        }

        // Incorrect @requires
        else {
          logger.log("Item `" + name + " requires `" + item.requires[i].item + "` but this item doesn't exist.");
        }
      }
    }
  },

  /**
   * Raise warning for incoherent or invalid things
   * @param {Object} data
   */
  raiseWarnings: function (data) {
    var name, item, i, j;
    var validTypes = ["*", "arglist", "bool", "color", "list", "map", "null", "number", "string"];
    
    if (logger.enabled === false) {
      return;
    }

    for (name in data.index) {
      item = data.index[name];

      // Incorrect data type in @param
      if (utils.isset(item.parameters)) {
        // For each parameter
        for (i = 0; i < item.parameters.length; i++) {
          // For each possible type for current parameter
          for (j = 0; j < item.parameters[i].type; j++) {
            if (validTypes.indexOf(item.parameters[i].type[j].toLowerCase()) === -1) {
              logger.log("Parameter `" + item.parameters[i].name + "` from item `" + item.name + "` is from type `" + item.parameters[i].type[j] + "` which is not a valid Sass type.");
            }
          }
        }
      }

      // Incorrect data type in @return
      if (utils.isset(item.returns)) {
        // For each possible type in @return
        for (i = 0; i < item.returns.type.length; i++) {
          if (validTypes.indexOf(item.returns.type[i].trim().toLowerCase()) === -1) {
            logger.log("Item `" + item.name + "` can return a `" + item.returns.type[i] + "` which is not a valid Sass type.");
          }
        }
      }

      // Incorrect URL in @link
      if (utils.isset(item.links)) {
        // For each @link
        for (i = 0; i < item.links.length; i++) {
          if (!item.links[i].url.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/)) {
            logger.log("Item `" + item.name + "` has a link leading to an invalid URL (`" + item.links[i].url + "`).");
          }
        }
      }

    }
  }

};
