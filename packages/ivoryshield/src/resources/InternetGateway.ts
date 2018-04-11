import {
  EC2Resource
} from './EC2Resource';

export default class InternetGateway extends EC2Resource {

  InternetGatewayId: string;

  static getEventMapper() {}

  getId() {
    return this.InternetGatewayId || this._id;
  }

}

export {
  InternetGateway
};
