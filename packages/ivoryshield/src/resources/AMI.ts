import {
  EC2Resource
} from './EC2Resource';

export class AMI extends EC2Resource {

  ImageId: string;

  static getEventMapper(): any {

  }

  getId() {
    return this.ImageId || this._id;
  }

}
