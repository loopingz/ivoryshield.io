const EC2Resource = require('./EC2Resource');

module.exports = class Volume extends EC2Resource {

  static getEventMapper() {
    return {
      'CreateVolume': 'responseElements.volumeId'
    }
  }

  getId() {
    return this.VolumeId || this._id;
  }

}