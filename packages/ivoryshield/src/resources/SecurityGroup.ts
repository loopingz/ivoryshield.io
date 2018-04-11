import {
  EC2Resource
} from './EC2Resource';

export default class SecurityGroup extends EC2Resource {

  GroupId: string;

  static getEventMapper() {}

  getId() {
    return this.GroupId || this._id;
  }

}

export {
  SecurityGroup
};
