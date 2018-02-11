'use strict';

var storage     = require('@google-cloud/storage'),
    BaseStore   = require('ghost-storage-base'),
    Promise     = require('bluebird'),
    path        = require('path'),
    debug       = require('debug')('ghost-gcloud-storage'),
    url = require('url'),
    options     = {};

class GStore extends BaseStore {
    constructor(config = {}){
        super(config);
        options = config;

        var gcs = storage({
            projectId: options.projectId,
            keyFilename: options.key
        });
        debug('config is');
        debug(config);
        this.subDir = options.subdir;
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
        subDir = this.subDir,
        targetFilename = getTargetName(image, targetDir).toLowerCase();
        debug('Saving image [%s]: %o', targetFilename, image)
        var opts = {
            destination: path.join(targetFilename),
            metadata: {
                cacheControl: `public, max-age=${this.maxAge}`
            },
            public: true
        };
        return new Promise((resolve, reject) => {
            var options = this.options;
            this.bucket.upload(image.path, opts)
            .then(function (data) {
                debug('Successfully saved image [%s]: %o', targetFilename, data)
                var fullUrl = path.join('/', subDir,'/content/images/',targetFilename)
                debug('fullUrl %s', fullUrl);
                return resolve(fullUrl);
            }).catch(function (e) {
                debug('Failed to save image [%s]: %o', targetFilename, e)
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
            debug('Request to serve image %s', file);
            bucket
            .file(file)
            .createReadStream()
            .on('error', function(err) {
                debug('Failed to serve image %s: %o', file, err);
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

    read (options) {
        options = options || {};
        debug('Request to read file %o', options);
        // remove trailing slashes
        options.path = (options.path || '').replace(/\/$|\\$/, '');

        debug('Request to read path %s', options.path);
        var rs = this.bucket.file(options.path).createReadStream(), contents = '';
        return new Promise(function (resolve, reject) {
            rs.on('error', function(err){
                debug('Error reading file %s: %o', err);
                return reject(err);
            });
            rs.on('data', function(data){
                contents += data;
            });
            rs.on('end', function(){
                debug('Image %s successfully read', options.path);
                return resolve(contents);
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
