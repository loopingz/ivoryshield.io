"use strict";
import {
  Service,
  Core as Webda
} from 'webda';
import {
  S3, AWSError, Response
} from 'aws-sdk';

type Constructor < T extends Service > = new(...args: any[]) => T;

function S3MixIn < T extends Constructor < Service >> (Base: T) {

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

    async bucketCreate(s3, bucket, region:string = undefined) {
      let params : any = {
        Bucket: bucket
      };
      if (region) {
        params.CreateBucketConfiguration = {
         LocationConstraint: region
        }
      }
      // Setup www permission on it
      return await s3.createBucket(params).promise();
    }

    async bucketHasVersioning(s3, bucket) {
      let data = await s3.getBucketVersioning({
        Bucket: bucket
      }).promise();
      return data.Status === 'Enabled'
    }
    async bucketSetVersioning(s3, bucket, status = 'Enabled') {
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
      await s3.putBucketEncryption({
        Bucket: bucket,
        ServerSideEncryptionConfiguration: configuration
      }).promise();
    }
  }
}

export {
  S3MixIn,
  Constructor,
  Service,
  Webda,
  AWSError,
  Response
};
