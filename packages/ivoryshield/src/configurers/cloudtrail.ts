import {
  Configurer
} from './configurer';
import {
  S3MixIn,
  Service,
  Webda
} from '../services/s3-mixin';
import {
  S3,
  Response,
  AWSError
} from 'aws-sdk';

export default class CloudTrailSetup extends S3MixIn(Configurer) {

  _kmsKeyId: string;

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

  getKMSKeyPolicy(mainAccount: string, principals: string[]) {
    return {
      "Version": "2012-10-17",
      "Id": "ivoryshield-key-policy",
      "Statement": [{
          "Sid": "Enable IAM User Permissions",
          "Effect": "Allow",
          "Principal": {
            "AWS": `arn:aws:iam::${mainAccount}:root`
          },
          "Action": "kms:*",
          "Resource": "*"
        },
        {
          "Sid": "IvoryShield-Accounts",
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

  async doCreateKMSKey(kms, name, policy) {
    let key = await kms.createKey({
      Policy: policy
    }).promise();
    await kms.createAlias({
      AliasName: 'alias/' + name,
      TargetKeyId: key.KeyMetadata.KeyId
    }).promise();
    return key.KeyMetadata.Arn;
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
    this.log('ACTION', 'Will create a new KMS key on', accountId, 'with alias', keyName);
    if (this.pretend()) {
      return 'arn:fakekms:key';
    }
    this.doCreateKMSKey(kms, keyName, JSON.stringify(this.getKMSKeyPolicy(accountId, principals)));
  }

  normalizeParams() {
    this._params.mainRegion = this._params.mainRegion || 'us-east-1';
  }

  async init() : Promise<void> {
    await super.init();
  }

  getQueueUrl() {
    // https://sqs.us-east-1.amazonaws.com/820410587685/cloudtrails-queue
    let mainAccount = this.getAccountService().getMainAccountId();
    return `https://sqs.${this._params.mainRegion}.amazonaws.com/${mainAccount}/${this._params.cloudTrailQueue}`;
  }

  async checkBucketPolicy(s3) {
    let policy = JSON.parse((await this.bucketGetPolicy(s3, this._params.s3Bucket)).Policy);
    let accounts = await this.getAccountService().getAccounts();
    let current = policy.Statement.filter((stat) => stat.Sid.startsWith('IvoryShield-CloudTrail'));
    let custom = policy.Statement.filter((stat) => !stat.Sid.startsWith('IvoryShield-CloudTrail'));
    let needed = accounts.map( acc => ({
      'Sid': `IvoryShield-CloudTrail-${acc.Alias}`,
      'Effect': 'Allow',
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": "s3:PutObject",
      "Resource": `arn:aws:s3:::${this._params.s3Bucket}/${acc.Alias}/AWSLogs/${acc.Id}/*`,
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control"
        }
      }
    }));
    needed.push({
      "Sid": "IvoryShield-CloudTrail",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudtrail.amazonaws.com"
      },
      "Action": [
        "s3:GetBucketAcl",
        "s3:ListBucket"
      ],
      "Resource": `arn:aws:s3:::${this._params.s3Bucket}`
    });
    if (JSON.stringify(current) !== JSON.stringify(needed)) {
      policy.Statement = needed.concat(custom);
      this.log('ACTION', 'Update S3 Trails bucket policy');
      await this.doBucketSetPolicy(s3, this._params.s3Bucket, JSON.stringify(policy));
    }
  }

  async configure(aws, account, region = undefined) {
    let backupRegion = this._params.backupRegion || 'eu-west-1';
    let mainRegion = this._params.mainRegion || 'us-east-1';
    if (this.getAccountService().isMainAccount(account.Id)) {
      let principals: string[] = [];
      if (this._params.deployment.taskRole) {
        principals.push(this._params.deployment.taskRole);
      }

      // Work on the backup region first
      let kms = new aws.KMS({
        region: backupRegion
      });
      let kmsArn = await this.setupKMSKey(kms, this._params.kmsKeyName, account.Id, principals);
      let s3 = new aws.S3({
        region: backupRegion
      });
      this.log('DEBUG', 'Should Trail bucket setup once on', account);
      // Setup Backup bucket
      if (this._params.s3BackupBucket) {
        if (!(await this.bucketExists(s3, this._params.s3BackupBucket))) {
          await this.bucketCreate(s3, this._params.s3BackupBucket);
        }
        // Enable encryption
        if (!(await this.bucketHasEncryption(s3, this._params.s3BackupBucket))) {
          let configuration = {
            Rules: [{
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
                KMSMasterKeyID: kmsArn
              }
            }]
          };
          await this.bucketSetEncryption(s3, this._params.s3BackupBucket, configuration);
        }
        // Enable versioning
        if (!(await this.bucketHasVersioning(s3, this._params.s3BackupBucket))) {
          await this.bucketSetVersioning(s3, this._params.s3BackupBucket);
        }
      }

      // Setup main bucket
      kms = new aws.KMS({
        region: mainRegion
      });
      kmsArn = await this.setupKMSKey(kms, this._params.kmsKeyName, account.Id, principals);
      s3 = new aws.S3({
        region: mainRegion
      });
      if (!(await this.bucketExists(s3, this._params.s3Bucket))) {
        await this.bucketCreate(s3, this._params.s3Bucket);
      }
      this._kmsKeyId = kmsArn;
      // Enable encryption
      if (!(await this.bucketHasEncryption(s3, this._params.s3Bucket))) {
        let configuration = {
          Rules: [{
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
              KMSMasterKeyID: kmsArn
            }
          }]
        };
        await this.bucketSetEncryption(s3, this._params.s3Bucket, configuration);
      }
      // Enable versioning
      if (!(await this.bucketHasVersioning(s3, this._params.s3Bucket))) {
        await this.bucketSetVersioning(s3, this._params.s3Bucket);
      }
      await this.checkBucketPolicy(s3);
      let sqs = new aws.SQS();
      let queues = (await sqs.listQueues().promise()).QueueUrls;
      let currentQueue;
      queues.forEach((queue) => {
        if (queue.endsWith('/' + this._params.cloudTrailQueue)) {
          currentQueue = queue;
        }
      });
      if (!currentQueue) {
        this.log('DEBUG', 'Create the queue', this._params.cloudTrailQueue);
        if (this.pretend()) {
          currentQueue = `https://sqs.${mainRegion}.amazonaws.com/${account.Id}/${this._params.cloudTrailQueue}`;
          this.log('DEBUG', 'Fake queue is', currentQueue);
        } else {
          currentQueue = (await sqs.createQueue({
            QueueName: this._params.cloudTrailQueue
          }).promise()).QueueUrl;
        }
      }
      let queue;
      if (!this.pretend()) {
        queue = (await sqs.getQueueAttributes({
          QueueUrl: currentQueue,
          AttributeNames: ['QueueArn', 'Policy']
        }).promise()).Attributes;
      } else {
        queue = {
          QueueArn: `arn:aws:sqs:${mainRegion}:${account.Id}:${this._params.cloudTrailQueue}`
        };
      }
      this.log('DEBUG', 'Checking S3 Events are configured correctly', currentQueue);
      let notifications = (await s3.getBucketNotificationConfiguration({
        Bucket: this._params.s3Bucket
      }).promise());
      let notification;
      notifications.QueueConfigurations.forEach((notif) => {
        if (notif.QueueArn === queue.QueueArn) {
          notification = notif;
        }
      });
      if (!notification) {
        if (!queue.Policy) {
          let policy = {
            "Version": "2012-10-17",
            "Id": "arn:aws:sqs:" + mainRegion + ":" + account.Id + ":" + this._params.cloudTrailQueue + "/SQSDefaultPolicy",
            "Statement": [{
              "Sid": "Ivoryshield",
              "Effect": "Allow",
              "Principal": "*",
              "Action": "SQS:SendMessage",
              "Resource": "arn:aws:sqs:" + mainRegion + ":" + account.Id + ":" + this._params.cloudTrailQueue,
              "Condition": {
                "ArnLike": {
                  "aws:SourceArn": "arn:aws:s3:*:*:" + this._params.s3Bucket
                }
              }
            }]
          };
          this.log('ACTION', 'Set Queue Attributes on', currentQueue);
          if (!this.pretend()) {
            await sqs.setQueueAttributes({
              QueueUrl: currentQueue,
              Attributes: {
                'Policy': JSON.stringify(policy)
              }
            }).promise();
          }
        }
        notifications.QueueConfigurations.push({
          Events: ['s3:ObjectCreated:*'],
          QueueArn: queue.QueueArn
        });
        this.log('ACTION', 'Set bucket notification configuration on S3 Bucket', this._params.s3Bucket);
        if (!this.pretend()) {
          await s3.putBucketNotificationConfiguration({
            Bucket: this._params.s3Bucket,
            NotificationConfiguration: notifications
          }).promise();
        }
      }
      if (this._params.s3BackupBucket) {
        // Setup bucket replication
        let replication;
        try {
          replication = await s3.getBucketReplication({
            Bucket: this._params.s3Bucket
          }).promise();
        } catch (err) {
          // Swallow ReplicationConfigurationNotFoundError
          if (err.code !== 'ReplicationConfigurationNotFoundError') {
            throw err;
          }
        }
        this.log('DEBUG', 'Replication is', replication);
        if (!replication) {
          let iam = new aws.IAM();
          let roles = await iam.listRoles().promise();
          this.log('ACTION', 'Set replication on S3 Bucket', this._params.s3Bucket);
          if (!this.pretend()) {
            await s3.putBucketReplication({
              Bucket: this._params.s3Bucket,
              ReplicationConfiguration: {
                Role: '',
                Rules: [{
                  Destination: {
                    Bucket: "arn:aws:s3:::" + this._params.s3BackupBucket,
                    StorageClass: "STANDARD"
                  },
                  Prefix: "",
                  Status: "Enabled"
                }]
              }
            });
          }
        }
      }
    }
    this.log('DEBUG', 'Should CloudTrail setup on', account, this._params.cloudTrailName);
    let cloudtrail = new aws.CloudTrail({
      region: mainRegion
    });
    let trails = (await cloudtrail.describeTrails().promise()).trailList;
    let currentTrail;
    for (let i in trails) {
      if (trails[i].Name === this._params.cloudTrailName) {
        currentTrail = trails[i];
      }
    }
    let needUpdate = false;
    //console.log(account);
    let targetConfiguration = {
      Name: this._params.cloudTrailName,
      S3BucketName: this._params.s3Bucket,
      S3KeyPrefix: account.Alias,
      IncludeGlobalServiceEvents: true,
      KmsKeyId: this._kmsKeyId,
      EnableLogFileValidation: true,
      IsMultiRegionTrail: true
    }
    if (!currentTrail) {
      this.log('ACTION', 'Create trail for', account.Name);
      await this.doCreateTrail(cloudtrail, targetConfiguration);
      return;
    }
    for (let i in targetConfiguration) {
      if (i === 'EnableLogFileValidation') {
        continue;
      }
      if (currentTrail[i] !== targetConfiguration[i]) {
        this.log('DEBUG', i, 'is not equal', currentTrail[i], targetConfiguration[i]);
        needUpdate = true;
      }
    }
    if (needUpdate) {
      this.log('ACTION', 'Update trail for', account.Name);
      await this.doUpdateTrail(cloudtrail, targetConfiguration);
    }
    let status = await cloudtrail.getTrailStatus({
      Name: currentTrail.TrailARN
    }).promise();
    if (!status.IsLogging) {
      this.log('VULN', 'Restart trail for', account.Name);
      await this.doStartTrail(cloudtrail, currentTrail.TrailARN);
    }

  }

  async doStartTrail(cloudtrail, trailArn) {
    await cloudtrail.startLogging({
      Name: trailArn
    }).promise();
  }

  async doCreateTrail(cloudtrail, configuration) {
    let trail = await cloudtrail.createTrail(configuration).promise();
    await this.doStartTrail(cloudtrail, trail.TrailARN);
  }

  async doUpdateTrail(cloudtrail, configuration) {
    return cloudtrail.updateTrail(configuration);
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
            "s3ReplicationRole": {
              type: "string",
              title: "IAM Role to use for replication between buckets",
              default: "ivoryshield-trails-replication-role"
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
