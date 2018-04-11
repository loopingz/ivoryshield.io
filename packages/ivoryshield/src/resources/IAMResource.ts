import {
  Resource
} from './Resource';

export default class IAMResource extends Resource {

  _getIAM() {
    return new this._AWS.IAM();
  }

}

export {
  IAMResource
};
