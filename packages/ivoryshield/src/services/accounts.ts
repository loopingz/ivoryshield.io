import {
  Service
} from 'webda';
import {
  AWSServiceMixIn,
  STS,
  Webda,
  AWS
} from './aws-mixin';

interface AccountMap {
  [key: string]: any;
}

export default class AccountsService extends AWSServiceMixIn(Service) {

  private organization: Promise < any > ;
  private accounts: AccountMap;
  private expire: number;
  private delay: number = 3600;
  private unknownAccounts: AccountMap;
  private staticConfiguration: boolean = false;

  init(params) {
    super.init(params);
    this.staticConfiguration = this._params.accounts !== undefined;
    if (this.staticConfiguration) {
      this.accounts = this._params.accounts;
    } else {
      this.organization = this.refreshOrganization();
    }
  }

  async refreshOrganization() {
    this.expire = new Date().getTime() + this.delay * 1000;
    return new(this._aws.Organizations)().listAccounts({}).promise().then((res) => {
      this.accounts = res.Accounts;
    });
  }

  async loadOrganization() {
    let accounts = await this.organization;

  }

  isExpired() {
    return this.expire < new Date().getTime() + this.delay * 1000;
  }

  async getAccounts(): Promise < any > {
    if (this.isExpired()) {
      await this.refreshOrganization();
    }
    return this.accounts;
  }

  async getAccountName(id: string): Promise < string > {
    if (this.accounts[id]) {
      return this.accounts[id];
    }
    if (this.staticConfiguration) {
      return 'Unknown';
    }
    if (this.unknownAccounts[id] < new Date().getTime()) {
      await this.refreshOrganization();
    }
    if (this.accounts[id]) {
      return this.accounts[id];
    }
    // Retry loading accounts only every 5min
    this.unknownAccounts[id] = new Date().getTime() + 5 * 60000;
    return 'Unknown';
  }
}

export {
  AccountsService,
  AccountMap
};
