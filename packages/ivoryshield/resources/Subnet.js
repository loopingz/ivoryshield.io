const EC2Resource = require('./EC2Resource');

module.exports = class Subnet extends EC2Resource {

  static getEventMapper() {
    return {
      'CreateSubnet': 'responseElements.subnet.subnetId'
    }
  }

  getId() {
    return this.SubnetId || this._id;
  }

}