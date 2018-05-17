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
import {
  IvoryShieldService
} from './services/service';

let Resources = {
  AMI: require('./resources/AMI').AMI,
  EC2Instance: require('./resources/EC2Instance').EC2Instance,
  EC2Resource: require('./resources/EC2Resource').EC2Resource,
  EIP: require('./resources/EIP').EIP,
  IAMResource: require('./resources/IAMResource').IAMResource,
  IAMUser: require('./resources/IAMUser').IAMUser,
  InternetGateway: require('./resources/InternetGateway').InternetGateway,
  NatGateway: require('./resources/NatGateway').NatGateway,
  NetworkInterface: require('./resources/NetworkInterface').NetworkInterface,
  Resource: require('./resources/Resource').Resource,
  S3Bucket: require('./resources/S3Bucket').S3Bucket,
  SecurityGroup: require('./resources/SecurityGroup').SecurityGroup,
  Snapshot: require('./resources/Snapshot').Snapshot,
  Subnet: require('./resources/Subnet').Subnet,
  Volume: require('./resources/Volume').Volume,
  Vpc: require('./resources/Vpc').Vpc
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
  Resources,
  IvoryShieldService
};
