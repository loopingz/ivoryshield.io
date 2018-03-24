const Resource = require('./Resource');

module.exports = class IAMResource extends Resource {

  _getIAM() {
    return new this._AWS.IAM();
  }

}