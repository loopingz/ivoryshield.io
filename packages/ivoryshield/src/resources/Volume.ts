import { EC2Resource } from './EC2Resource';

export class Volume extends EC2Resource {

  VolumeId: string;

  static getEventMapper() {
    return {
      'CreateVolume': 'responseElements.volumeId'
    }
  }

  getId() {
    return this.VolumeId || this._id;
  }

}