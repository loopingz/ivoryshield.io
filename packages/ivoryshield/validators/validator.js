const Service = require('webda/services/service');

module.exports = class Validator extends Service {
  constructor(webda, name, params) {
    super(webda, name, params);
    this._params.tagPrefix = this._params.tagPrefix || 'policy:';
  }

  init(config) {
    this.getService('IvoryShield/ValidatorService').registerValidator(this);
  }

  isEnableOn(account, region) {
    // Override this method to filter by account or region
    return true;
  }

  validate(aws, resource) {
    throw new Error('Validate is not implemented');
  }

  getTagName(name) {
  	return this._params.tagPrefix + name;
  }

  updateTag(resource, tagName, value) {
  	if (!resource.canTag()) {
  		return Promise.resolve();
  	}
  	let tags = {};
  	if (value) {
  		if (resource.getTag(tagName) !== value) {
  			tags[tagName] = value;
  			console.log('Tagging', resource.getId(), tagName,'with', value);
  			return resource.tag(tags);
  		}
  	} else {
  		if (resource.getTag(tagName) !== value) {
  			tags[tagName] = resource.getTag(tagName);
  			console.log('UnTagging', resource.getId(), 'from', tagName);
  			return resource.untag(tags)
  		}
  	}
  	return Promise.resolve();
  }
}