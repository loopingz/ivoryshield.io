import {
  Service
} from 'webda';
import {
  AccountsService
} from './accounts';

export default class IvoryShieldService extends Service {
  _params: any;
  async getMainAccount() {
    return this._params.mainAccount;
  }

  async init(params) : Promise<void> {
    await super.init(params);
    if (this.pretend()) {
      // Will replace every method start with do by an empty one
      Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter((prop) => {
        //console.log(prop, typeof(this[prop]));
        return typeof(this[prop]) === 'function' && prop.startsWith('do');
      }).forEach((method) => {
        this[method] = (...args) => {};
      });
    }
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
  IvoryShieldService
};
