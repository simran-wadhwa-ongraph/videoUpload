var express = require('express');
var app = express();
var http = require("http").createServer(app);
var mongodb = require('mongodb');
var mongoClient = mongodb.MongoClient;
var bodyParser = require('body-parser');
var formidable = require('formidable');
var fileSystem = require('fs');
var { getVideoDurationInSeconds } = require('get-video-duration');

app.use(bodyParser.json({
    limit: "10000mb"
}));
app.use(bodyParser.urlencoded({
    extended: true,
    limit: "10000mb",
    parameterLimit: 1000000
}))
app.use("/public", express.static(__dirname + "/public"));
app.set("view engine", "ejs");

http.listen(3000, function () {
    console.log("server started");
    //creating a database with name 'my_video_streaming'.
    mongoClient.connect("mongodb://localhost:27017", function (error, client) {
        database = client.db("my_video_streaming");
        //this will provide initial Page
        app.get("/", function (request, result) {
            result.render("index")
        })
        //route to the upload video form
        app.get("/upload", function (request, result) {
            result.render("upload")
        })

        // it will save video data in the database and video path  will get store in the folder 'videos' inside public folder.
        app.post("/upload-video", function (request, result) {
            var formData = new formidable.IncomingForm();
            formData.maxFileSize = 1000 * 1024 * 1024;
            formData.parse(request, function (error, fields, files) {
                var title = fields.title;
                var description = fields.description;
                var oldPathVideo = files.video.path;
                //save path in the videos folder inside public folder.
                var newPath = "public/videos/" + new Date().getTime() + "-" + files.video.name;
                fileSystem.rename(oldPathVideo, newPath, function (error) {
                    //get video duration
                    getVideoDurationInSeconds(newPath).then(function (duration) {
                        var hours = Math.floor(duration / 60 / 60);
                        var minutes = Math.floor(duration / 60) - (hours * 60);
                        var seconds = Math.floor(duration % 60);

                        //insert into database
                        database.collection("videos").insertOne({
                            "filePath": newPath,
                            "title": title,
                            "description ": description,
                            "createdAt": new Date().getTime(),
                            "minutes": minutes,
                            "hours": hours,
                            "seconds": seconds,
                        })
                    })
                })

            })
            result.render("index");
        })
        //To stream videos, we can fetch data from database and then will provide it's path in the feild 'path'.
        //In the below API static path is set to show the example, how we can stream videos
        app.get("/stream", function (request, result) {
            //static path is set for testing.
            var path = './public/videos/video.mp4';
            var stat = fileSystem.statSync(path);
            var fileSize = stat.size;
            const range = request.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunkSize = (end - start) + 1;
                const file = fileSystem.createReadStream(path, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/mp4'
                }
                result.writeHead(206, head);
                file.pipe(result);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4'
                }
                result.writeHead(200, head);
                fileSystem.createReadStream(path).pipe(result)
            }
        })
    })
})
