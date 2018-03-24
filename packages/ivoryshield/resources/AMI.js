const EC2Resource = require('./EC2Resource');

module.exports = class AMI extends EC2Resource {

  static getEventMapper() {
  }

  getId() {
    return this.ImageId || this._id;
  }

}