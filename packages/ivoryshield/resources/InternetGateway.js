const EC2Resource = require('./EC2Resource');

module.exports = class InternetGateway extends EC2Resource {

  static getEventMapper() {
  }

  getId() {
    return this.InternetGatewayId || this._id;
  }

}