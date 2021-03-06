import { IvoryShieldService } from "./service";
import { Service } from "@webda/core";
import { S3 } from "aws-sdk";
import { ValidatorService } from "./validator";
import { CloudTrailSetup } from "../configurers/cloudtrail";
import * as fs from "fs";
import * as moment from "moment";
import * as zlib from "zlib";
import * as elasticsearch from "elasticsearch";
import * as PromiseUtil from "bluebird";

export default class CloudTrailService extends IvoryShieldService {
  _events: number;
  _counter: number;
  _s3: S3;
  _es: any;
  _cloudtrailSetup: CloudTrailSetup;
  _elkSetup: Service;
  _validatorService: ValidatorService;

  async init(): Promise<void> {
    await super.init();
    this._validatorService = <ValidatorService>this.getService("IvoryShield/ValidatorService");
    this._cloudtrailSetup = <CloudTrailSetup>this.getService("IvoryShield/CloudTrailSetup");
    if (!this._cloudtrailSetup) {
      return;
    }
    //
    this._params.queue = this._cloudtrailSetup.getQueueUrl();
    this._elkSetup = <Service>this.getService("IvoryShield/ELKSetup");
    this._aws = this._getAWS();
    this._s3 = new (this._getAWS().S3)();
  }

  enable() {
    return this._cloudtrailSetup !== undefined;
  }

  work() {
    // Get queue
    // this.processTrailQueue.bind(this);
  }

  async install(params: any) {
    // Setup Kibana
    // Setup all cloudtrails
    // Setup S3 bucket
    // Setup KMS keys
  }

  test(evtFile) {
    this.log("INFO", "Testing event from", evtFile);
    return this.processTrailEvent(JSON.parse(fs.readFileSync(evtFile).toString()));
  }

  _getAWSForEvent(evt) {
    return this._getAWSForAccount(evt.recipientAccountId, evt.awsRegion);
  }

  async processTrailEvent(evt) {
    // Set a timestamp
    evt.uuid = evt.eventID;
    evt.timestamp = moment(evt.eventTime).unix();
    if (this._es) {
      try {
        await this.saveEvent(evt);
      } catch (err) {
        this.log("WARN", "Could not indexed", evt.eventID, evt.eventName);
      }
    }
    let aws = await this._getAWSForEvent(evt);
    try {
      return this._validatorService.handleEvent(aws, evt, evt.recipientAccountId);
    } catch (err) {
      if (err.code && err.code.indexOf("NotFound") >= 0) {
        // The resource does not exist anymore
        this.log("DEBUG", "Resource vanished", evt.eventID);
      } else {
        this.log("ERROR", "Event error", evt.eventID, err.message);
      }
    }
  }

  async processTrailLog(bucket, key) {
    this.log("DEBUG", "Processing log", bucket, key);
    let s3obj = await this._s3
      .getObject({
        Bucket: bucket,
        Key: key,
      })
      .promise();
    let promises = [];
    // @ts-ignore
    let cloudEvents = JSON.parse(zlib.gunzipSync(s3obj.Body)).Records;
    await PromiseUtil.map(cloudEvents, this.processTrailEvent.bind(this), {
      concurrency: 10,
    });
    this.emit("ProcessedEvents", cloudEvents.length);
  }

  run() {
    // TODO Get queue
    //return this.worker(this.processTrailQueue.bind(this));
  }

  processTrailQueue(s3evt) {
    if (s3evt.Event === "s3:TestEvent") {
      return;
    }
    var rex = new RegExp(
      "nuxeo-.*/AWSLogs/\\d+/CloudTrail/.*/\\d{4}/\\d{2}/\\d{2}/\\d+_CloudTrail_.*_(\\d{8})T(\\d{4})Z_.*\\.json\\.gz"
    );
    if (!s3evt.Records) {
      throw new Error("Unkown S3 event");
    }
    let promises = [];
    s3evt.Records.forEach((evt) => {
      if (evt.eventName === "ObjectCreated:Put") {
        let res = rex.exec(evt.s3.object.key);
        if (!res) {
          return;
        }
        // Only check for cloudtrail now
        promises.push(this.processTrailLog(evt.s3.bucket.name, evt.s3.object.key));
      }
    });
    return Promise.all(promises);
  }

  private initES() {
    if (this._elkSetup) {
      this._es = new elasticsearch.Client({
        host: this._params.elasticsearch,
      });
      this._params.elasticsearchIndex = this._params.elasticsearchIndex || "logstash-";
    }
  }

  async saveEvent(evt) {
    if (!this._es) {
      await this.initES();
    }
    let esData: any = {};
    esData.index = this._params.elasticsearchIndex + evt.eventTime.substring(0, 10).replace(new RegExp("-", "g"), ".");
    esData.id = evt.eventID;
    esData.type = "cloudtrail";
    evt.eventSubtype = evt.eventName.match(/[A-Z][a-z]+/g)[0];
    evt.accountName = this.getAccountName(evt.recipientAccountId);
    esData.body = evt;
    return this._es.create(esData);
  }
}

export { CloudTrailService };
