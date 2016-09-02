var path        = require('path'),
    spritesmith = require('spritesmith'),
    _           = require('lodash'),
    colors      = require('colors'),
    fs          = require('fs'),
    gutil       = require('gulp-util'),
    util        = require("util"),
    Q           = require('q'),
    through     = require('through2'),
    crypto      = require('crypto'),
    File        = gutil.File,
    PLUGIN_NAME = "gulp-lazysprite",
    debug;
var log = function() {
    var args, sig;
    args = Array.prototype.slice.call(arguments);
    sig = '[' + colors.green(PLUGIN_NAME) + ']';
    args.unshift(sig);
    gutil.log.apply(gutil, args);
};

var md5 = function(text,len){
    var hash = crypto.createHash('md5').update(text).digest('hex');
    if(len > 0){
        hash = hash.substr(0,len)
    }
    return hash;
};

var async = (function(){
    // pick from // "async": "^0.2.10"
    var _each = _.forEach,
        _map = _.map;
    var _filter = function (eachfn, arr, iterator, callback) {
        var results = [];
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        eachfn(arr, function (x, callback) {
            iterator(x.value, function (v) {
                if (v) {
                    results.push(x);
                }
                callback();
            });
        }, function (err) {
            callback(_map(results.sort(function (a, b) {
                return a.index - b.index;
            }), function (x) {
                return x.value;
            }));
        });
    };
    var _asyncMap = function (eachfn, arr, iterator, callback) {
        arr = _map(arr, function (x, i) {
            return {index: i, value: x};
        });
        if (!callback) {
            eachfn(arr, function (x, callback) {
                iterator(x.value, function (err) {
                    callback(err);
                });
            });
        } else {
            var results = [];
            eachfn(arr, function (x, callback) {
                iterator(x.value, function (err, v) {
                    results[x.index] = v;
                    callback(err);
                });
            }, function (err) {
                callback(err, results);
            });
        }
    };
    var only_once = function(fn) {
        var called = false;
        return function() {
            if (called) throw new Error("Callback was already called.");
            called = true;
            fn.apply(global || root, arguments);
        }
    };
    var each = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        _each(arr, function (x) {
            iterator(x, only_once(done) );
        });
        function done(err) {
          if (err) {
              callback(err);
              callback = function () {};
          }
          else {
              completed += 1;
              if (completed >= arr.length) {
                  callback();
              }
          }
        }
    };

    var doParallel = function (fn) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return fn.apply(null, [each].concat(args));
        };
    };

    var eachSeries = function (arr, iterator, callback) {
        callback = callback || function () {};
        if (!arr.length) {
            return callback();
        }
        var completed = 0;
        var iterate = function () {
            iterator(arr[completed], function (err) {
                if (err) {
                    callback(err);
                    callback = function () {};
                }
                else {
                    completed += 1;
                    if (completed >= arr.length) {
                        callback();
                    }
                    else {
                        iterate();
                    }
                }
            });
        };
        iterate();
    };

    var reduce = function (arr, memo, iterator, callback) {
        eachSeries(arr, function (x, callback) {
            iterator(memo, x, function (err, v) {
                memo = v;
                callback(err);
            });
        }, function (err) {
            callback(err, memo);
        });
    };
    return  {
        reduce: reduce,
        filter: doParallel(_filter),
        map: doParallel(_asyncMap),
        each: each,
        eachSeries: eachSeries
    };
})();

var getImages = (function() {
    var httpRegex, imageRegex, filePathRegex, pngRegex, retinaRegex;
    imageRegex    = new RegExp('{[^{]*?background(?:-image)?:\\s*((?:image-)?url\\((["\']?)([\\w\\d\\s!:./\\-\\_@]*\\.[\\w?#]+)\\2\\))[^;]*\\;(?:\\s*\\/\\*\\s*@meta\\s*(\\{.*\\})\\s*\\*\\/)?[^}]*?}', 'ig');
    // imageRegex    = new RegExp('background(?:-image)?:[\\s]?(?:image-)?url\\(["\']?([\\w\\d\\s!:./\\-\\_@]*\\.[\\w?#]+)["\']?\\)[^;]*\\;(?:\\s*\\/\\*\\s*@meta\\s*(\\{.*\\})\\s*\\*\\/)?', 'ig');
    retinaRegex   = new RegExp('@(\\d)x\\.[a-z]{3,4}$', 'ig');
    httpRegex     = new RegExp('http[s]?', 'ig');
    pngRegex      = new RegExp('\\.png(?:\\?\\w*)?$', 'i');
    filePathRegex = new RegExp('["\']?([\\w\\d\\s!:./\\-\\_@]*\\.[\\w?#]+)["\']?', 'ig');
    autoSizeRegex = new RegExp('{[^{]*?(?=(?:(?!width:)[\\s\\S])*width:\\s*([^;]+);)(?:(?!height:)[\\s\\S])*height:\\s*([^;]+);[^}]*?}','ig');

    return function(file, options) {
        var reference, images, block,
            retina, filePath,
            url, image, meta, basename,
            makeRegexp, content;

        content = file.contents.toString();

        images = [];

        basename = path.basename(file.path);

        // log(file.path);

        makeRegexp = (function() {
            var matchOperatorsRe = /[|\\/{}()[\]^$+*?.]/g;

            return function(str) {
                return str.replace(matchOperatorsRe,  '\\$&');
            }
        })();

        while ((reference = imageRegex.exec(content)) != null) {

            block = reference[0];
            url   = reference[3];
            meta  = reference[4];

            var isImageUrl = /background(?:-image)?:[\s]?image-url/.exec(block) != null;
            
            
            image = {
                replacement: new RegExp('background(?:-image)?:\\s*(?:image-)?url\\(\\s?(["\']?)\\s?'+ makeRegexp(url) + '\\s?\\1\\s?\\)[^;]*\\;', 'gi'),
                url:         url,
                group:       [],
                isRetina:    false,
                retinaRatio: 1,
                autoSize: false,
                meta:        {}
            };

            if (httpRegex.test(url)) {
                options.verbose && log(colors.cyan(basename) + ' > ' + url + ' has been skipped as it\'s an external resource!');
                continue;
            }

            if (!pngRegex.test(url)) {
                options.verbose && log(colors.cyan(basename) + ' > ' + url + ' has been skipped as it\'s not a PNG!');
                continue;
            }

            if (meta) {
                try {
                    meta = JSON.parse(meta);
                    meta.sprite && (image.meta = meta.sprite);
                } catch (err) {
                    log(colors.cyan(basename) + ' > ' + colors.white('Can not parse meta json for ' + url) + ': "' + colors.red(err) + '"');
                }
            }

            if (options.retina && (retina = retinaRegex.exec(url))) {
                image.isRetina = true;
                image.retinaRatio = retina[1];
            }

            filePath = filePathRegex.exec(url)[0].replace(/['"]/g, '');
            filePath = filePath.replace(/\?\w*$/,'');
            if(isImageUrl){
                filePath = path.resolve(options.imageUrl.imagesPath, filePath);
            } else{
                // if url to image is relative
                if(filePath.charAt(0) === "/") {
                    filePath = path.resolve(options.baseUrl + filePath);
                } else {
                    filePath = path.resolve(file.path.substring(0, file.path.lastIndexOf(path.sep)), filePath);
                }
            }
            if(!autoSizeRegex.test(block.replace(/\/\*[^\*]+\*\//g,"").replace(/\/\/[^\n]*/g,""))){
                // \/\*[^\*]+\*\/ 
                // \/\/[^\n]+
                image.autoSize = true;
            }
            image.path = filePath;
            image.isImageUrl = isImageUrl;

            // reset lastIndex
            [httpRegex, pngRegex, retinaRegex, filePathRegex, autoSizeRegex].forEach(function(regex) {
                regex.lastIndex = 0;
            });

            images.push(image);
        }

        // reset lastIndex
        imageRegex.lastIndex = 0;
        // remove nulls and duplicates
        images = _.chain(images)
            .filter()
            .uniqBy(function(image) {
                return image.path;
            })
            .value();
        return Q(images)
            // apply user filters
            .then(function(images) {
                return Q.Promise(function(resolve, reject) {
                    async.reduce(
                        options.filter,
                        images,
                        function(images, filter, next) {
                            async.filter(
                                images,
                                function(image, ok) {
                                    Q(filter(image)).then(ok);
                                },
                                function(images) {
                                    next(null, images);
                                }
                            );
                        },
                        function(err, images) {
                            if (err) {
                                return reject(err);
                            }
                            resolve(images);
                        }
                    );
                });
            })
            // apply user group processors
            .then(function(images) {
                return Q.Promise(function(resolve, reject) {
                    async.reduce(
                        options.groupBy,
                        images,
                        function(images, groupBy, next) {
                            async.map(images, function(image, done) {
                                Q(groupBy(image))
                                    .then(function(group) {
                                        if (group) {
                                            image.group.push(group);
                                        }

                                        done(null, image);
                                    })
                                    .catch(done);
                            }, next);
                        },
                        function(err, images) {
                            if (err) {
                                return reject(err);
                            }

                            resolve(images);
                        }
                    );
                });
            });
    }
})();

var callSpriteSmithWith = (function() {
    var GROUP_DELIMITER = ".",
        GROUP_MASK = "*";

    // helper function to minimize user group names symbols collisions
    function mask(toggle) {
        var from, to;

        from = new RegExp("[" + (toggle ? GROUP_DELIMITER : GROUP_MASK) + "]", "gi");
        to = toggle ? GROUP_MASK : GROUP_DELIMITER;

        return function(value) {
            return value.replace(from, to);
        }
    }

    return function(images, options) {
        var all;
        all = _.chain(images)
            .groupBy(function(image) {
                var tmp;

                tmp = image.group.map(mask(true));
                tmp.unshift('_');

                return tmp.join(GROUP_DELIMITER);
            })
            .map(function(images, tmp) {
                var config, ratio;
                config = _.merge({}, options, {
                    src: _.map(images, 'path')
                });

                // enlarge padding, if its retina
                if (_.every(images, function(image) {return image.isRetina})) {
                    ratio = _.chain(images).map('retinaRatio').uniq().value();
                    if (ratio.length == 1) {
                        config.padding = config.padding * ratio[0];
                    }
                }
                return Q.nfcall(spritesmith.run, config).then(function(result) {
                    tmp = tmp.split(GROUP_DELIMITER);
                    tmp.shift();
                    // append info about sprite group
                    result.group = tmp.map(mask(false));

                    return result;
                });
            })
            .value();


        return Q.all(all).then(function(results) {
            debug.images+= images.length;
            debug.sprites+= results.length;
            return results;
        });
    }
})();

var updateReferencesIn = (function() {
    var template;

    template = _.template(
        '<% if(autoSize){%>width: <%= isRetina ? (coordinates.width / retinaRatio) : coordinates.width %>px;\n    '+
        'height: <%= isRetina ? (coordinates.height / retinaRatio) : coordinates.height %>px;\n    <%}%>'+
        'background-image: <%= isImageUrl ? "image-": ""%>url("<%= spriteSheetPath %>?v=<%= fileHash %>");\n    ' +
        'background-position: -<%= isRetina ? (coordinates.x / retinaRatio) : coordinates.x %>px -<%= isRetina ? (coordinates.y / retinaRatio) : coordinates.y %>px;\n    ' +
        'background-size: <%= isRetina ? (properties.width / retinaRatio) : properties.width %>px <%= isRetina ? (properties.height / retinaRatio) : properties.height %>px!important;'
    );

    return function(file) {
        var content = file.contents.toString();

        return function(results) {
            results.forEach(function(images) {
                images.forEach(function(image) {
                    image.fileHash = image.spriteHash;
                    content = content.replace(image.replacement, template(image));
                });
            });

            return Q(content);
        }
    }
})();

var exportSprites = (function() {
    function makeSpriteSheetPath(spriteSheetName, group) {
        var path;

        group || (group = []);

        if (group.length == 0) {
            return spriteSheetName;
        }

        path = spriteSheetName.split('.');
        Array.prototype.splice.apply(path, [path.length - 1, 0].concat(group));

        return path.join('.');
    }

    return function(stream, options, filename) {
        return function(results) {
            results = results.map(function(result) {
                var sprite;

                result.path = makeSpriteSheetPath(options.spriteSheetName, result.group);
                result.path = result.path.replace('[name]',filename);

                sprite = new File({
                    path: result.path,
                    contents: new Buffer(result.image, 'binary')
                });
                result.spriteHash = md5(result.image,8);
                stream.push(sprite);

                options.verbose && log('Spritesheet', result.path, 'has been created');

                return result;
            });         

            return results;
        }
    }
})();

var exportStylesheet = function(stream, options) {
    return function(content) {
        var stylesheet;

        stylesheet = new File({
            path: options.styleSheetName,
            contents: new Buffer(content)
        });

        stream.push(stylesheet);

        options.verbose && log('Stylesheet', options.styleSheetName, 'has been created');
    }
};

var mapSpritesProperties = function(images, options) {
    return function(results) {
        return results.map(function(result) {
            return _.map(result.coordinates, function(coordinates, path) {
                return _.merge(_.find(images, {path: path}), {
                    spriteHash : result.spriteHash,
                    coordinates: coordinates,
                    spriteSheetPath: options.spriteSheetPath ? options.spriteSheetPath + "/" + result.path : result.path,
                    properties: result.properties
                });
            });
        });
    }
};

module.exports = function(options) { 'use strict';
    var stream, styleSheetStream, spriteSheetStream;

    debug = {
        sprites: 0,
        images:  0
    };

    options = _.merge({
        src:        [],
        engine:     "pixelsmith", //"pngsmith", //auto
        algorithm:  "top-down",
        padding:    0,
        engineOpts: {},
        exportOpts: {

        },
        imgOpts: {
            timeout: 30000
        },

        baseUrl:         './',
        imageUrl: {
            imagesPath: './images'
        },
        retina:          true,
        styleSheetName:  null,
        spriteSheetName: null,
        spriteSheetPath: null,
        filter:          [],
        groupBy:         [],
        accumulate:      false,
        verbose:         false
    }, options || {});

    // check necessary properties
    ['spriteSheetName'].forEach(function(property) {
        if (!options[property]) {
            throw new gutil.PluginError(PLUGIN_NAME, '`' + property + '` is required');
        }
    });

    // prepare filters
    if (_.isFunction(options.filter)) {
        options.filter = [options.filter]
    }

    // prepare groupers
    if (_.isFunction(options.groupBy)) {
        options.groupBy = [options.groupBy]
    }

    // add meta skip filter
    options.filter.unshift(function(image) {
        image.meta.skip && options.verbose && log(image.path + ' has been skipped as it meta declares to skip');
        return !image.meta.skip;
    });

    // add not existing filter
    options.filter.push(function(image) {
        var deferred = Q.defer();
        fs.exists(image.path, function(exists) {
            !exists && options.verbose && log(image.path + ' has been skipped as it does not exist!');
            deferred.resolve(exists);
        });

        return deferred.promise;
    });

    // add retina grouper if needed
    if (options.retina) {
        options.groupBy.unshift(function(image) {
            if (image.isRetina) {
                return "@" + image.retinaRatio + "x";
            }

            return null;
        });
    }

    // create output streams

    styleSheetStream = through.obj();
    spriteSheetStream = through.obj();


    var accumulatedFiles = [];

    stream = through.obj(
        function(file, enc, done) {
            if (file.isNull()) {
                this.push(file); // Do nothing if no contents
                return done();
            }

            if (file.isStream()) {
                this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Streams is not supported!'));
                return done();
            }

            if (file.isBuffer()) {
                // postpone evaluation, if we accumulating
                if (options.accumulate) {
                    accumulatedFiles.push(file);
                    stream.push(file);
                    done();
                    return;
                }

                var filename = file.path.split(path.sep).pop().split('.')[0];

                getImages(file, options)
                    .then(function(images) {
                        callSpriteSmithWith(images, options)
                            .then(exportSprites(spriteSheetStream, options, filename))
                            .then(mapSpritesProperties(images, options))
                            .then(updateReferencesIn(file))
                            .then(exportStylesheet(styleSheetStream, _.extend({}, options, { styleSheetName: options.styleSheetName || path.basename(file.path) })))
                            .then(function() {
                                // pipe source file
                                // stream.push(file); 
                                done();
                            })
                            .catch(function(err) {
                                stream.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
                                done();
                            });
                    });


                return null;
            } else {
                this.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Something went wrong!'));
                return done();
            }
        },
        // flush
        function(done) {
            var pending;

            if (options.accumulate) {
                pending = Q
                    .all(accumulatedFiles.map(function(file) {
                        return getImages(file, options);
                    }))
                    .then(function(list) {
                        var images;

                        return _.chain(list)
                            .reduce(function(images, portion) {
                                return images.concat(portion);
                            }, [])
                            .uniqBy(function(image) {
                                return image.path;
                            })
                            .value();
                    })
                    .then(function(images) {
                        return callSpriteSmithWith(images, options)
                            .then(exportSprites(spriteSheetStream, options))
                            .then(mapSpritesProperties(images, options))
                            .then(function(results) {
                                return Q.all(accumulatedFiles.map(function(file) {
                                    return updateReferencesIn(file)(results)
                                        .then(exportStylesheet(styleSheetStream, _.extend({}, options, { styleSheetName: path.basename(file.path) })));
                                }));
                            });
                    })
                    .catch(function(err) {
                        stream.emit('error', new gutil.PluginError(PLUGIN_NAME, err));
                        done();
                    });
            } else {
                pending = Q();
            }

            pending.then(function() {
                
                // end streams
                styleSheetStream.push(null);
                spriteSheetStream.push(null);

                log(util.format("Created %d sprite(s) from %d images, saved %s% requests", debug.sprites, debug.images, debug.images > 0 ? ((debug.sprites / debug.images) * 100).toFixed(1) : 0));

                done();
            });
        }
    );

    stream.css = styleSheetStream;
    stream.img = spriteSheetStream;

    return stream;
};
