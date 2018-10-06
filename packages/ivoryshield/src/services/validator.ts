import {
  IvoryShieldService
} from './service';
import {
  Validator
} from '../validators/validator';
import {
  Resource
} from '../resources/Resource';

export default class ValidatorService extends IvoryShieldService {

  _validators: Validator[] = [];
  _config: any;

  resolve() {
    this._config = this.getService('Configuration');
  }


  registerValidator(bean) {
    this._validators.push(bean);
  }

  loadResource() {

  }

  handleEvent(aws, evt, account) {
    let resources = Resource.fromEvent(aws, evt);
    let promises = [];
    resources.forEach((resource) => {
      promises.push(this.handleResource(aws, resource, account));
    });
    return Promise.all(promises);
  }

  async handleResource(aws, resource, account) {
    await resource.load();
    let metrics = {};
    let promise = Promise.resolve();
    for (let i in this._validators) {
      let validator = this._validators[i];
      if (!validator.isEnableOn(aws.config.region, account)) continue;
      try {
        let met = validator.validate(aws, resource);
        for (let i in met) {
          metrics[i] = metrics[i] || 0;
          metrics[i] += met[i];
        }
      } catch (err) {
        // Dont fail if one validator fail
        this.log('WARN', 'Validator', validator._name, 'had an issue', err.message);
      }
      if (!this.pretend()) {
        // Resource commit)
        await resource.commit();
      }
    }
    return metrics;
  }
}

export {
  ValidatorService
};
