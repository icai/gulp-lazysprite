#gulp-sprite-generator2


对gulp-sprite-generator(https://www.npmjs.com/package/gulp-sprite-generator) 进行了扩展,支持了以下功能:

1.同时支持background 和 background-image

2.修改了对图片路径的判断,支持路径后面带?查询字符串

3.支持按css文件名生成多个雪碧图 

Demo:

```js
gulp.task('style',function(){
    var spriteOutput;
    spriteOutput = gulp.src(srcPath+'/css/**/*.@(less|css)')
    .pipe(less())
    .pipe(spriter({
        baseUrl: "./",
        spriteSheetName:"[name].sprite.png",//会自动把[name]替换成正在处理文件名
        spriteSheetPath: "../images/sprite",
        filter: [
            function(image) {
                return !(image.url.indexOf("?__sprite") === -1);  //只对?__sprite进行雪碧图合并
            }
        ]
        verbose:true
    }))

    spriteOutput.css.pipe(gulp.dest(distPath+'/css'));
    spriteOutput.img.pipe(gulp.dest(distPath+'/images/sprite'));
});

```