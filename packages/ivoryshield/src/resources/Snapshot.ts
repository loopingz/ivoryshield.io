import { EC2Resource } from './EC2Resource';

export class Snapshot extends EC2Resource {

  SnapshotId: string;

  static getEventMapper() {
    return {
      'CreateSnapshot': 'responseElements.snapshotId'
    }
  }

  getId() {
    return this.SnapshotId || this._id;
  }

}