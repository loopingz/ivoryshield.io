import {
  Configurer
} from './configurer';
import {
  S3MixIn, Service, Webda
} from '../services/s3-mixin';
import { S3, Response, AWSError } from 'aws-sdk';

export default class CloudTrailSetup extends S3MixIn(Configurer) {

  isEnableOn(account, region) {
    return true;
  }

  async createBucket(s3, bucket) {
    try {
      await s3.headBucket({
        Bucket: bucket
      }).promise();
      return false;
    } catch (err) {
      if (err.code === 'Forbidden') {
        this.log('ERROR', 'S3 bucket', bucket, 'already exists in another account');
      } else if (err.code === 'NotFound') {
        this.log('DEBUG', 'Create bucket', bucket);
        // Setup www permission on it
        await s3.createBucket({
          Bucket: bucket
        }).promise();
        return true;
      }
    }
    return false;
  }

  getKMSKeyPolicy(mainAccount: string, principals:string[]) {
    return {
      "Version": "2012-10-17",
      "Id": "ivoryshield-key-policy",
      "Statement": [
        {
          "Sid": "Enable IAM User Permissions",
          "Effect": "Allow",
          "Principal": {
            "AWS": "arn:aws:iam::" + mainAccount + ":root"
          },
          "Action": "kms:*",
          "Resource": "*"
        },
        {
          "Sid": "Allow use of the key",
          "Effect": "Allow",
          "Principal": {
            "AWS": principals
          },
          "Action": [
            "kms:Encrypt",
            "kms:Decrypt",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:DescribeKey"
          ],
          "Resource": "*"
        },
        {
          "Sid": "Allow use of the encryption key from other accounts",
          "Effect": "Allow",
          "Principal": {
            "AWS": "*"
          },
          "Action": [
            "kms:Encrypt",
            "kms:ReEncrypt*",
            "kms:GenerateDataKey*",
            "kms:DescribeKey"
          ],
          "Resource": "*"
        }
      ]
    }
  }

  async setupKMSKey(kms, keyName, accountId: string, principals: string[]) {
    let aliases = (await kms.listAliases().promise()).Aliases;
    let currentAlias;
    aliases.forEach((alias) => {
      if (alias.AliasName === 'alias/' + keyName) {
        currentAlias = alias;
      }
    });
    if (currentAlias) {
      return currentAlias.AliasArn.substr(0, currentAlias.AliasArn.lastIndexOf(':')) + ':key/' + currentAlias.TargetKeyId;
    }
    let key = await kms.createKey({Policy: JSON.stringify(this.getKMSKeyPolicy(accountId, principals))}).promise();
    await kms.createAlias({AliasName: 'alias/' + keyName, TargetKeyId: key.KeyMetadata.KeyId}).promise();
    return key.KeyMetadata.Arn;
  }

  async configure(aws, account, region = undefined) {
    if (this._accounts.isMainAccount(account.Id)) {
      let principals : string[] = [];
      if (this._params.deployment.taskRole) {
        principals.push(this._params.deployment.taskRole);  
      }
      let backupRegion = this._params.backupRegion || 'eu-west-1';
      let mainRegion = this._params.mainRegion || 'us-east-1';
      // Work on the backup region first
      let kms = new aws.KMS({region: backupRegion});
      let kmsArn = await this.setupKMSKey(kms, this._params.kmsKeyName, account.Id, principals);
      let s3 = new aws.S3({region: backupRegion});
      this.log('DEBUG', 'Should Trail bucket setup once on', account);
      // Setup Backup bucket
      if (this._params.s3BackupBucket) {
        if (!(await this.bucketExists(s3, this._params.s3BackupBucket))) {
          await this.bucketCreate(s3, this._params.s3BackupBucket);
        }
        // Enable encryption
        if (!(await this.bucketHasEncryption(s3, this._params.s3BackupBucket))) {
          let configuration = {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'aws:kms',
                  KMSMasterKeyID: kmsArn
                }
              }
            ]
          };
          await this.bucketSetEncryption(s3, this._params.s3BackupBucket, configuration);
        }
        // Enable versioning
        if (!(await this.bucketHasVersioning(s3, this._params.s3BackupBucket))) {
          await this.bucketSetVersioning(s3, this._params.s3BackupBucket);
        }
      }

      // Setup main bucket
      kms = new aws.KMS({region: mainRegion});
      kmsArn = await this.setupKMSKey(kms, this._params.kmsKeyName, account.Id, principals);
      s3 = new aws.S3({region: mainRegion});
      if (!(await this.bucketExists(s3, this._params.s3Bucket))) {
        await this.bucketCreate(s3, this._params.s3Bucket);
      }
      // Enable encryption
      if (!(await this.bucketHasEncryption(s3, this._params.s3Bucket))) {
        let configuration = {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
                KMSMasterKeyID: kmsArn
              }
            }
          ]
        };
        await this.bucketSetEncryption(s3, this._params.s3Bucket, configuration);
      }
      // Enable versioning
      if (!(await this.bucketHasVersioning(s3, this._params.s3Bucket))) {
        await this.bucketSetVersioning(s3, this._params.s3Bucket);
      }
      this.log('DEBUG', 'Create cloudtrail queue', this._params.cloudTrailQueue);
      let sqs = new aws.SQS();
      let queues = (await sqs.listQueues().promise()).QueueUrls;
      let currentQueue;
      queues.forEach( (queue) => {
        if (queue.endsWith('/' + this._params.cloudTrailQueue)) {
          currentQueue = queue;
        }
      });
      if (!currentQueue) {
        this.log('DEBUG', 'Creating the queue', this._params.cloudTrailQueue); 
        currentQueue = (await sqs.createQueue({QueueName: this._params.cloudTrailQueue}).promise()).QueueUrl;
      }
      this.log('DEBUG', 'Checking S3 Events are configured correctly', currentQueue);
      let notifications = (await s3.getBucketNotificationConfiguration({Bucket: this._params.s3Bucket}).promise());
      //this.log('DEBUG', notifications, currentQueue,);
      //process.exit(0);
      let notification;
      if (!notification) {
        let queueArn = (await sqs.getQueueAttributes({
          QueueUrl: currentQueue,
          AttributeNames: ['QueueArn']
        }).promise()).Attributes.QueueArn;
        notifications.QueueConfigurations.push({
          Events: ['s3:ObjectCreated:*'],
          QueueArn: queueArn
        });
        await s3.putBucketNotificationConfiguration({
          Bucket: this._params.s3Bucket,
          NotificationConfiguration: notifications
        }).promise();
      }
      if (this._params.s3BackupBucket) {
        // Setup bucket replication
        let replication;
        try {
          replication = await s3.getBucketReplication({Bucket: this._params.s3Bucket}).promise();
        } catch (err) {
          // Swallow ReplicationConfigurationNotFoundError
          if (err.code !== 'ReplicationConfigurationNotFoundError') {
            throw err;
          }
        }
        this.log('DEBUG', 'Replication is', replication);
        if (!replication) {
          await s3.putBucketReplication({
            Bucket: this._params.s3Bucket,
            ReplicationConfiguration: {
              Role: '',
              Rules: [
                {
                 Destination: {
                  Bucket: "arn:aws:s3:::" + this._params.s3BackupBucket, 
                  StorageClass: "STANDARD"
                 }, 
                 Prefix: "",
                 Status: "Enabled"
               }
              ]
            }
          });
        }
      }
    }
    this.log('DEBUG', 'Should CloudTrail setup on', account, this._params.cloudTrailName);
    process.exit(0);
  }

  static getModda() {
    return {
      "uuid": "IvoryShield/CloudTrailSetup",
      "label": "CloudTrails Setup",
      "description": "Enable CloudTrail on every accounts, create S3 bucket to store the trails, create a backup S3 bucket for multi-region disaster recovery, and a KMS key to encrypt the trails",
      "webcomponents": [],
      "logo": "images/icons/dynamodb.png",
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "configuration": {
        "schema": {
          type: "object",
          properties: {
            "s3Bucket": {
              type: "string",
              title: "S3 Bucket for CloudTrail storage"
            },
            "s3BackupBucket": {
              type: "string",
              title: "S3 Bucket for CloudTrail storage backup"
            },
            "cloudTrailName": {
              type: "string",
              default: "IvoryShield",
              title: "CloudTrail name"
            },
            "cloudTrailQueue": {
              type: "string",
              default: "IvoryShield",
              title: "SQS Queue name for S3 events"
            },
            "kmsKeyName": {
              type: "string",
              title: "KMS Key name for CloudTrail event encryption"
            }
          },
          required: ["s3Bucket", "kmsKeyName"]
        }
      }
    }
  }
}

export {
  CloudTrailSetup
};
