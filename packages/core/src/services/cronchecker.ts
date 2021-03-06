import { Service } from "@webda/core";
import { ValidatorService } from "./validator";
import { Configurer } from "../configurers/configurer";
import { Resource } from "../resources/Resource";
import * as fs from "fs";
import * as elasticsearch from "elasticsearch";
import * as moment from "moment";
import IvoryShieldService from "./service";

export default class CronCheckerService extends IvoryShieldService {
  _validatorService: ValidatorService;
  _metrics: any;
  _configurers: Configurer[] = [];
  _globalConfigurers: Configurer[] = [];
  _es: any;
  beta: boolean = false;
  _elapsed: number;

  resolve() {
    this._validatorService = <ValidatorService>this.getService("IvoryShield/ValidatorService");
    let configurers = this._webda.getServicesImplementations(Configurer);
    for (let i in configurers) {
      let service = <Configurer>configurers[i];
      if (service.isGlobal()) {
        this.log("DEBUG", "Adding global configurer: ", service._name);
        this._globalConfigurers.push(service);
      } else {
        this.log("DEBUG", "Adding configurer: ", service._name);
        this._configurers.push(service);
      }
    }
  }

  normalizeParams() {
    this.getParameters().configurers = this.getParameters().configurers || [];
  }

  async init(): Promise<void> {
    await super.init();
    this._metrics = {
      Global: {
        Resources: 0,
      },
    };
    if (this.getParameters().elasticsearch) {
      this.log("DEBUG", "Creating ES client to", this.getParameters().elasticsearch);
      this._es = new elasticsearch.Client({
        host: this.getParameters().elasticsearch,
      });
      this.getParameters().elasticsearchIndex = this.getParameters().elasticsearchIndex || "metrics";
    }
  }

  listAssumeRole() {}

  async _handleResources(aws, resources: any[], type, account) {
    for (let i in resources) {
      await this._handleResource(aws, resources[i], type, account);
    }
  }

  async _handleResource(aws, resource: any, type, account) {
    let resourceObject = Resource.fromJson(aws, resource, type);
    if (!resourceObject) {
      this.log("DEBUG", "Cannot find resources mapping for", type);
      return;
    }
    try {
      let metrics = await this._validatorService.handleResource(aws, resourceObject, account);
      this._handleMetrics(metrics, account);
    } catch (err) {
      this.log("ERROR", "Cannot process", resource, err);
    }
  }

  _handleMetrics(metrics, account) {
    this._metrics[account] = this._metrics[account] || {
      Resources: 0,
    };
    for (let i in metrics) {
      this._metrics["Global"][i] = this._metrics["Global"][i] || 0;
      this._metrics["Global"][i] += metrics[i];
      this._metrics[account][i] = this._metrics[account][i] || 0;
      this._metrics[account][i] += metrics[i];
    }
    this._metrics[account]["Resources"]++;
    this._metrics["Global"]["Resources"]++;
  }

  async checkInstances(aws, account, region) {
    let ec2 = new aws.EC2();
    let res = await ec2.describeInstances().promise();
    for (let i in res.Reservations) {
      await this._handleResources(aws, res.Reservations[i].Instances, "EC2Instance", account);
    }
  }

  async checkVolumes(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeVolumes().promise()).Volumes, "Volume", account);
  }

  async checkSnapshots(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(
      aws,
      (
        await ec2
          .describeSnapshots({
            OwnerIds: [account.Id],
          })
          .promise()
      ).Snapshots,
      "Snapshot",
      account
    );
  }

  async checkSecurityGroups(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(
      aws,
      (await ec2.describeSecurityGroups().promise()).SecurityGroups,
      "SecurityGroup",
      account
    );
  }

  async checkAMIs(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(
      aws,
      (
        await ec2
          .describeImages({
            Owners: [account.Id],
          })
          .promise()
      ).Images,
      "AMI",
      account
    );
  }

  async checkEIPs(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeAddresses().promise()).Addresses, "EIP", account);
  }

  async checkNetworkInterfaces(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(
      aws,
      (await ec2.describeNetworkInterfaces().promise()).NetworkInterfaces,
      "NetworkInterface",
      account
    );
  }

  async checkLoadBalancers(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    await this._handleResources(
      aws,
      (await ec2.describeLoadBalancers().promise()).LoadBalancers,
      "LoadBalancer",
      account
    );
  }

  async checkCustomerGateways(aws, account, region) {
    if (!this.beta) {
      return Promise.resolve();
    }
    let ec2 = new aws.EC2();
    await this._handleResources(
      aws,
      (await ec2.describeCustomerGateways().promise()).CustomerGateways,
      "CustomerGateways",
      account
    );
  }

  async checkInternetGateways(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(
      aws,
      (await ec2.describeInternetGateways().promise()).InternetGateways,
      "InternetGateway",
      account
    );
  }

  async checkNatGateways(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeNatGateways().promise()).NatGateways, "NatGateway", account);
  }

  async checkSubnets(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeSubnets().promise()).Subnets, "Subnet", account);
  }

  async checkVpcs(aws, account, region) {
    let ec2 = new aws.EC2();
    await this._handleResources(aws, (await ec2.describeVpcs().promise()).Vpcs, "Vpc", account);
  }

  async checkS3(aws, account) {
    let s3 = new aws.S3();
    await this._handleResources(aws, (await s3.listBuckets().promise()).Buckets, "S3Bucket", account);
  }

  async checkIAMUsers(aws, account) {
    let iam = new aws.IAM();
    await this._handleResources(aws, (await iam.listUsers().promise()).Users, "IAMUser", account);
  }

  async checkIAMRoles(aws, account, region) {
    let iam = new aws.IAM();
    // TODO Implement
  }

  async checkRds(aws, account, region) {
    // TODO implement
  }

  async test(serviceName: string) {
    if (!serviceName) {
      this.log("ERROR", "Nothing to test");
      return;
    }
    let service = this.getService(serviceName);
    if (!service) {
      if (this._webda.getService(serviceName) && false) {
        // TODO Clean this one
        this.log("WARN", "Service is not enable, will create a local instance");
        //service = new this._webda.getServicesImplementations(serviceName)[serviceName](this._webda, "test", this._webda._config);
        await service.init();
      } else {
        this.log("ERROR", "The service", serviceName, "does not exist");
        return;
      }
    }
    if (service instanceof Configurer) {
      if (service.isGlobal()) {
        await this.forEachAccount(async (aws, account) => {
          if ((<Configurer>service).isEnableOn(account)) {
            await (<Configurer>service).configure(aws, account);
          }
        }, serviceName);
      } else {
        await this.forEachAccountRegion(async (aws, account, region) => {
          if ((<Configurer>service).isEnableOn(account, region)) {
            await (<Configurer>service).configure(aws, account, region);
          }
        }, serviceName);
      }
      return;
    }
    this.log("ERROR", "You can only test Configurer", service);
  }

  async getCount() {
    let globalCount = 0;
    await this.forEachAccountRegion(async (aws, account, region) => {
      let res = await new aws.EC2().describeInstances().promise();
      let count = 0;
      for (let i in res.Reservations) {
        count += res.Reservations[i].Instances.length;
      }
      globalCount += count;
      this.log("INFO", "\t\tInstances:", count, account, region);
    });
    this.log("INFO", "Global count of instances:", globalCount);
  }

  async _handleRegionalServices(aws, account, region) {
    this.log("INFO", "Check EC2 Instances");
    await this.checkInstances(aws, account, region);
    this.log("INFO", "Check EBS Volumes");
    await this.checkVolumes(aws, account, region);
    this.log("INFO", "Check EBS Snapshots");
    await this.checkSnapshots(aws, account, region);
    this.log("INFO", "Check SecurityGroups");
    await this.checkSecurityGroups(aws, account, region);
    this.log("INFO", "Check AMIs");
    await this.checkAMIs(aws, account, region);
    this.log("INFO", "Check EIPs");
    await this.checkEIPs(aws, account, region);
    this.log("INFO", "Check NetworkInterface");
    await this.checkNetworkInterfaces(aws, account, region);
    this.log("INFO", "Check CustomerGateways");
    await this.checkCustomerGateways(aws, account, region);
    this.log("INFO", "Check InternetGateways");
    await this.checkInternetGateways(aws, account, region);
    this.log("INFO", "Check NatGateways");
    await this.checkNatGateways(aws, account, region);
    this.log("INFO", "Check Subnets");
    await this.checkSubnets(aws, account, region);
    this.log("INFO", "Check Vpcs");
    await this.checkVpcs(aws, account, region);
  }

  async _handleConfigurers(aws, account, region) {
    for (let i in this._configurers) {
      let service = this._configurers[i];
      if (!service.isEnableOn(account, region)) {
        continue;
      }
      this.log("INFO", "Launch global configurer", service._name);
      await service.configure(aws, account, region);
    }
  }

  async _handleGlobalConfigurers(aws, account) {
    for (let i in this._globalConfigurers) {
      let service = this._globalConfigurers[i];
      if (!service.isEnableOn(account)) {
        continue;
      }
      this.log("INFO", "Launch global configurer", service._name);
      await service.configure(aws, account);
    }
  }

  async _handleGlobalServices(aws, account) {
    this.log("INFO", "Check S3 Buckets");
    await this.checkS3(aws, account);
    this.log("INFO", "Check IAM Users");
    await this.checkIAMUsers(aws, account);
  }

  async _handleResults() {
    // Should be exported as CronChecker saver ( DynamoDB / File / Console )
    this.log("INFO", "\nMetrics");
    this._metrics.timestamp = new Date().getTime();
    this._metrics.elapsed = this._metrics.timestamp - this._elapsed;
    for (let i in this._metrics) {
      if (typeof this._metrics[i] === "object") {
        for (let j in this._metrics[i]) {
          this.log("INFO", "[" + i + "][" + j + "]:", this._metrics[i][j]);
        }
      } else {
        this.log("INFO", "[" + i + "]:", this._metrics[i]);
      }
    }

    fs.writeFileSync("./logs/" + this._metrics.timestamp + ".json", JSON.stringify(this._metrics));
    return this.saveMetrics(this._metrics);
  }

  async saveMetrics(metrics) {
    let promises = [];
    for (let i in metrics) {
      let name = await this.getAccountName(i);
      if (i === "Global" || name === "Unknown") continue;
      let esData: any = {};
      esData.index = this.getParameters().elasticsearchIndex;
      esData.id = i + "-" + metrics.timestamp;
      //'2018-02-09T22:14:54Z'

      esData.type = "ivoryshield-metrics";
      esData.body = metrics[i];
      esData.body.accountName = this.getAccountName(i);
      esData.body.accountId = i;
      esData.body.metricsTime = moment(metrics.timestamp).format("YYYY-MM-DDTHH:mm:ss") + "Z";
      promises.push(this._es.create(esData));
    }
    //return Promise.resolve();
    return Promise.all(promises);
  }

  indexFiles() {
    let files = fs.readdirSync("./logs");
    let promises = [];
    files.forEach((file) => {
      let obj = JSON.parse(fs.readFileSync("./logs/" + file).toString());
      promises.push(this.saveMetrics(obj));
    });
    return Promise.all(promises);
  }

  /**
   * Call the configurer for global and regions
   * @returns {Promise<void>}
   */
  async configure() {
    await this.forEachAccount(this._handleGlobalConfigurers.bind(this), "Global configurers");
    await this.forEachAccountRegion(this._handleConfigurers.bind(this), "Regional configurers");
  }

  async install(resources) {}

  /**
   * Validate cloud resources one by one
   * @returns {Promise<void>}
   */
  async validate() {
    await this.forEachAccount(this._handleGlobalServices.bind(this));
    await this.forEachAccountRegion(this._handleRegionalServices.bind(this), "Regional objects");
  }

  async work(type) {
    this._elapsed = new Date().getTime();

    if (!type) {
      await this.configure();
      await this.validate();
      await this._handleResults();
    } else if (type === "configure") {
      await this.configure();
    } else if (type === "resources") {
      await this.validate();
    }
  }
}

export { CronCheckerService };
