const EC2Resource = require('./EC2Resource');

module.exports = class NetworkInterface extends EC2Resource {

  static getEventMapper() {
  }

  constructor(aws, resources) {
    super(aws, resources);
    if (this.TagSet) {
      this.TagSet.forEach( (tag) => {
        this._Tags[tag.Key] = tag.Value;
      });
    }
  }

  getId() {
    return this.NetworkInterfaceId || this._id;
  }

}