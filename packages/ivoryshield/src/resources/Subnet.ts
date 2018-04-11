import {
  EC2Resource
} from './EC2Resource';

export class Subnet extends EC2Resource {

  SubnetId: string;

  static getEventMapper() {
    return {
      'CreateSubnet': 'responseElements.subnet.subnetId'
    }
  }

  getId() {
    return this.SubnetId || this._id;
  }

}
