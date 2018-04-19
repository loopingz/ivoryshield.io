import {
  AWSServiceMixIn,
  STS,
  Webda,
  Service,
  AWS
} from '../services/aws-mixin';
import {
  SQSQueue
} from 'webda';
import {
  S3
} from 'aws-sdk';
import {
  ValidatorService
} from './validator';
const fs = require('fs');
const moment = require('moment');
const zlib = require('zlib');
const elasticsearch = require('elasticsearch');
const PromiseUtil = require("bluebird");


export class CloudTrailService extends AWSServiceMixIn(SQSQueue) {

  _events: number;
  _counter: number;
  _s3: S3;
  _es: any;
  _validatorService: ValidatorService;

  init(config) {
    super.init(config);
    this._validatorService = < ValidatorService > this.getService('ValidatorService');
    this._aws = this._getAWS();
    this._s3 = new(this._getAWS()).S3();
    if (this._params.elasticsearch) {
      this.log('DEBUG', 'Creating ES client to', this._params.elasticsearch);
      this._es = new elasticsearch.Client({
        host: this._params.elasticsearch
      });
      this._params.elasticsearchIndex = this._params.elasticsearchIndex || 'logstash-';
    }
  }

  work() {
    this._events = 0;
    this._counter = 0;

    this.callback = this.processTrailQueue.bind(this);
    this._workerReceiveMessage();
    return new Promise(() => {

    });
  }

  async install(params: any) {
    // Setup Kibana

    // Setup all cloudtrails

    // Setup S3 bucket

    // Setup KMS keys
  }

  test(evtFile) {
    this.log('INFO', 'Testing event from', evtFile);
    return this.processTrailEvent(JSON.parse(fs.readFileSync(evtFile)));
  }

  _getAWSForEvent(evt) {
    return this._getAWSForAccount(evt.recipientAccountId, evt.awsRegion);
  }

  processTrailEvent(evt) {
    // Set a timestamp
    evt.uuid = evt.eventID;
    evt.timestamp = moment(evt.eventTime).unix();
    let promise = Promise.resolve();
    if (this._es) {
      promise = this.saveEvent(evt).catch(() => {
        this.log('WARN', 'Could not indexed', evt.eventID, evt.eventName);
        return Promise.resolve();
      });
    }
    return promise.then(() => {
      return this._getAWSForEvent(evt);
    }).then((aws) => {
      return this._validatorService.handleEvent(aws, evt, evt.recipientAccountId);
    }).catch((err) => {
      if (err.code && err.code.indexOf('NotFound') >= 0) {
        // The resource does not exist anymore
        this.log('DEBUG', 'Resource vanished', evt.eventID);
        return Promise.resolve();
      }
      this.log('ERROR', 'Event error', evt.eventID, err.message);
      // Dont loop over n over
      return Promise.resolve(err);
    });
  }

  processTrailLog(bucket, key) {
    return this._s3.getObject({
      Bucket: bucket,
      Key: key
    }).promise().then((s3obj) => {
      let promises = [];
      let cloudEvents = JSON.parse(zlib.gunzipSync(s3obj.Body)).Records;
      let promise = PromiseUtil.map(cloudEvents, this.processTrailEvent.bind(this), {
        concurrency: 10
      });
      //cloudEvents.forEach( this.processTrailEvent.bind(this) );
      //return Promise.all(promises);
      promise.then(() => {
        this.emit('ProcessedEvents', cloudEvents.length);
        return Promise.resolve();
      });
    });
  }

  run() {
    return this.worker(this.processTrailQueue.bind(this));
  }

  processTrailQueue(s3evt) {
    if (s3evt.Event === 's3:TestEvent') {
      return;
    }
    var rex = new RegExp("nuxeo-.*/AWSLogs/\\d+/CloudTrail/.*/\\d{4}/\\d{2}/\\d{2}/\\d+_CloudTrail_.*_(\\d{8})T(\\d{4})Z_.*\\.json\\.gz");
    if (!s3evt.Records) {
      throw new Error('Unkown S3 event');
    }
    let promises = [];
    s3evt.Records.forEach((evt) => {
      if (evt.eventName === 'ObjectCreated:Put') {
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

  saveEvent(evt) {
    let esData: any = {};
    esData.index = this._params.elasticsearchIndex + evt.eventTime.substring(0, 10).replace(new RegExp('-', 'g'), '.');
    esData.id = evt.eventID;
    esData.type = 'cloudtrail';
    evt.eventSubtype = evt.eventName.match(/[A-Z][a-z]+/g)[0];
    evt.accountName = this.getAccountName(evt.recipientAccountId);
    esData.body = evt;
    return this._es.create(esData);
  }

}
