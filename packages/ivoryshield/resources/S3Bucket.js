const Resource = require('./Resource');

module.exports = class S3Bucket extends Resource {

  static getEventMapper() {
    return {
      'PutBucket.*': 'requestParameters.bucketName',
      'CreateBucket': 'requestParameters.bucketName'
    }
  }

  getId() {
    return this.Name || this._id;
  }

  _getS3() {
    return new this._AWS.S3();
  }

  canTag() {
    return true;
  }

  load() {
    if (this._loaded) {
      return Promise.resolve(this);
    }
    return this._getS3().getBucketTagging({Bucket: this.getId()}).promise().then( (res) => {
      this._loaded = true;
      // Load tags
      res.TagSet.forEach( (tag) => {
        this._Tags[tag.Key] = tag.Value;
      });
      return Promise.resolve();
    }).catch( () => {
      // If no tagging
      return Promise.resolve();
    });
  }

  commit() {
    if (this._updated) {
      return this._updateTags();
    }
    return Promise.resolve();
  }

  _updateTags() {
    let tagSet = [];
    Object.keys(this._Tags).forEach( (key) => {
      // Cannot update tag starting with aws:
      if (key.startsWith('aws:')) {
        return;
      }
      tagSet.push({Key: key, Value: this._Tags[key]});
    });
    return this._getS3().putBucketTagging({Bucket: this.getId(), Tagging: {TagSet: tagSet}}).promise();
  }

  getTag(tag) {
    return this._Tags[tag];
  }

  getTags() {
    return this._Tags;
  }

  untag(tags) {
    this._updated = true;
    for (let i in tags) {
      if (this._Tags[i]) {
        delete this._Tags[i];
      }
    }
    return Promise.resolve();
  }

  tag(tags) {
    this._updated = true;
    for (let i in tags) {
      this._Tags[i] = tags[i];
    }
    return Promise.resolve();
  }

  static fromId(aws, id) {
    return new S3Bucket(aws, id);
  }
}