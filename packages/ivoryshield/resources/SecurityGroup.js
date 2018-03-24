const EC2Resource = require('./EC2Resource');

module.exports = class SecurityGroup extends EC2Resource {

  static getEventMapper() {
  }

  getId() {
    return this.GroupId || this._id;
  }

}