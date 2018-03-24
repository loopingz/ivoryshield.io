const EC2Resource = require('./EC2Resource');

module.exports = class NatGateway extends EC2Resource {

  static getEventMapper() {
  }

  getId() {
    return this.NatGatewayId || this._id;
  }

}