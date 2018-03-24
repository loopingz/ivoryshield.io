const EC2Resource = require('./EC2Resource');

module.exports = class EIP extends EC2Resource {

  static getEventMapper() {
  }

  getId() {
    return this.AllocationId || this._id;
  }

}