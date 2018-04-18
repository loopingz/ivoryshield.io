import {
  Service as WebdaService
} from 'webda';
import {
  AccountsService
} from './accounts';

export default class Service extends WebdaService {

  async getAccounts(): Promise < any > {
    return ( < AccountsService > this.getService('IvoryShield/AccountsService')).getAccounts();
  }

  async getAccountName(id: string): Promise < string > {
    return ( < AccountsService > this.getService('IvoryShield/AccountsService')).getAccountName(id);
  }

  pretend(): boolean {
    return this._params.pretend || true;
  }
}

export {
  Service
};
