import { Resource } from './Resource';

export class IAMResource extends Resource {

  _getIAM() {
    return new this._AWS.IAM();
  }

}