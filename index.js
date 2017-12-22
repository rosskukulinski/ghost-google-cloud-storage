'use strict';

var storage     = require('@google-cloud/storage'),
    BaseStore   = require('ghost-storage-base'),
    Promise     = require('bluebird'),
    path        = require('path'),
    options     = {};

class GStore extends BaseStore {
    constructor(config = {}){
        super(config);
        options = config;

        var gcs = storage({
            projectId: options.projectId,
            keyFilename: options.key
        });
        this.bucket = gcs.bucket(options.bucket);
        this.assetDomain = options.assetDomain || `${options.bucket}.storage.googleapis.com`;
        // only set insecure from config if assetDomain is set
        if(options.hasOwnProperty('assetDomain')){
            this.insecure = options.insecure;
        }
        // default max-age is 3600 for GCS, override to something more useful
        this.maxAge = options.maxAge || 2678400;
    }

    save(image) {
        if (!options) return Promise.reject('google cloud storage is not configured');

        var targetDir = this.getTargetDir(),
        targetFilename = getTargetName(image, targetDir).toLowerCase();
        var opts = {
            destination: path.join(targetFilename),
            metadata: {
                cacheControl: `public, max-age=${this.maxAge}`
            },
            public: true
        };
        return new Promise((resolve, reject) => {
            this.bucket.upload(image.path, opts)
            .then(function (data) {
                return resolve('/content/images/'+targetFilename);
            }).catch(function (e) {
                return reject(e);
            });
        });
    }

    // middleware for serving the files
    serve() {
        // a no-op, these are absolute URLs
        var gcs = storage({
            projectId: options.projectId,
            keyFilename: options.key
        });
        var bucket = gcs.bucket(options.bucket);
        return function (req, res, next) { 
            var file = req.path.replace(/^\//, '')
            bucket
            .file(file)
            .createReadStream()
            .on('error', function(err) {
                return next()
            })
            .pipe(res)
            
        };
    }

    exists (filename) {
        return new Promise((resolve, reject) => {
            this.bucket.file(filename).exists().then(function(data){
                return resolve(data[0]);
            });
        });
    }

    read (filename) {
      var rs = this.bucket.file(filename).createReadStream(), contents = '';
      return new Promise(function (resolve, reject) {
        rs.on('error', function(err){
          return reject(err);
        });
        rs.on('data', function(data){
          contents += data;
        });
        rs.on('end', function(){
          return resolve(content);
        });
      });
    }

    delete (filename) {
        return this.bucket.file(filename).delete();
    }
}

function getTargetName(image, targetDir) {
    var ext = path.extname(image.name);
    var name = path.basename(image.name, ext).replace(/\W/g, '_');

    return path.join(targetDir, name + '-' + Date.now() + ext);
}

module.exports = GStore;
