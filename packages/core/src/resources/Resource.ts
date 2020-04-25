const fs = require('fs');
const jsonpath = require('jsonpath');

export default class Resource {
  _AWS: any;
  _Tags: any;
  _id: string;
  static _types: any;
  _loaded: boolean;

  constructor(aws, resources) {
    this._AWS = aws;
    if (typeof(resources) === 'string') {
      this._id = resources;
    } else {
      for (let i in resources) {
        this[i] = resources[i];
      }
    }
    this._Tags = {};
  }

  canTag() {
    return false;
  }

  tag(tags) {
    throw 'Not implemented';
  }

  untag(tags) {
    throw 'Not implemented';
  }

  getTag(tag) {
    return this._Tags[tag];
  }

  getTags() {
    return this._Tags;
  }

  delete() {
    throw 'Not implemented';
  }

  commit() {
    // Tagging several time the same resources seems to have issue on AWS
  }

  getId() {
    return this._id;
  }

  load() {
    throw 'Not implemented';
  }

  toJSON() {
    let obj: any = {};
    for (let i in this) {
      if (i.startsWith('_')) continue;
      obj[i] = this[i];
    }
    return obj;
  }

  private static loadTypes() {
    Resource._types = {};
    fs.readdirSync(__dirname).forEach((file) => {
      if (!file.endsWith('.js') || file === 'Resource.js') return;
      let mod = require('./' + file);
      Resource._types[file.split('.')[0]] = mod.default || mod;
    });
  }
  static fromJson(aws, resources, type) {
    if (!Resource._types) {
      Resource.loadTypes();
    }
    if (Resource._types[type]) {
      return new Resource._types[type](aws, resources);
    }
  }

  static extractFromEvent(aws, event, type) {
    if (event.errorCode) {
      return null;
    }
    let mappers = type.getEventMapper();
    for (let i in mappers) {
      let regexp = new RegExp(i);
      if (regexp.exec(event.eventName)) {
        let resourceIds = jsonpath.query(event, mappers[i]);
        let res = [];
        for (let j in resourceIds) {
          let resource = type.fromId(aws, resourceIds[j]);
          // Save event it generates from
          resource._fromEvent = event;
          res.push(resource);
        }
        return res;
      }
    }
    return null;
  }

  static fromId(aws, id) {
    throw "Not implemented";
  }

  static fromEvent(aws, event) {
    if (!Resource._types) {
      Resource.loadTypes();
    }
    let resources = [];
    for (let i in Resource._types) {
      if (Resource._types[i].getEventMapper) {
        let res = Resource.extractFromEvent(aws, event, Resource._types[i]);
        if (res) {
          resources = resources.concat(res);
        }
      }
    }
    // Create resource here
    return resources;
  }
}

export {
  Resource
};
