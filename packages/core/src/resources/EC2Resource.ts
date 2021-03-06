import {
  Resource
} from "./Resource";

export default class EC2Resource extends Resource {

  _tagsToDelete: any[];
  _tagsToAdd: any[];
  Tags: any;

  static getEventMapper(): any {
    return {
      'CreateTags': 'requestParameters.resourcesSet.items[*].resourceId',
      'DeleteTags': 'requestParameters.resourcesSet.items[*].resourceId'
    }
  }

  constructor(aws, resources) {
    super(aws, resources);
    this._loadFromTags(this.Tags);
    this._tagsToDelete = [];
    this._tagsToAdd = [];
  }

  _loadFromTags(tags) {
    if (tags) {
      tags.forEach((tag) => {
        this._Tags[tag.Key] = tag.Value;
      });
    }
  }

  canTag() {
    return true;
  }

  _getEC2() {
    return new this._AWS.EC2();
  }

  async commit() {
    let promise = Promise.resolve();
    if (this._tagsToAdd.length) {
      promise = this._getEC2().createTags({
        Resources: [this.getId()],
        Tags: this._tagsToAdd
      }).promise();
    }
    if (this._tagsToDelete.length) {
      promise = promise.then(() => {
        return this._getEC2().deleteTags({
          Resources: [this.getId()],
          Tags: this._tagsToDelete
        }).promise();
      });
    }
    return promise;
  }

  load() {
    if (this._loaded) {
      return Promise.resolve(this);
    }
    // From the resources we have all information needed
    return this._getEC2().describeTags({
      Filters: [{
        Name: 'resource-id',
        Values: [this.getId()]
      }]
    }).promise().then((res) => {
      this._loaded = true;
      this._loadFromTags(res.Tags);
      return Promise.resolve(this);
    });
  }

  static fromId(aws, id) {
    return new EC2Resource(aws, id);
  }


  untag(tags) {
    for (let i in tags) {
      this._tagsToDelete.push({
        Key: i,
        Value: tags[i]
      });
      if (this._Tags[i]) {
        delete this._Tags[i];
      }
    }
  }

  tag(tags) {
    for (let i in tags) {
      this._tagsToAdd.push({
        Key: i,
        Value: tags[i]
      });
      this._Tags[i] = tags[i];
    }
  }

}

export {
  EC2Resource
};
