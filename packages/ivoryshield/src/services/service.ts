import { Service } from "@webda/core";
import { AccountsService } from "./accounts";
import { STS } from "aws-sdk";
import * as AWS from "aws-sdk";

export default class IvoryShieldService extends Service {
  _params: any;

  async init(): Promise<void> {
    await super.init();
    if (this.pretend()) {
      // Will replace every method start with do by an empty one
      Object.getOwnPropertyNames(Object.getPrototypeOf(this))
        .filter((prop) => {
          //console.log(prop, typeof(this[prop]));
          return typeof this[prop] === "function" && prop.startsWith("do");
        })
        .forEach((method) => {
          this[method] = (...args) => {};
        });
    }
    this._aws = this._getAWS();
    this._sts = new this._aws.STS();
    this.mainAccount = this._sts.getCallerIdentity().promise();
    this._awsCache = {};
  }

  getAccountService() {
    return this.getTypedService<AccountsService>("IvoryShield/AccountsService");
  }

  pretend(): boolean {
    if (this._params.pretend !== undefined) {
      return this._params.pretend;
    }
    return true;
  }
  _sts: AWS.STS;
  _regions: any[];
  _accounts: any;
  mainAccount: Promise<any>;
  _aws: any;
  _awsCache: any;

  _assumeRole(account, role, externalId, region = "us-east-1", noCache = false) {
    if (this._awsCache[account] && !noCache) {
      if (this._awsCache[account].expire > new Date().getTime()) {
        let params = JSON.parse(JSON.stringify(this._awsCache[account]));
        params.region = region;
        return Promise.resolve(this._getAWS(params));
      }
    }
    this._awsCache[account] = this._awsCache[account] || {};
    return this._sts
      .assumeRole({
        DurationSeconds: 3600,
        ExternalId: externalId,
        RoleArn: "arn:aws:iam::" + account + ":role/" + role,
        RoleSessionName: "automated-checks",
      })
      .promise()
      .then((tok) => {
        let params: any = {
          region: region,
        };
        params.accessKeyId = tok.Credentials.AccessKeyId;
        params.sessionToken = tok.Credentials.SessionToken;
        params.secretAccessKey = tok.Credentials.SecretAccessKey;
        params.region = region;
        params.expire = 3500 * 1000 + new Date().getTime();
        this._awsCache[account] = params;
        return Promise.resolve(this._getAWS(params));
      });
  }

  async _getAWSForAccount(account, region = "us-east-1") {
    if (this._awsCache[account]) {
      if (this._awsCache[account].expire > new Date().getTime()) {
        let params = JSON.parse(JSON.stringify(this._awsCache[account]));
        params.region = region;
        return Promise.resolve(this._getAWS(params));
      }
    }
    this._awsCache[account] = this._awsCache[account] || {};
    return this._assumeRole(account, this._params["role"], this._params.externalId, region);
  }

  _getAWS(params = undefined) {
    params = params || this._params || {};
    params.accessKeyId = params.accessKeyId || process.env["AWS_ACCESS_KEY_ID"];
    params.sessionToken = params.sessionToken || process.env["AWS_SESSION_TOKEN"];
    params.secretAccessKey = params.secretAccessKey || process.env["AWS_SECRET_ACCESS_KEY"];
    params.region = params.region || process.env["AWS_DEFAULT_REGION"] || "us-east-1";
    AWS.config.update({
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      region: params.region,
      sessionToken: params.sessionToken,
    });
    return AWS;
  }

  async forEachAccount(callback, label = "", accounts = undefined) {
    accounts = accounts || (await this.getAccounts());
    // Get credential
    for (let i in accounts) {
      let act = accounts[i];
      this.log("INFO", label, "on account", act.Name, "(" + act.Id + ")");
      let params;
      let tok = await this._sts
        .assumeRole({
          DurationSeconds: 3600,
          ExternalId: this._params.externalId,
          RoleArn: "arn:aws:iam::" + act.Id + ":role/" + this._params["role"],
          RoleSessionName: "ivoryshield-session",
        })
        .promise();
      params = {
        accessKeyId: tok.Credentials.AccessKeyId,
        sessionToken: tok.Credentials.SessionToken,
        secretAccessKey: tok.Credentials.SecretAccessKey,
      };
      await callback(this._getAWS(params), act);
    }
  }

  async forEachAccountRegion(callback, label = "") {
    let ec2 = new (this._getAWS().EC2)();
    if (!this._regions) {
      this._regions = (await ec2.describeRegions().promise()).Regions;
    }
    await this.forEachAccount(async (aws, account) => {
      for (let i in this._regions) {
        let region = this._regions[i];
        aws.config.update({
          region: region.RegionName,
        });
        this.log("INFO", "\ton region", region.RegionName);
        await callback(aws, account, region.RegionName);
      }
    }, label);
  }

  async getAccounts() {
    return (<AccountsService>this.getService("IvoryShield/AccountsService")).getAccounts();
  }

  async getAccountName(id: string): Promise<string> {
    return (<AccountsService>this.getService("IvoryShield/AccountsService")).getAccountName(id);
  }
}

export { IvoryShieldService };
