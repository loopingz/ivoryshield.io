import {
  EC2Resource
} from './EC2Resource';

export default class NetworkInterface extends EC2Resource {

  NetworkInterfaceId: string;
  TagSet: any;

  static getEventMapper() {}

  constructor(aws, resources) {
    super(aws, resources);
    if (this.TagSet) {
      this.TagSet.forEach((tag) => {
        this._Tags[tag.Key] = tag.Value;
      });
    }
  }

  getId() {
    return this.NetworkInterfaceId || this._id;
  }

}

export {
  NetworkInterface
};
