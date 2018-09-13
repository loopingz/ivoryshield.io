import {
  IvoryShieldService
} from '../services/service';
import {
  ValidatorService
} from '../services/validator';

export default class Validator extends IvoryShieldService {

  resolve() {
    super.resolve();
    ( < ValidatorService > this.getService('IvoryShield/ValidatorService')).registerValidator(this);
  }

  async init() : Promise<void> {
    await super.init();
  }

  normalizeParams() {
    this._params.tagPrefix = this._params.tagPrefix || 'policy:';
  }

  isEnableOn(account, region) {
    // Override this method to filter by account or region
    return true;
  }

  async validate(aws, resource): Promise < any > {
    throw new Error('Validate is not implemented');
  }

  getTagName(name) {
    return this._params.tagPrefix + name;
  }

  async updateTag(resource, tagName, value = undefined) {
    if (!resource.canTag()) {
      return;
    }
    let tags = {};
    if (value) {
      if (resource.getTag(tagName) !== value) {
        tags[tagName] = value;
        this.log('INFO', 'Tagging', resource.getId(), tagName, 'with', value);
        return resource.tag(tags);
      }
    } else {
      if (resource.getTag(tagName) !== value) {
        tags[tagName] = resource.getTag(tagName);
        this.log('INFO', 'UnTagging', resource.getId(), 'from', tagName);
        return resource.untag(tags)
      }
    }
  }
}

export {
  Validator
};
