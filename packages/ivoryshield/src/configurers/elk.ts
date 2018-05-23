import {
  Configurer
} from './configurer';

export default class ElkSetup extends Configurer {

  _es: AWS.ES;

  isGlobal() {
    return false;
  }

  isEnableOn(account, region) {
    if (region !== (this._params.mainRegion || 'us-east-1')) {
      return false;
    }
    return this._accounts.isMainAccount(account.Id);
  }

  async doCreateElk() {
    let params: any = {
      DomainName: this._params.elasticsearchName,
      EBSOptions: {
        EBSEnabled: true,
        VolumeSize: this._params.storageSpace,
        VolumeType: 'standard'
      }
    };
    await this._es.createElasticsearchDomain(params).promise();
  }

  async doResize(options) {
    options.VolumeSize = this._params.storageSpace;
    await this._es.updateElasticsearchDomainConfig({
      DomainName: this._params.elasticsearchName,
      EBSOptions: options
    }).promise();
  }

  async checkSize() {
    let config = (await this._es.describeElasticsearchDomainConfig({
      DomainName: this._params.elasticsearchName
    }).promise()).DomainConfig;
    if (config.EBSOptions.Options.VolumeSize !== this._params.storageSpace) {
      this.log('ACTION', 'Resize the ES cluster', config);
      await this.doResize(config.EBSOptions.Options);
    }
  }

  async getElasticSearchEndpoint() {
    let aws: any = await this._accounts.getMainAccountAWS(this._params.mainRegion || 'us-east-1');
    let es = new(aws.ES)();
    let info = (await es.describeElasticsearchDomain({
      DomainName: this._params.elasticsearchName
    }).promise()).DomainStatus;
    return info.Endpoints.vpc;
  }

  async configure(aws, account, region = undefined) {
    let res = await this.getElasticSearchEndpoint();
    console.log(res);
    /*
    this._es = new aws.ES();
    let names = (await this._es.listDomainNames().promise()).DomainNames;
    for (let i in names) {
      if (names[i].DomainName === this._params.elasticsearchName) {
        await this.checkSize();
        return;
      }
    }
    this.log('ACTION', 'Create ELK on', account.Name,'with', this._params.elasticsearchName, this._params.storageSpace);
    await this.doCreateElk();
    */
  }

  static getModda() {
    return {
      "uuid": "IvoryShield/ElkSetup",
      "label": "ElasticSearch-Kibana Setup",
      "description": "Store your CloudTrail into a AWS ElasticSearch to allow you to research on it, it can also store the metrics collected by CronChecker",
      "webcomponents": [],
      "logo": "images/icons/dynamodb.png",
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "configuration": {
        "schema": {
          type: "object",
          properties: {
            "elasticsearchName": {
              type: "string"
            },
            "storageSpace": {
              type: "number",
              title: "Number of Gb for ElasticSearch"
            }
          },
          required: ["elasticsearchName"]
        }
      }
    }
  }
}

export {
  ElkSetup
};
