const EC2Resource = require('./EC2Resource');

module.exports = class EC2Instance extends EC2Resource {

  static getEventMapper() {
  }

  getId() {
    return this.InstanceId || this._id;
  }

}