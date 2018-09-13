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

  private accounts: AccountMap = [];
  private expire: number = 0;
  private delay: number = 3600;
  private staticConfiguration: boolean = false;

  normalizeParams() {
    this.staticConfiguration = this._params.accounts !== undefined;
    if (this.staticConfiguration) {
      this.accounts = this._params.accounts;
      this.sortAccounts();
    }
  }

  sortAccounts() {
    this.accounts.sort((a, b) => {
      if (this.isMainAccount(a.Id)) return -1;
      if (this.isMainAccount(b.Id)) return 1;
      return a.Name.localeCompare(b.Name);
    });
  }

  static async loadOrganization(aws) : Promise<any> {
    let whoAmI = await new (aws.STS)().getCallerIdentity().promise();
    try {
      let res = await new (aws.Organizations)().listAccounts({}).promise();
      return {
        accounts: res.Accounts,
        inOrganization: true,
        me: whoAmI
      };
    } catch (err) {
      if (err.code === 'AWSOrganizationsNotInUseException') {
        let whoAmI = await new (aws.STS)().getCallerIdentity().promise();
        let name = `AWS Account ID ${whoAmI.Account}`;
        try {
          let aliases = await new (aws.IAM)().listAccountAliases().promise();
          if (aliases.AccountAliases.length) {
            name = aliases.AccountAliases[0];
          }
        } catch (err2) {
          // Do not fail on aliases research
          console.log('Error', err2);
        }
        return {
          accounts: [{
            Id: whoAmI.Account,
            Name: name
          }],
          me: whoAmI,
          inOrganization: false
        };
      } else if (err.code === 'AccessDeniedException') {
        console.log('Your account is a sub account of your organization');
        return {
          accounts: [],
          me: whoAmI,
          inOrganization: true
        }
      } else {
        throw err;
      }
    }
  }

  async _getAccountAlias(aws) : Promise<string> {
    try {
      let aliasRes = await (new (aws.IAM)().listAccountAliases({}).promise());
      if (aliasRes.AccountAliases.length) {
        return aliasRes.AccountAliases[0];
      }
    } catch (err) {
      console.log(err);
    }
  }

  async refreshOrganization() {
    let aws = this._aws;
    if (this._params.organizationAccountId) {
      aws = await this._getAWSForAccount(this._params.organizationAccountId);
    }
    this.expire = new Date().getTime() + this.delay * 1000;
    try {
      let res = await new(this._aws.Organizations)().listAccounts({}).promise();
      this.accounts = res.Accounts.filter(acc => acc.Status === 'ACTIVE');
      await Promise.all(this.accounts.map( async (act, index) => {
        let tok = await this._sts.assumeRole({
          DurationSeconds: 3600,
          ExternalId: this._params.externalId,
          RoleArn: 'arn:aws:iam::' + act.Id + ':role/' + this._params["role"],
          RoleSessionName: 'ivoryshield-session'
        }).promise();
        let params = {
          accessKeyId: tok.Credentials.AccessKeyId,
          sessionToken: tok.Credentials.SessionToken,
          secretAccessKey: tok.Credentials.SecretAccessKey
        };
        this.accounts[index].Alias = (await this._getAccountAlias(this._getAWS(params))) || act.Id;
      }));
    } catch (err) {
      console.log('Cannot retrieve organization', err);
    }
    this.sortAccounts();
  }

  isExpired() {
    return this.expire < new Date().getTime();
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
}

export {
  AccountsService,
  AccountMap
};
