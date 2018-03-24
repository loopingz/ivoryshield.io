const Validator = require('./validator');

module.exports = class CounterValidator extends Validator {
  validate(aws, resource) {
    let metrics = {};
    metrics[resource.constructor.name] = 1;
    return Promise.resolve(metrics);
  }


  static getModda() {
    return {
      "uuid": "IvoryShield/Counter",
      "label": "Resources Counter",
      "description": "Count the resources while CronChecking to save inside metrics",
      "webcomponents": [],
      "logo": "images/icons/dynamodb.png",
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
    }
  }
}