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
      this.sortAccounts();
    } else {
      this.organization = this.refreshOrganization();
    }
  }

  sortAccounts() {
    this.accounts.sort((a, b) => {
      if (this.isMainAccount(a.Id)) return -1;
      if (this.isMainAccount(b.Id)) return 1;
      return a.Name.localeCompare(b.Name);
    });
  }

  async refreshOrganization() {
    let aws = this._aws;
    if (this._params.organizationAccountId) {
      aws = await this._getAWSForAccount(this._params.organizationAccountId);
    }
    this.expire = new Date().getTime() + this.delay * 1000;
    return new(aws.Organizations)().listAccounts({}).promise().then((res) => {
      this.accounts = res.Accounts;
      this.sortAccounts();
    });
  }

  async loadOrganization() {
    let accounts = await this.organization;

  }

  isExpired() {
    return this.expire < new Date().getTime() + this.delay * 1000;
  }

  getMainAccountId() {
    return this._params.mainAccount;
  }

  async getMainAccountAWS(region: string = 'us-east-1') {
    return this._getAWSForAccount(this._params.mainAccount, region);
  }

  isMainAccount(account) {
    return account === this._params.mainAccount;
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
