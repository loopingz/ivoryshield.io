import {
  EC2Resource
} from './EC2Resource';

export class NatGateway extends EC2Resource {

  NatGatewayId: string;

  static getEventMapper() {}

  getId() {
    return this.NatGatewayId || this._id;
  }

}
