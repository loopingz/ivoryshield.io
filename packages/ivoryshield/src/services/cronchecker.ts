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
import { Resource } from '../resources/Resource';
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
      console.log('Creating ES client to', this._params.elasticsearch);
      this._es = new elasticsearch.Client({
        host: this._params.elasticsearch
      });
      this._params.elasticsearchIndex = this._params.elasticsearchIndex || 'metrics';
    }
    this._params.configurers.forEach((configurer) => {
      let service = < Configurer > this.getService(configurer);
      if (!service || !service.configure || !service.isGlobal) {
        console.log('Service', configurer, 'should implement configure and isGlobal method');
        return;
      }
      if (service.isGlobal()) {
        console.log('Adding global configurer: ', configurer);
        this._globalConfigurers.push( < Configurer > this.getService(configurer));
      } else {
        console.log('Adding configurer: ', configurer);
        this._configurers.push( < Configurer > this.getService(configurer));
      }
    });
  }

  listAssumeRole() {

  }

  async _handleResource(aws, resources, type, account) {
    let resourceObject = Resource.fromJson(aws, resources, type);
    if (!resourceObject) {
      console.log('Cannot find resources mapping for', type);
      return;
    }
    try {
      let metrics = await this._validatorService.handleResource(aws, resourceObject, account);
      this._handleMetrics(metrics, account);
    } catch (err) {
      console.log('Cannot process', resources, err);
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
    return ec2.describeInstances().promise().then((res) => {
      let promise = Promise.resolve();
      for (let i in res.Reservations) {
        res.Reservations[i].Instances.forEach((inst) => {
          promise = promise.then(() => {
            return this._handleResource(aws, inst, 'EC2Instance', account);
          });
        });
      }
      return promise;
    });
  }

  checkVolumes(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeVolumes().promise().then((res) => {
      let promise = Promise.resolve();
      res.Volumes.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'Volume', account);
        });
      });
      return promise;
    });
  }

  async checkSnapshots(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeSnapshots({
      OwnerIds: [account.Id]
    }).promise().then((res) => {
      let promise = Promise.resolve();
      res.Snapshots.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'Snapshot', account);
        });
      });
      return promise;
    });
  }

  checkSecurityGroups(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeSecurityGroups().promise().then((res) => {
      let promise = Promise.resolve();
      res.SecurityGroups.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'SecurityGroup', account);
        });
      });
      return promise;
    });
  }

  checkAMIs(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeImages({
      Owners: [account.Id]
    }).promise().then((res) => {
      let promise = Promise.resolve();
      res.Images.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'AMI', account);
        });
      });
      return promise;
    });
  }

  checkEIPs(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    return ec2.describeAddresses().promise().then((res) => {
      let promise = Promise.resolve();
      res.Addresses.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'EIP', account);
        });
      });
      return promise;
    });
  }

  checkNetworkInterfaces(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeNetworkInterfaces().promise().then((res) => {
      let promise = Promise.resolve();
      res.NetworkInterfaces.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'NetworkInterface', account);
        });
      });
      return promise;
    });
  }

  checkLoadBalancers(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    return ec2.describeLoadBalancers().promise().then((res) => {
      let promise = Promise.resolve();
      res.Volumes.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'LoadBalancer', account);
        });
      });
      return promise;
    });
  }

  checkCustomerGateways(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    return ec2.describeCustomerGateways().promise().then((res) => {
      let promise = Promise.resolve();
      res.CustomerGateways.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'CustomerGateways', account);
        });
      });
      return promise;
    });
  }

  checkInternetGateways(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeInternetGateways().promise().then((res) => {
      let promise = Promise.resolve();
      res.InternetGateways.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'InternetGateway', account);
        });
      });
      return promise;
    });
  }

  checkNatGateways(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeNatGateways().promise().then((res) => {
      let promise = Promise.resolve();
      res.NatGateways.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'NatGateway', account);
        });
      });
      return promise;
    });
  }

  checkSubnets(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeSubnets().promise().then((res) => {
      let promise = Promise.resolve();
      res.Subnets.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'Subnet', account);
        });
      });
      return promise;
    });
  }

  checkVpcs(aws, account, region) {
    let ec2 = new aws.EC2();
    return ec2.describeVpcs().promise().then((res) => {
      let promise = Promise.resolve();
      res.Vpcs.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'Vpc', account);
        });
      });
      return promise;
    });
  }

  checkS3(aws, account) {
    let s3 = new aws.S3();
    return s3.listBuckets().promise().then((res) => {
      let promise = Promise.resolve();
      res.Buckets.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'S3Bucket', account);
        });
      });
      return promise;
    });
  }

  checkIAMUsers(aws, account) {
    let iam = new aws.IAM();
    return iam.listUsers().promise().then((res) => {
      let promise = Promise.resolve();
      console.log(res);
      res.Users.forEach((inst) => {
        promise = promise.then(() => {
          return this._handleResource(aws, inst, 'IAMUser', account);
        });
      });
      return promise;
    });
  }

  checkIAMRoles(aws, account, region) {
    let iam = new aws.IAM();
    // TODO Implement
  }

  checkRds(aws, account, region) {
    // TODO implement
  }


  test() {
    return this.forTestAccount(this.checkVolumes.bind(this));
  }

  getCount() {
    let globalCount = 0;
    return this.forEachAccountRegion((aws, account, region) => {
      return new aws.EC2().describeInstances().promise().then((res) => {
        let count = 0;
        for (let i in res.Reservations) {
          count += res.Reservations[i].Instances.length
        }
        globalCount += count;
        console.log('\t\tInstances:', count, account, region);
      });
    }).then(() => {
      console.log('Global count of instances:', globalCount);
    });
  }

  _handleRegionalServices(aws, account, region) {
    return this._handleConfigurers(aws, account, region).then(() => {
      console.log('Check EC2 Instances');
      return this.checkInstances(aws, account, region)
    }).then(() => {
      console.log('Check EC2 Volumes');
      return this.checkVolumes(aws, account, region);
    }).then(() => {
      console.log('Check EC2 Snapshots');
      return this.checkSnapshots(aws, account, region);
    }).then(() => {
      console.log('Check EC2 SecurityGroups');
      return this.checkSecurityGroups(aws, account, region);
    }).then(() => {
      console.log('Check EC2 AMIs');
      return this.checkAMIs(aws, account, region);
    }).then(() => {
      console.log('Check EC2 EIPs');
      return this.checkEIPs(aws, account, region);
    }).then(() => {
      console.log('Check EC2 NetworkInterface');
      return this.checkNetworkInterfaces(aws, account, region);
    }).then(() => {
      console.log('Check EC2 CustomerGateways');
      return this.checkCustomerGateways(aws, account, region);
    }).then(() => {
      console.log('Check EC2 InternetGateways');
      return this.checkInternetGateways(aws, account, region);
    }).then(() => {
      console.log('Check EC2 NatGateways');
      return this.checkNatGateways(aws, account, region);
    }).then(() => {
      console.log('Check EC2 Subnets');
      return this.checkSubnets(aws, account, region);
    }).then(() => {
      console.log('Check EC2 Vpcs');
      return this.checkVpcs(aws, account, region);
    });
  }

  _handleConfigurers(aws, account, region) {
    let promise = Promise.resolve();
    this._configurers.forEach((service) => {
      promise = promise.then(() => {
        console.log('Launch global configurer', service._name);
        return service.configure(aws, account, region);
      });
    });
    return promise;
  }

  _handleGlobalConfigurers(aws, account) {
    let promise = Promise.resolve();
    this._globalConfigurers.forEach((service) => {
      promise = promise.then(() => {
        console.log('Launch global configurer', service._name);
        return service.configure(aws, account);
      });
    });
    return promise;
  }

  _handleGlobalServices(aws, account) {
    return this._handleGlobalConfigurers(aws, account).then(() => {
      console.log('Check S3 Buckets');
      return this.checkS3(aws, account);
    }).then(() => {
      console.log('Check IAM Users');
      return this.checkIAMUsers(aws, account);
    });
  }

  _handleResults() {
    // Should be exported as CronChecker saver ( DynamoDB / File / Console )
    console.log('\nMetrics');
    this._metrics.timestamp = (new Date()).getTime();
    this._metrics.elapsed = this._metrics.timestamp - this._elapsed;
    for (let i in this._metrics) {
      if (typeof(this._metrics[i]) === 'object') {
        for (let j in this._metrics[i]) {
          console.log('[' + i + '][' + j + ']:', this._metrics[i][j]);
        }
      } else {
        console.log('[' + i + ']:', this._metrics[i]);
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
      console.log(esData);
      promises.push(this._es.create(esData));
    }
    //return Promise.resolve();
    return Promise.all(promises);
  }

  indexFiles() {
    let files = fs.readdirSync('./logs');
    console.log(files);
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
    console.log('Should install with', resources);
    process.exit(0);
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
