"use strict";
const AWS = require('aws-sdk');
const AWSServiceMixIn = Sup => class extends Sup {

  init(config) {
    super.init(config);
    this._sts = new (this._getAWS()).STS();
    this._aws = this._getAWS();
    this.mainAccount = this._sts.getCallerIdentity().promise();
    this._awsCache = {};
    this._accounts = {};
    for (let i in this._params.accounts) {
      this._accounts[this._params.accounts[i]] = i;
    }
  }

  _getMainAccount() {
    return Promise.resolve(this.mainAccount);
  }


  _assumeRole(account, role, externalId, region = 'us-east-1', noCache) {
    if (this._awsCache[account] && !noCache) {
      if (this._awsCache[account].expire > new Date().getTime()) {
        let params = JSON.parse(JSON.stringify(this._awsCache[account]));
        params.region = region;
        return Promise.resolve(this._getAWS(params));
      }
    }
    this._awsCache[account] = this._awsCache[account] || {};
    console.log('Try to assume', {
      DurationSeconds: 3600,
      ExternalId: externalId,
      RoleArn: 'arn:aws:iam::' + account + ':role/' + role,
      RoleSessionName: 'automated-checks'
    });
    return this._sts.assumeRole(
      {
        DurationSeconds: 3600,
        ExternalId: externalId,
        RoleArn: 'arn:aws:iam::' + account + ':role/' + role,
        RoleSessionName: 'automated-checks'
      }).promise().then((tok) => {
      let params = {region: region};
      params.accessKeyId = tok.Credentials.AccessKeyId;
      params.sessionToken = tok.Credentials.SessionToken;
      params.secretAccessKey = tok.Credentials.SecretAccessKey;
      params.region = region;
      params.expire = 3500 * 1000 + new Date().getTime();
      this._awsCache[account] = params;
      return Promise.resolve(this._getAWS(params));
    });
  }

  _getAWSForAccount(account, region = 'us-east-1') {
    if (this._awsCache[account]) {
      if (this._awsCache[account].expire > new Date().getTime()) {
        let params = JSON.parse(JSON.stringify(this._awsCache[account]));
        params.region = region;
        return Promise.resolve(this._getAWS(params));
      }
    }
    this._awsCache[account] = this._awsCache[account] || {};
    return this._assumeRole(account, this._params['x-account-role'], this.params.externalId, region);
  }

  _getAWS(params) {
    params = params || this._params || {};
    params.accessKeyId = params.accessKeyId || process.env["AWS_ACCESS_KEY_ID"];
    params.sessionToken = params.sessionToken || process.env["AWS_SESSION_TOKEN"];
    params.secretAccessKey = params.secretAccessKey || process.env["AWS_SECRET_ACCESS_KEY"];
    params.region = params.region || process.env["AWS_DEFAULT_REGION"] || 'us-east-1';
    AWS.config.update({accessKeyId: params.accessKeyId, secretAccessKey: params.secretAccessKey, region: params.region, sessionToken: params.sessionToken});
    return AWS;
  }

  forTestAccount(callback, label = '') {
    console.log('Executing', label,'on test account');
    let account = '254525589362';
    let region = 'us-east-1';
    return this._getAWSForAccount(account, region).then( (aws) => {
      return callback(aws, account, region);
    });
  }

  forEachAccount(callback, label = '') {
    let mainAccount;
    let promise = this._getMainAccount().then( (res) => {
      mainAccount = res.Account;
      console.log('Main account is', mainAccount);
      return Promise.resolve();
    });
    // Get credential
    Object.keys(this._params.accounts).forEach( (act) => {
      promise = promise.then( () => {
        let actNum = this._params.accounts[act];
        console.log('Executing', label,'on account', act, '(' + actNum + ')');
        let params;
        if (mainAccount === actNum) {
          console.log('Main account no assume role');
          promise = Promise.resolve();
        } else {
          promise = this._sts.assumeRole(
            {
              DurationSeconds: 3600,
              ExternalId: this._params.externalId,
              RoleArn: 'arn:aws:iam::' + actNum + ':role/' + this._params["x-account-role"],
              RoleSessionName: 'ivoryshield-session'
            }).promise().then( (tok) => {
              params = {};
              params.accessKeyId = tok.Credentials.AccessKeyId;
              params.sessionToken = tok.Credentials.SessionToken;
              params.secretAccessKey = tok.Credentials.SecretAccessKey;
          });
        }
        return promise.then( () => {
          return Promise.resolve(callback(this._getAWS(params), this._params.accounts[act]));
        });
      });
    });
    return promise;
  }


  forEachAccountRegion(callback, label) {
    let ec2 = new (this._getAWS()).EC2();
    return ec2.describeRegions().promise().then( (res) => {
      return this.forEachAccount( (aws, account) => {
        let promise = Promise.resolve();
        res.Regions.forEach( (region) => {
          promise = promise.then( () => {
            aws.config.update({region: region.RegionName});
            console.log('\ton region', region.RegionName);
            return Promise.resolve(callback(aws, account, region.RegionName));
          });
        })
        return promise;
      }, label);
    });
  }

  getAccountName(id) {
    if (this._accounts[id]) {
      return this._accounts[id];
    }
    return 'Unknown';
  }
}

module.exports = AWSServiceMixIn;