import {
  Service as WebdaService
} from 'webda';
import {
  AccountsService
} from './accounts';

export default class Service extends WebdaService {

  async getMainAccount() {
    return this._params.mainAccount;
  }

  async getAccounts(): Promise < any > {
    return ( < AccountsService > this.getService('IvoryShield/AccountsService')).getAccounts();
  }

  async getAccountName(id: string): Promise < string > {
    return ( < AccountsService > this.getService('IvoryShield/AccountsService')).getAccountName(id);
  }

  pretend(): boolean {
    if (this._params.pretend !== undefined) {
      return this._params.pretend;
    }
    return true;
  }
}

export {
  Service
};
