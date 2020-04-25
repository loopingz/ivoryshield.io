import {
  EC2Resource
} from './EC2Resource';

export default class AMI extends EC2Resource {

  ImageId: string;

  static getEventMapper(): any {

  }

  getId() {
    return this.ImageId || this._id;
  }

}

export {
  AMI
};
