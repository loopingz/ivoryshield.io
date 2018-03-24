const EC2Resource = require('./EC2Resource');

module.exports = class Vpc extends EC2Resource {

  static getEventMapper() {
  }

  getId() {
    return this.VpcId || this._id;
  }

}