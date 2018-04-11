import { IAMResource } from './IAMResource';

module.exports = class AMI extends IAMResource {

  AccessKeys: any[];
  UserId: string;
  UserName: string;

  constructor(aws, resources) {
    super(aws, resources);
    this.AccessKeys = [];
  }

  static getEventMapper() {
  }

  getId() {
    return this.UserId || this._id;
 }

  load() {
    if (this._loaded) {
      return Promise.resolve(this);
    }

    return this._getIAM().listAccessKeys({UserName: this.UserName}).promise().then( (res) => {
      // Store the AccessKeys
      this.AccessKeys = res.AccessKeyMetadata;
      let now = new Date().getTime();
      this.AccessKeys.forEach( (key) => {
        key.Age = (now - new Date(key.CreateDate).getTime()) / 86400000;
      });
      return Promise.resolve();
    });
  }

}