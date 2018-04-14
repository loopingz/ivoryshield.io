import {
  Service
} from 'webda';
import {
  Validator
} from '../validators/validator';
const Resource = require('../resources/Resource');

export default class ValidatorService extends Service {

  _validators: Validator[];
  _config: any;

  constructor(webda, name, params) {
    super(webda, name, params);
    this._validators = [];
  }

  init(config) {
    super.init(config);
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

  handleResource(aws, resource, account) {
    return resource.load().then(() => {
      let metrics = {};
      let promise = Promise.resolve();
      this._validators.forEach((validator) => {
        if (!validator.isEnableOn(aws.config.region, account)) return;
        promise = promise.then(() => {
          return validator.validate(aws, resource).then((met: any) => {
            for (let i in met) {
              metrics[i] = metrics[i] || 0;
              metrics[i] += met[i];
            }
            return Promise.resolve();
          }).catch((err) => {
            // Dont fail if one validator fail
            console.log('Validator', validator._name, 'had an issue', err.message);
            return Promise.resolve();
          });
        });
      });
      return promise.then(() => {
        // Resource commit
        return resource.commit();
      }).then(() => {
        return Promise.resolve(metrics);
      });
    });
  }
}

export {
  ValidatorService
};
