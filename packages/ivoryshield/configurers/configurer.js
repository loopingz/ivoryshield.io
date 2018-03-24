const Service = require('webda/services/service');

module.exports = class Configurer extends Service {

  isEnableOn(account, region) {
    // Override this method to filter by account or region
    return true;
  }

  isGlobal() {
    return true;
  }
}