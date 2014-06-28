'use strict';

var utils = require('./utils');

// Tokens
var LINE_BREAK = "\n";
var SPACE = " ";
var TAB = "\t";
var LBRACE = "{";
var RBRACE = "}";
var LPAREN = "(";
var RPAREN = ")";
var LBRACK = "[";
var RBRACK = "]";

exports = module.exports = {

  /**
   * Parse a file
   * @param  {String} string - File content
   * @return {Array}           Documented items
   */
  parseFile: function (string) {
    this.string = string;
    this.pointer = 0;

    var __pointer;                     // Temporary pointer
    var item;                          // Current item
    var character;                     // Current character
    var items = [];                    // Array of documented items
    var buffer = "";                   // Current buffer
    var isPreviousLineComment = false; // Is previous line a comment?

    // Start parsing
    while (this.pointer < this.string.length) {
      character = this.current();
      this.next();
      this.trim();

      // Opening comment
      if (character === "/") {
        // Get multi-lines comment
        if (this.current() === "*") {
          buffer += this.getMultiLineComment();
          isPreviousLineComment = true;
        }

        // Get single-line comments
        else if (this.current() === "/") {
          buffer += this.getSingleLineComment();
          isPreviousLineComment = true;
        }

        else {
          throw "Unexpected series of characters: `" + character + this.current() + "`.";
        }
      }

      // Skip line breaks
      else if (character === LINE_BREAK) {
        continue;
      }

      else {
        // Comments parsed
        if (isPreviousLineComment === true) {
          // Get next line (function/mixin/variable declaration)
          buffer += character + this.consume(LINE_BREAK) + LINE_BREAK;

          // Store current pointer
          __pointer = this.pointer;

          // Push
          item = this.parseBuffer(buffer); 
          items.push(item);

          // Reset
          this.string = string;
          this.pointer = __pointer;
          isPreviousLineComment = false;
          buffer = "";
        }

        else {
          this.consume(LINE_BREAK);
        }
      }
    }

    return items;
  },

  /**
   * Define a multi-lines comment
   * @return {String}
   */
  getMultiLineComment: function () {
    var buffer = "";

    while (this.current() != "/") {
      buffer += this.consume("*");
    }

    return buffer + this.consume(LINE_BREAK);
  },

  /**
   * Define a series of single-line comments
   * @return {String}
   */
  getSingleLineComment: function () {
    var buffer = "";
    this.previous(); // Roll back for first line

    while (this.current() === "/") {
      this.consume("/"); // First slash
      this.consume("/"); // Second slash
      this.trim();       // Leading spaces

      if (this.current() !== "/") {
        buffer += this.consume(LINE_BREAK) + LINE_BREAK;
      }
    }

    return buffer;
  },

  /**
   * Parse a comment to define a documented item
   * @param  {String} comment to parse 
   * @return {Object}
   */
  parseBuffer: function (string) {
    this.pointer = 0;
    this.string = string;
    this.item = {};
    var character;

    // Start parsing
    while (this.pointer < this.string.length) {
      character = this.current();
      this.next();

      // Skip empty characters and leading slashes or stars
      if ([LINE_BREAK, SPACE, TAB, "/", "*"].indexOf(character) !== -1) {
        // Skip.
      } 

      // Capture annotation (or @mixin/@function)
      else if (character === "@") {
        this.captureAnnotation(this.consume([SPACE, TAB, LINE_BREAK]));
      }

      // Capture variable
      else if (character === "$") {
        this.captureVariable();
      }

      // Fill description
      else {
        if (typeof this.item.description === "undefined") {
          this.item.description = character + this.consume(LINE_BREAK);
        }
        else {
          this.item.description += LINE_BREAK + character + this.consume(LINE_BREAK);
        }
      }
    }

    // @todo Make sure we don't capture regular comments
    return this.item;
  },
  
  /**
   * Returns current character
   * @return {String} - Current character
   */
  current: function () {
    return this.string.charAt(this.pointer);
  },

  /**
   * Move pointer to the right
   * @return {Object}
   */
  next: function () {
    this.pointer++;
    return this;
  },
    
  /**
   * Move pointer to the left
   * @return {Object}
   */
  previous: function () {
    this.pointer--;
    return this;
  },

  /**
   * Consume token or throw error
   * @param  {Array|String} tokens - Token to be consumed
   * @throws Unexpected end of stream.
   * @return {String}
   */
  consume: function (tokens) {
    var character, string = "";

    while (this.pointer <= this.string.length) {
      character = this.current();
      this.next();

      if (tokens.indexOf(character) !== -1) {
        return string;
      }

      string += character;
    }

    throw "Unexpected end of stream.";
  },

  /**
   * Consume any leading space
   * @return {Object}
   */
  trim: function () {
    while (this.current().match(/\s|\t/)) {
      this.next();
    }
    return this;
  },

  /**
   * Capture annotation and defer treatment to a specific function
   * @param  {String} annotation
   */
  captureAnnotation: function (annotation) {
    this.trim();

    switch (annotation) {
      // Capture a simple flag
      // i.e. everything after the flag until end of line
      case "access":
      case "since":
      case "alias":
      case "author":
        this.captureSimple(annotation);
        break;

      // Capture the @deprecated flag
      // Almost like a simple capture
      // Except value is optional
      case "deprecated":
        this.captureDeprecated();
        break;

      // Capture an array flag
      // Like a simple flag
      // But there can be multiple instances of them
      case "throws":
      case "exception":
      case "todo":
        this.captureArray(annotation);
        break;

      case "requires":
      case "require":
        this.captureRequires();
        break;

      // @ignore lines shouldn't be documented
      // Hence, just move the pointer to the next line
      case "ignore":
        this.consume(LINE_BREAK);
        break;

      // Capture a @param (or @arg or @argument)
      case "param":
      case "arg":
      case "argument":
        this.captureParam();
        break;

      // Capture a @link
      case "link":
        this.captureLink();
        break;

      // Capture a @return (or @returns)
      case "return":
      case "returns":
        this.captureReturn();
        break;

      // Capture a @var documentation
      case "var":
        this.captureVariableDoc();
        break;

      // Capture a @mixin/@function signature
      // in order to retrieve the name
      case "function":
      case "mixin":
        this.item.type = annotation;
        this.captureSignature();
        break;

      default:
        throw "Unknown annotation `" + annotation + "`.";
    }
  },

  /**
   * Capture a simple value
   * @param  {String} key 
   */
  captureSimple: function (key) {
    this.item[key] = this.consume(LINE_BREAK).trim();
  },

  /**
   * Capture an array value
   * @param  {String} key
   */
  captureArray: function (key) {
    if (key === "exception") {
      key = "throws";
    }

    var value = this.consume(LINE_BREAK).trim();

    if (typeof this.item[key] === "undefined") {
      this.item[key] = [];
    }
    
    this.item[key].push(value);
  },

  /**
   * Capture signature
   */
  captureSignature: function () {
    this.item.name = this.consume(LPAREN).trim();
    this.pointer = this.string.length + 1;
  },

  /**
   * Capture deprecated
   */
  captureDeprecated: function () {
    if (this.current() === "@") {
      this.item.deprecated = "";
      this.previous();
    }
    else {
      this.item.deprecated = this.consume(LINE_BREAK);
    }
  },

  /**
   * Capture a parameter
   */
  captureParam: function () {
    var defaultValue, description, param = {};

    // Get the type
    this.trim();
    param.type = this.captureType();

    // Get the name
    this.trim();
    this.consume("$");
    param.name = this.consume([SPACE, TAB, LINE_BREAK]).trim();
    this.trim();

    // If there is a default value, get the default value
    if (this.current() === LPAREN) {
      this.next();
      defaultValue = this.consume(RPAREN);
      this.trim();
    }
    
    // If there is an hyphen, consume it
    if (this.current() === "-") {
      this.next();
      this.trim();
    }

    // If there is a description, get the description
    if (this.current() !== "@") {
      description = this.consume(LINE_BREAK);
    }
    else {
      this.previous();
    }

    param.defaultValue = (defaultValue || "").trim();
    param.description = (description || "").trim();

    // Push the whole thing
    if (typeof this.item.parameters === "undefined") {
      this.item.parameters = [];
    }

    this.item.parameters.push(param);
  },

  /**
   * Capture a return flag
   */
  captureReturn: function () {
    var description, returns = {};

    // Eat the left brace, and store the type
    returns.type = this.captureType();
    this.trim();

    // If there is a description, get the description
    if (this.current() !== "@") {
      description = this.consume(LINE_BREAK);
    }
    // If we've already jumped line, roll back
    else {
      this.previous();
    }

    returns.description = (description || "").trim()
    this.item.returns = returns;
  },

  /**
   * Capture a link
   */
  captureLink: function () {
    var label, link = {};

    // Get url
    link.url = this.consume([SPACE, TAB, LINE_BREAK]).trim();
    this.trim();

    // If there is a label, get the label
    if (this.current() !== "@") {
      label = this.consume(LINE_BREAK);
    }
    // If we've already jumped line, roll back
    else {
      this.previous();
    }

    link.label = (label || link.url).trim();

    // Push the whole thing
    if (typeof this.item.links === "undefined") {
      this.item.links = [];
    }

    this.item.links.push(link);
  },

  /**
   * Capture a variable documentation
   */
  captureVariableDoc: function () {
    var type, description;

    this.item.type = "variable";
    this.item.datatype = this.captureType();
    this.trim();

    // If there is an hyphen, consume it
    if (this.current() === "-") {
      this.consume("-");
      this.trim();
    }

    // If there is a description, get the description
    if (this.current() !== "$") {
      this.item.description = this.consume(LINE_BREAK);
    }

    else {
      this.item.description = "";
    }
  },

  /**
   * Capture a variable definition
   */
  captureVariable: function () {
    this.item.name = this.consume([SPACE, TAB, ":"]);
    this.trim();

    if (this.current() === ":") {
      this.next();
      this.trim();
    }

    this.item.value = this.consume(";");

    if (this.item.value.indexOf("!global") !== -1) {
      this.item.access = "global";
      this.item.value = this.item.value.replace("!global", "").trim();
    }

    else {
      this.item.access = "scoped";
    }
  },

  /**
   * Make sure type is a valid Sass type
   * @param {String} type
   */
  isValidType: function (type) {
    return ["*", "arglist", "bool", "color", "list", "map", "null", "number", "string"].indexOf(type.toLowerCase()) !== -1;
  },

  /**
   * Capture type
   * @return {String}
   */
  captureType: function () {
    this.consume(LBRACE);
    this.trim();

    return this.consume(RBRACE).trim().split(/[\s\t]\|[\s\t]/);
  },

  /**
   * Capture requires
   */
  captureRequires: function () {
    var requires = {};

    if (this.current() === LBRACE) {
      this.consume(LBRACE);
      this.trim();
      requires.type = this.consume(RBRACE).trim();
      
      if (['function', 'mixin', 'var'].indexOf(requires.type) === -1) {
        throw requires.type + " is not a valid type of @requires. Please set either `function`, `mixin` or `var`.";
      }

      this.trim();
    }

    requires.item = this.consume(LINE_BREAK);

    if (typeof this.item.requires === "undefined") {
      this.item.requires = [];
    }

    this.item.requires.push(requires);
  }

};

/**
 * Extend String primitive to add a trim function
 * @return {string} trimed string
 */
String.prototype.trim = function () {
  return this.replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g,"").replace(/\s+/g," ");
};
