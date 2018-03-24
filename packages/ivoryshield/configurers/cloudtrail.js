const Configurer = require('./configurer');

module.exports = class CloudTrailSetup extends Configurer {


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
              type: "string"
            },
            "s3BackupBucket": {
              type: "string"
            },
            "cloudTrailName": {
              type: "string",
              default: "IvoryShield"
            },
            "kmsKeyName": {
              type: "string"
            }
          },
          required: ["s3Bucket", "kmsKeyName"]
        }
      }
    }
  }
}