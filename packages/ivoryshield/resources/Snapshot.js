const EC2Resource = require('./EC2Resource');

module.exports = class Snapshot extends EC2Resource {

  static getEventMapper() {
    return {
      'CreateSnapshot': 'responseElements.snapshotId'
    }
  }

  getId() {
    return this.SnapshotId || this._id;
  }

}