import { Service } from 'webda';
import { ValidatorService } from '../services/validator';

export default class Validator extends Service {
  constructor(webda, name, params) {
    super(webda, name, params);
    this._params.tagPrefix = this._params.tagPrefix || 'policy:';
  }

  init(config) {
    (<ValidatorService> this.getService('IvoryShield/ValidatorService')).registerValidator(this);
  }

  isEnableOn(account, region) {
    // Override this method to filter by account or region
    return true;
  }

  async validate(aws, resource) : Promise<any> {
    throw new Error('Validate is not implemented');
  }

  getTagName(name) {
  	return this._params.tagPrefix + name;
  }

  async updateTag(resource, tagName, value) {
  	if (!resource.canTag()) {
  		return;
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
  }
}

export { Validator };