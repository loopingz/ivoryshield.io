import {
  AWSServiceMixIn,
  STS,
  Webda,
  AWS
} from '../services/aws-mixin';
import {
  Service
} from 'webda';
import {
  ValidatorService
} from './validator';
import {
  Configurer
} from '../configurers/configurer'
import {
  Resource
} from '../resources/Resource';
const fs = require('fs');
const elasticsearch = require('elasticsearch');
const moment = require('moment');

export default class CronCheckerService extends AWSServiceMixIn(Service) {
  _validatorService: ValidatorService;
  _metrics: any;
  _configurers: Configurer[];
  _globalConfigurers: Configurer[];
  _es: any;
  beta: boolean = false;
  _elapsed: number;

  init(config) {
    super.init(config);
    this._validatorService = < ValidatorService > this.getService('IvoryShield/ValidatorService');
    this._metrics = {
      Global: {
        Resources: 0
      }
    };
    this._params.configurers = this._params.configurers || [];
    this._configurers = [];
    this._globalConfigurers = [];
    if (this._params.elasticsearch) {
      this.log('DEBUG', 'Creating ES client to', this._params.elasticsearch);
      this._es = new elasticsearch.Client({
        host: this._params.elasticsearch
      });
      this._params.elasticsearchIndex = this._params.elasticsearchIndex || 'metrics';
    }
    this._params.configurers.forEach((configurer) => {
      let service = < Configurer > this.getService(configurer);
      if (!service || !service.configure || !service.isGlobal) {
        this.log('WARN', 'Service', configurer, 'should implement configure and isGlobal method');
        return;
      }
      if (service.isGlobal()) {
        this.log('DEBUG', 'Adding global configurer: ', configurer);
        this._globalConfigurers.push( < Configurer > this.getService(configurer));
      } else {
        this.log('DEBUG', 'Adding configurer: ', configurer);
        this._configurers.push( < Configurer > this.getService(configurer));
      }
    });
  }

  listAssumeRole() {

  }

  async _handleResources(aws, resources : any[], type, account) {
    for (let i in resources) {
      await this._handleResource(aws, resources[i], type, account);
    }
  }

  async _handleResource(aws, resource : any, type, account) {
    let resourceObject = Resource.fromJson(aws, resource, type);
    if (!resourceObject) {
      this.log('DEBUG', 'Cannot find resources mapping for', type);
      return;
    }
    try {
      let metrics = await this._validatorService.handleResource(aws, resourceObject, account);
      this._handleMetrics(metrics, account);
    } catch (err) {
      this.log('ERROR', 'Cannot process', resource, err);
    }
  }

  _handleMetrics(metrics, account) {
    this._metrics[account] = this._metrics[account] || {
      Resources: 0
    };
    for (let i in metrics) {
      this._metrics['Global'][i] = this._metrics['Global'][i] || 0;
      this._metrics['Global'][i] += metrics[i];
      this._metrics[account][i] = this._metrics[account][i] || 0;
      this._metrics[account][i] += metrics[i];
    }
    this._metrics[account]['Resources']++;
    this._metrics['Global']['Resources']++;
  }

  async checkInstances(aws, account, region) {
    let ec2 = new aws.EC2();
    let res = ec2.describeInstances().promise();
    for (let i in res.Reservations) {
      await this._handleResources(aws, res.Reservations[i].Instances, 'EC2Instance', account);
    }
  }

  async checkVolumes(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeVolumes().promise()).Volumes, 'Volume', account);
  }

  async checkSnapshots(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeSnapshots({
      OwnerIds: [account.Id]
    }).promise()).Snapshots, 'Snapshot', account);
  }

  async checkSecurityGroups(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeSecurityGroups().promise()).SecurityGroups, 'SecurityGroup', account);
  }

  async checkAMIs(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeImages({
      Owners: [account.Id]
    }).promise()).Images, 'AMI', account);
  }

  async checkEIPs(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeAddresses().promise()).Addresses, 'EIP', account);
  }

  async checkNetworkInterfaces(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeNetworkInterfaces().promise()).NetworkInterfaces, 'NetworkInterface', account);
  }

  async checkLoadBalancers(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeLoadBalancers().promise()).LoadBalancers, 'LoadBalancer', account);
  }

  async checkCustomerGateways(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeCustomerGateways().promise()).CustomerGateways, 'CustomerGateways', account);
  }

  async checkInternetGateways(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeInternetGateways().promise()).InternetGateways, 'InternetGateway', account);
  }

  async checkNatGateways(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeNatGateways().promise()).NatGateways, 'NatGateway', account);
  }

  async checkSubnets(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeSubnets().promise()).Subnets, 'Subnet', account);
  }

  async checkVpcs(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeVpcs().promise()).Vpcs, 'Vpc', account);
  }

  async checkS3(aws, account) {
    let s3 = new aws.S3();
    await this._handleResources(aws, (await s3.listBuckets().promise()).Buckets, 'S3Bucket', account);
  }

  async checkIAMUsers(aws, account) {
    let iam = new aws.IAM();
    await this._handleResources(aws, (await iam.listUsers().promise()).Users, 'IAMUser', account);
  }

  async checkIAMRoles(aws, account, region) {
    let iam = new aws.IAM();
    // TODO Implement
  }

  async checkRds(aws, account, region) {
    // TODO implement
  }


  test() {
    return this.forTestAccount(this.checkVolumes.bind(this));
  }

  async getCount() {
    let globalCount = 0;
    await this.forEachAccountRegion(async (aws, account, region) => {
      let res = await new aws.EC2().describeInstances().promise();
      let count = 0;
      for (let i in res.Reservations) {
        count += res.Reservations[i].Instances.length
      }
      globalCount += count;
      this.log('INFO', '\t\tInstances:', count, account, region);
    });
    this.log('INFO', 'Global count of instances:', globalCount);
  }

  async _handleRegionalServices(aws, account, region) {
    await this._handleConfigurers(aws, account, region);
    this.log('INFO', 'Check EC2 Instances');
    await this.checkInstances(aws, account, region);
    this.log('INFO', 'Check EBS Volumes');
    await this.checkVolumes(aws, account, region);
    this.log('INFO', 'Check EBS Snapshots');
    await this.checkSnapshots(aws, account, region);
    this.log('INFO', 'Check SecurityGroups');
    await this.checkSecurityGroups(aws, account, region);
    this.log('INFO', 'Check AMIs');
    await this.checkAMIs(aws, account, region);
    this.log('INFO', 'Check EIPs');
    await this.checkEIPs(aws, account, region);
    this.log('INFO', 'Check NetworkInterface');
    await this.checkNetworkInterfaces(aws, account, region);
    this.log('INFO', 'Check CustomerGateways');
    await this.checkCustomerGateways(aws, account, region);
    this.log('INFO', 'Check InternetGateways');
    await this.checkInternetGateways(aws, account, region);
    this.log('INFO', 'Check NatGateways');
    await this.checkNatGateways(aws, account, region);
    this.log('INFO', 'Check Subnets');
    await this.checkSubnets(aws, account, region);
    this.log('INFO', 'Check Vpcs');
    await this.checkVpcs(aws, account, region);
  }

  async _handleConfigurers(aws, account, region) {
    for (let i in this._configurers) {
      let service = this._configurers[i];
      this.log('INFO', 'Launch global configurer', service._name);
      await service.configure(aws, account, region);
    }
  }

  async _handleGlobalConfigurers(aws, account) {
    for (let i in this._globalConfigurers) {  
      let service = this._globalConfigurers[i];
      this.log('INFO', 'Launch global configurer', service._name);
      await service.configure(aws, account);
    }
  }

  async _handleGlobalServices(aws, account) {
    await this._handleGlobalConfigurers(aws, account);
    this.log('INFO', 'Check S3 Buckets');
    await this.checkS3(aws, account);
    this.log('INFO', 'Check IAM Users');
    await this.checkIAMUsers(aws, account);
  }

  _handleResults() {
    // Should be exported as CronChecker saver ( DynamoDB / File / Console )
    this.log('INFO', '\nMetrics');
    this._metrics.timestamp = (new Date()).getTime();
    this._metrics.elapsed = this._metrics.timestamp - this._elapsed;
    for (let i in this._metrics) {
      if (typeof(this._metrics[i]) === 'object') {
        for (let j in this._metrics[i]) {
          this.log('INFO', '[' + i + '][' + j + ']:', this._metrics[i][j]);
        }
      } else {
        this.log('INFO', '[' + i + ']:', this._metrics[i]);
      }
    }

    fs.writeFileSync('./logs/' + this._metrics.timestamp + '.json', JSON.stringify(this._metrics));
    return this.saveMetrics(this._metrics);
  }

  async saveMetrics(metrics) {
    let promises = [];
    for (let i in metrics) {
      let name = await this.getAccountName(i);
      if (i === 'Global' || name === 'Unknown') continue;
      let esData: any = {};
      esData.index = this._params.elasticsearchIndex;
      esData.id = i + '-' + metrics.timestamp;
      //'2018-02-09T22:14:54Z'

      esData.type = 'ivoryshield-metrics';
      esData.body = metrics[i];
      esData.body.accountName = this.getAccountName(i);
      esData.body.accountId = i;
      esData.body.metricsTime = moment(metrics.timestamp).format('YYYY-MM-DDTHH:mm:ss') + 'Z';
      promises.push(this._es.create(esData));
    }
    //return Promise.resolve();
    return Promise.all(promises);
  }

  indexFiles() {
    let files = fs.readdirSync('./logs');
    let promises = [];
    files.forEach((file) => {
      let obj = JSON.parse(fs.readFileSync('./logs/' + file));
      promises.push(this.saveMetrics(obj));
    });
    return Promise.all(promises);
  }

  async configure() {
    await this.forEachAccountRegion(this._handleConfigurers.bind(this), 'Regional configurers');
    await this.forEachAccount(this._handleGlobalConfigurers.bind(this), 'Global configurers');
  }

  async install(resources) {

  }

  async validate() {
    await this.forEachAccountRegion(this._handleRegionalServices.bind(this), 'Regional objects');
    await this.forEachAccount(this._handleGlobalServices.bind(this));
  }

  async work() {
    this._elapsed = new Date().getTime();

    await this.configure();

    await this.validate();

    await this._handleResults();
  }
}

export {
  CronCheckerService
};
