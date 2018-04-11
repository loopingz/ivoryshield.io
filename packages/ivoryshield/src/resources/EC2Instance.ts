import { EC2Resource } from './EC2Resource';
import { EC2 } from 'aws-sdk';

export class EC2Instance extends EC2Resource implements EC2.Types.InstanceAttribute {

  InstanceId: string;

  static getEventMapper() {
  }

  getId() {
    return this.InstanceId || this._id;
  }

}