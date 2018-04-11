import {
  EC2Resource
} from './EC2Resource';


export class Vpc extends EC2Resource {

  VpcId: string;

  static getEventMapper() {}

  getId() {
    return this.VpcId || this._id;
  }

}
