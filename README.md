# gulp-lazysprite

[![NPM](https://nodei.co/npm/gulp-lazysprite.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/gulp-lazysprite/)

 Better suit for `gulp-sass` and `node-sass-asset-functions`.


> Generate sprites from stylesheets.

Plugin that generate sprites from your stylesheets (using [spritesmith](https://github.com/Ensighten/spritesmith)) and then updates image references.

## Getting started

If you haven't used [gulp](http://gulpjs.com) before, be sure to check out the [Getting Started](https://github.com/gulpjs/gulp/blob/master/docs/getting-started.md) guide.

Install with [npm](https://npmjs.org/package/gulp-lazysprite)

```
npm install gulp-lazysprite --save-dev
```

## Overview

Sprite generator is a gulp task, which accepts options object and returns two streams for style and image piping.

Here quick example of simple way usage:

```javascript
var gulp = require('gulp');
var sprite = require('gulp-lazysprite');

gulp.task('sprites', function() {
    var spriteOutput;

	spriteOutput = gulp.src("./src/css/*.css")
		.pipe(sprite({
            baseUrl:         "./src/image",
            spriteSheetName: "sprite.png",
            spriteSheetPath: "/dist/image"
		}));

    spriteOutput.css.pipe(gulp.dest("./dist/css"));
    spriteOutput.img.pipe(gulp.dest("./dist/image"));
});
```

Sass or Less:

```javascript
gulp.task('style',function(){
    var spriteOutput;
    spriteOutput = gulp.src(srcPath+'/css/**/*.@(scss|css)')
    .pipe(sass()) // .pipe(less())
    .pipe(spriter({
        baseUrl: "./",
        spriteSheetName:"[name].sprite.png",// repalce `[name]` to filename
        spriteSheetPath: "../images/sprite",
        filter: [
            function(image) {
                return !(image.url.indexOf("?__sprite") === -1);  
            }
        ]
        verbose:true
    }))

    spriteOutput.css.pipe(gulp.dest(distPath+'/css'));
    spriteOutput.img.pipe(gulp.dest(distPath+'/images/sprite'));
});

```


or handle sprites first.

```javascript

var merge = require('merge-stream');

gulp.task('csssprite', ['copyscss'], function() {
    let spriteOutput;
    spriteOutput = gulp.src(config.scss + '/*.@(scss|css)')
        .pipe(plumber())
        .pipe(spriter({
            baseUrl: "./",
            spriteSheetName:"[name].sprite.png",// repalce `[name]` to filename
            spriteSheetPath: "../images/sprite",
            filter: [
                function(image) {
                    return !(image.url.indexOf("?__sprite") === -1);  
                }
            ]
            verbose:true
        })); // css sprite gen
    spriteOutput.css.pipe(gulp.dest(config.destScss));
    spriteOutput.img.pipe(gulp.dest(config.destImages));
    return merge(spriteOutput.css, spriteOutput.img);
})

// see the parameter `options.imageUrl`

// after that handle sass/less

```


Of course you may need to have more flexible configuration for spriting. And this plugin can give you something more!

## Options

Sprite generator options is an object, that mix [spritesmith](https://github.com/Ensighten/spritesmith)
options and plugin specific options.

**Spritesmith parameters** *(all is optional)*:

Property     | Necessary | Type     | Plugin default value
-------------|-----------|----------|---------------------
[engine]     | no        | `String` | `"pixelsmith"`
[algorithm]  | no        | `String` | `"top-down"`
[padding]    | no        | `Number` | `0`
[engineOpts] | no        | `Object` | `{}`
[exportOpts] | no        | `Object` | `{}`

More detailed explanation you can find on the [official page of spritesmith](https://github.com/Ensighten/spritesmith).

**Plugin options** are:

Property          | Necessary | Type         | Plugin default value
------------------|-----------|--------------|-----------
spriteSheetName   | **yes**   | `String`     | `null`
[spriteSheetPath] | no        | `String`     | `null`
[styleSheetName]  | np        | `String`     | `null`
[baseUrl]         | no        | `String`     | `"./"`
[imageUrl]        | no        | `Object`     | `{imagesPath: './images'}`
[retina]          | no        | `Boolean`    | `true`
[filter]          | no        | `Function[]` | `[]`
[groupBy]         | no        | `Function[]` | `[]`
[accumulate]      | no        | `Boolean`    | `false`
[verbose]         | no        | `Boolean`    | `false`

More detailed explanation is below.

#### options.spriteSheetName
Type: `String`
Default value: `null`

The one and last necessary parameter. Defines which *base* will have the name of the output sprite. Base means that if you will
group your sprites by some criteria, name will change.

#### options.spriteSheetPath
Type: `String`
Default value: `null`

Can define relative path of references in the output stylesheet.

#### options.styleSheetName
Type: `String`
Default value: `null`

Defines the name of the output stylesheet.

#### options.baseUrl
Type: `String`
Default value: `./`

Defines where to find relatively defined image references in the input stylesheet.

#### options.imageUrl
Type: `Object`
Default value: `{imagesPath: './images'}`

Defines imagesPath for sass (`image-url`) where to find relatively defined image references in the input stylesheet.

#### options.retina
Type: `Boolean`
Default value: `true`

Defines whether or not to search for retina mark in the filename. If `true` then it will look for `@{number}x` syntax.
For example: `image@2x.png`.

#### options.filter
Type: `Function[]`, `Function`
Default value: `[]`

Defines which filters apply to images found in the input stylesheet. Each filer called with image object, explained below. Each filter must return `Boolean` or
[thenable `Promise`](https://github.com/promises-aplus/promises-spec), that will be resolved with `Boolean`. Each filter
applies in series.

#### options.groupBy
Type: `Function[]`, `Function`
Default value: `[]`

Defines logic of how to group images found in the input stylesheet. Each grouper called with image object, explained below. Each filter must return `String|Null` or
[thenable `Promise`](https://github.com/promises-aplus/promises-spec), that will be resolved with `String|Null`. Each grouper
applies in series.

#### options.accumulate
Type: `Boolean`
Default value: `false`

Tells sprite-generator to accumulate images from multiple stylesheets. This mean, that images, found in stylesheet `A.css` and `B.css` will be accumulated and grouped in common sprite.
> Note, that if `options.accumulate == true` then `options.styleSheetName` will not be used.

#### options.verbose
Type: `Boolean`
Default value: `false`

### Filtering and grouping

Sprite generator can filter and group images from the input stylesheet.

Built in filters:
- based on meta `skip` boolean flag;
- based on `fs.exists` method to check, whether file exists or not.

Built in groupers:
- based on @2x image naming syntax, will produce `sprite.@{number}x.png` naming. (`@{number}x` image group).

You can of course define your own filters or groupers. It will all based on main argument - the image object.

### The Image object

Every filter or grouper is called with `image` object, that have these properties:

Property    | Type       | Explanation
------------|------------|---------------------
replacement | `String`   | String, found by pattern in the input stylesheet
url         | `String`   | Url for image fount in the input stylesheet
path        | `String`   | Resolved path for the image
group       | `String[]` | List of string, representing groups of image
isImageUrl  | `Boolean`  | Boolean flag of `image-url`
isRetina    | `Boolean`  | Boolean flag of retina image (@2x syntax)
retinaRatio | `Number`   | Ratio of retina image (@2x, @3x => 2, 3)
meta        | `Object`   | Object of meta properties, defined in doc block (will explain below).


### Doc block meta properties

You can also define some properties for the filters and groupers in doc block via this syntax:

`{css definition} /* @meta {valid json} */`

Example:

```css

.my_class {
    background-image: url("/images/my.png"); /* @meta {"sprite": {"skip": true}} */
}

```

***Important!*** Only object in `sprite` property of meta will be available in image object for filters and groupers.


### Flexible example

```javascript

var gulp   = require('gulp'),
    sprite = require('gulp-lazysprite'),
    Q      = require('q'),
    sizeOf = require('image-size');

gulp.task('sprites', function() {
    var spriteOutput;

	spriteOutput = gulp.src("./src/css/*.css")
		.pipe(sprite({
            baseUrl:         "./",
            spriteSheetName: "sprite.png",
            spriteSheetPath: "/dist/image",
            styleSheetName:  "stylesheet.css",

            filter: [
                // this is a copy of built in filter of meta skip
                // do not forget to set it up in your stylesheets using doc block /* */
                function(image) {
                    return !image.meta.skip;
                }
            ],

            groupBy: [
                // group images by width
                // useful when building background repeatable sprites
                function(image) {
                    var deferred = Q.defer();

                    sizeOf(image.path, function(err, size) {
                        deferred.resolve(size.width.toString());
                    });

                    return deferred.promise;
                }
            ]
		});

    spriteOutput.css.pipe(gulp.dest("./dist/css"));
    spriteOutput.img.pipe(gulp.dest("./dist/image"));
});

```

## License

Licensed under the MIT license.


