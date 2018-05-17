import {
  IvoryShieldService
} from '../services/service';
import {
  AccountsService
} from '../services/accounts';

export class Configurer extends IvoryShieldService {

  _accounts: AccountsService;

  init(params) {
    super.init(params);
    this._accounts = < AccountsService > this.getService('IvoryShield/AccountsService');
  }

  isEnableOn(account, region = undefined) {
    // Override this method to filter by account or region
    return true;
  }

  isGlobal() {
    return true;
  }

  configure(aws, account, region = undefined) {

  }
}
