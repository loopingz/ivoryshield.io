"use strict";
import {
  Core as Webda,
  Service
} from 'webda';
import {
  IvoryShieldService
} from './service';
import {
  S3,
  AWSError,
  Response
} from 'aws-sdk';


type Constructor < T extends IvoryShieldService > = new(...args: any[]) => T;

function S3MixIn < T extends Constructor < IvoryShieldService >> (Base: T) {
  return class extends Base {
    async bucketExists(s3, bucket) {
      try {
        await s3.headBucket({
          Bucket: bucket
        }).promise();
        return true;
      } catch (err) {
        if (err.code === 'Forbidden') {
          throw err;
        }
        return false;
      }
    }

    async bucketCreate(s3, bucket, region: string = undefined) {
      let params: any = {
        Bucket: bucket
      };
      if (region) {
        params.CreateBucketConfiguration = {
          LocationConstraint: region
        }
      }
      this.log('ACTION', 'Create S3 Bucket', bucket);
      if (this.pretend()) {
        return;
      }
      // Setup www permission on it
      return await s3.createBucket(params).promise();
    }

    async bucketHasVersioning(s3, bucket) {
      try {
        let data = await s3.getBucketVersioning({
          Bucket: bucket
        }).promise();
        return data.Status === 'Enabled'
      } catch (err) {
        return false;
      }
    }

    async bucketSetVersioning(s3, bucket, status = 'Enabled') {
      this.log('ACTION', 'Set versioning on S3 Bucket', bucket);
      if (this.pretend()) {
        return;
      }
      await s3.putBucketVersioning({
        Bucket: bucket,
        VersioningConfiguration: {
          Status: 'Enabled'
        }
      }).promise();
    }

    async bucketHasEncryption(s3: S3, bucket: string) {
      try {
        return await s3.getBucketEncryption({
          Bucket: bucket
        }).promise();
      } catch (err) {
        return false;
      }
    }

    async bucketSetEncryption(s3: S3, bucket: string, configuration: any = undefined) {
      if (!configuration) {
        configuration = {
          Rules: [{
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256'
            }
          }]
        }
      }
      this.log('ACTION', 'Set encryption on S3 Bucket', bucket);
      if (this.pretend()) {
        return;
      }
      await s3.putBucketEncryption({
        Bucket: bucket,
        ServerSideEncryptionConfiguration: configuration
      }).promise();
    }
  }
}

export {
  S3MixIn,
  Service,
  Constructor,
  IvoryShieldService,
  Webda,
  AWSError,
  Response
};
