var coffee = require('coffee-script');
var fs = require('fs');
var through = require('through');
var convert = require('convert-source-map');
var sha1 = require('sha1');

function isCoffee (file) {
    return (/\.((lit)?coffee|coffee\.md)$/).test(file);
}

function isLiterate (file) {
    return (/\.(litcoffee|coffee\.md)$/).test(file);
}

function ParseError(error, src, file) {
    /* Creates a ParseError from a CoffeeScript SyntaxError
       modeled after substack's syntax-error module */
    SyntaxError.call(this);

    this.message = error.message;

    this.line = error.location.first_line + 1; // cs linenums are 0-indexed
    this.column = error.location.first_column + 1; // same with columns

    var markerLen = 2;
    if(error.location.first_line === error.location.last_line) {
        markerLen += error.location.last_column - error.location.first_column;
    }
    this.annotated = [
        file + ':' + this.line,
        src.split('\n')[this.line - 1],
        Array(this.column).join(' ') + Array(markerLen).join('^'),
        'ParseError: ' + this.message
    ].join('\n');
}

ParseError.prototype = Object.create(SyntaxError.prototype);

ParseError.prototype.toString = function () {
    return this.annotated;
};

ParseError.prototype.inspect = function () {
    return this.annotated;
};


function compile(file, data, callback) {
  var hash = sha1(data);
  var cachePath = '/tmp/coffeeify_cache/';
  var path = cachePath + hash;

  fs.exists(path, function(exists) {
    if (exists) {
      fs.readFile(path, function(err, cached) {
          if (err) throw err;
          callback(null, cached.toString());
        });
    } else {
      compileInner(file, data, function(err, compiledData) {
        if (compiledData) {
          try { fs.mkdirSync(cachePath); } catch  (e) {}
          fs.writeFileSync(path, compiledData);
          callback(null, compiledData);
        } else {
          callback(err);
        }
      });
    }
  });
};

function compileInner(file, data, callback) {
    var compiled;
    try {
        compiled = coffee.compile(data, {
            sourceMap: coffeeify.sourceMap,
            generatedFile: file,
            inline: true,
            bare: true,
            literate: isLiterate(file)
        });
    } catch (e) {
        var error = e;
        if (e.location) {
            error = new ParseError(e, data, file);
        }
        callback(error);
        return;
    }

    if (coffeeify.sourceMap) {
        var map = convert.fromJSON(compiled.v3SourceMap);
        map.setProperty('sources', [file]);
        callback(null, compiled.js + '\n' + map.toComment() + '\n');
    } else {
        callback(null, compiled + '\n');
    }
    
}

function coffeeify(file) {
    if (!isCoffee(file)) return through();

    var data = '', stream = through(write, end);

    return stream;

    function write(buf) {
        data += buf;
    }

    function end() {
        compile(file, data, function(error, result) {
            if (error) stream.emit('error', error);
            stream.queue(result);
            stream.queue(null);
        });
    }
}

coffeeify.compile = compile;
coffeeify.isCoffee = isCoffee;
coffeeify.isLiterate = isLiterate;
coffeeify.sourceMap = true; // use source maps by default

module.exports = coffeeify;
