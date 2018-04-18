import {
  Service
} from '../services/service';

export class Configurer extends Service {

  isEnableOn(account, region) {
    // Override this method to filter by account or region
    return true;
  }

  isGlobal() {
    return true;
  }

  configure(aws, account, region = undefined) {

  }
}
