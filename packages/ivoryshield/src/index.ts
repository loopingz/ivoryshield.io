import {
  Configurer
} from './configurers/configurer';
import {
  CloudTrailSetup
} from './configurers/cloudtrail';
import {
  ElkSetup
} from './configurers/elk';
import {
  Validator
} from './validators/validator';
import {
  CounterValidator
} from './validators/counter';
import {
  AutoTagCreatorValidator
} from './validators/autotagcreator';
import {
  CloudTrailService
} from './services/cloudtrail';
import {
  CronCheckerService
} from './services/cronchecker';
import {
  ValidatorService
} from './services/validator';
import {
  AWSServiceMixIn
} from './services/aws-mixin';


let Resources = {
  AMI: require('./AMI').AMI,
  EC2Instance: require('./EC2Instance').EC2Instance,
  EC2Resource: require('./EC2Resource').EC2Resource,
  EIP: require('./EIP').EIP,
  IAMResource: require('./IAMResource').IAMResource,
  IAMUser: require('./IAMUser').IAMUser,
  InternetGateway: require('./InternetGateway').InternetGateway,
  NatGateway: require('./NatGateway').NatGateway,
  NetworkInterface: require('./NetworkInterface').NetworkInterface,
  Resource: require('./Resource').Resource,
  S3Bucket: require('./S3Bucket').S3Bucket,
  SecurityGroup: require('./SecurityGroup').SecurityGroup,
  Snapshot: require('./Snapshot').Snapshot,
  Subnet: require('./Subnet').Subnet,
  Volume: require('./Volume').Volume,
  Vpc: require('./Vpc').Vpc
}
export {
  Configurer,
  CloudTrailSetup,
  ElkSetup,
  Validator,
  CounterValidator,
  AutoTagCreatorValidator,
  CronCheckerService,
  CloudTrailService,
  ValidatorService,
  AWSServiceMixIn,
  Resources
};
