const WebdaServer = require("webda-shell/handlers/http");
const Executor = require("webda/services/executor");
const Validator = require("../validators/validator");
const Configurer = require("../configurers/configurer");
const path = require('path');
const fs = require('fs');
const AWSServiceMixIn = require("../services/aws-mixin");

class ConfigurationService extends AWSServiceMixIn(Executor) {
  init(params) {
    this._awsCache = {};
    this._params = this._params || {};
    console.log('init configuration service');
    this._addRoute('/api/credentials', {"method": ["GET", "PUT"], "executor": this._name, "_method": this._restCredentials});
    this._addRoute('/api/accounts', {"method": ["GET", "PUT"], "executor": this._name, "_method": this._restAccounts});
    this._addRoute('/api/organization/enable', {"method": ["PUT"], "executor": this._name, "_method": this.enableOrganization});
    this._addRoute('/api/organization/disable', {"method": ["PUT"], "executor": this._name, "_method": this.disableOrganization});
    this._addRoute('/api/accounts/test', {"method": ["PUT"], "executor": this._name, "_method": this.testConnection});
    this._addRoute('/api/me', {"method": ["GET"], "executor": this._name, "_method": this.getMe});
    this._addRoute('/api/configurers', {"method": ["GET", "PUT"], "executor": this._name, "_method": this._restConfigurers});
    this._addRoute('/api/validators', {"method": ["GET", "PUT"], "executor": this._name, "_method": this._restValidators});
    this._addRoute('/api/deployment', {"method": ["GET", "PUT"], "executor": this._name, "_method": this._restDeployment});
    this.load();
    this._config.credentials = this._config.credentials || {};
    this._config.configurers = this._config.configurers || {};
    this._config.validators = this._config.validators || {};
    this._aws = this._getAWS({region: 'us-east-1', accessKeyId: this._config.credentials.accessKeyId, secretAccessKey: this._config.credentials.secretAccessKey});
    this.reinitClients();
  }

  getServicesImplementations(type) {
    let result = {};
    for (let i in this._webda._services) {
      // Check if it is a Validator and has Modda
      if (this._webda._services[i].prototype instanceof type && this._webda._services[i].getModda) {
        result[i] = this._webda._services[i].getModda();
      }
    }
    return result;
  }

  _restDeployment(ctx) {
    if (ctx._route._http.method === 'GET') {
      ctx.write(this._config.deployment || {});
    } else if (ctx._route._http.method === 'PUT') {
      this._config.deployment = ctx.body;
      return this.save();
    }
  }
  _restValidators(ctx) {
    if (ctx._route._http.method === 'GET') {
      // Get map of configurers
      let validators = this.getServicesImplementations(Validator);
      Object.keys(validators).map((key, index) => {
        validators[key].enable = this._config.validators[key] !== undefined;
        if (validators[key].configuration) {
          validators[key].configuration.value = this._config.validators[key];
        }
      });
      ctx.write(validators);
    } else if (ctx._route._http.method === 'PUT') {
      if (ctx.body.enable) {
        this._config.validators[ctx.body.uuid] = ctx.body.configuration;
      } else {
        delete this._config.validators[ctx.body.uuid];
      }
      return this.save();
    }
  }

  _restConfigurers(ctx) {
    if (ctx._route._http.method === 'GET') {
      // Get map of configurers
      let configurers = this.getServicesImplementations(Configurer);
      Object.keys(configurers).map((key, index) => {
        configurers[key].enable = this._config.configurers[key] !== undefined;
        if (configurers[key].configuration) {
          configurers[key].configuration.value = this._config.configurers[key];
        }
      });
      ctx.write(configurers);
    } else if (ctx._route._http.method === 'PUT') {
      if (ctx.body.enable) {
        this._config.configurers[ctx.body.uuid] = ctx.body.configuration;
      } else {
        delete this._config.configurers[ctx.body.uuid];
      }
      return this.save();
    }
  }

  _restAccounts(ctx) {
    if (ctx._route._http.method === 'PUT') {
      if (!this._config.accounts) {
        throw 400;
      }
      this._config.accounts = ctx.body;
      return this.save();
    } else if (ctx._route._http.method === 'GET') {
      if (this._config.accounts) {
        ctx.write(this._config.accounts);
      } else {
        return this.getOrganization(ctx);
      }
    }
  }

  enableOrganization(ctx) {
    delete this._config.accounts;
    return this.save().then( () => {
      this.organization = new (this._aws.Organizations)().listAccounts({}).promise();
      return this.getOrganization(ctx);
    });
  }

  disableOrganization(ctx) {
    this._config.accounts = [];
    return this.save().then( () => {
      ctx.write(this._config.accounts);
    });
  }

  reinitClients() {
    this._sts = new this._aws.STS();
    this.mainAccount = this._sts.getCallerIdentity().promise();
    if (!this._config.accounts) {
      this.organization = new (this._aws.Organizations)().listAccounts({}).promise();
    }
  }

  testConnection(ctx) {
    this._aws = this._getAWS({region: 'us-east-1', accessKeyId: ctx.body.accessKeyId, secretAccessKey: ctx.body.secretAccessKey});
    this.reinitClients();
    let promise;
    if (this._config.accounts) {
      promise = Promise.resolve({Accounts: this._config.accounts});
    } else {
      promise = this.organization;
    }
    let accounts;
    return promise.then( (res) => {
      accounts = res.Accounts;
      let promises = accounts.map( (acc) => {
        acc.AssumeRoleSuccessful = false;
        acc.AssumeRoleError = null;
        return this._assumeRole(acc.Id, ctx.body.role, ctx.body.externalId, 'us-east-1', true).then( () => {
          acc.AssumeRoleSuccessful = true;
        }).catch( (err) => {
          acc.AssumeRoleError = err;
          acc.AssumeRoleSuccessful = false;
        });
      });
      return Promise.all(promises);
    }).then( () => {
      ctx.write(accounts);
    });
  }

  save() {
    return new Promise( (resolve, reject) => {
      this._config.lastUpdate = new Date();
      if (this._config.accounts) {
        this._config.accounts.map((acc) => {
          delete acc.AssumeRoleSuccessful;
          delete acc.AssumeRoleError;
        });
      }
      fs.writeFile('./ivoryshield.config.json', JSON.stringify(this._config, null, ' '), (err, res) => {
        if (err) {
          reject(err);
        }
        resolve(res);
      });
    });
  }

  load() {
    if (fs.existsSync(ConfigurationService.CONFIG_FILENAME)) {
      this._config = JSON.parse(fs.readFileSync(ConfigurationService.CONFIG_FILENAME));
    } else {
      this._config = {credentials: {role: 'OrganizationAccountAccessRole'}};
    }
  }

  _restCredentials(ctx) {
    if (ctx._route._http.method === 'PUT') {
      this._config.credentials = ctx.body;
      return this.save();
    } else if (ctx._route._http.method === 'GET') {
      // Get credentials
      ctx.write(this._config.credentials);
    }
  }

  getMe(ctx) {
    let mainAccount;
    return this.mainAccount.then( (acc) => {
      mainAccount = acc;
    }).catch( (err) => {
      console.log('Cannot get the main account');
    }).then( () => {
      ctx.write({mainAccount: mainAccount, useOrganization: this._config.accounts === undefined});
    });
  }

  getOrganization(ctx) {
    return this.organization.then( (accounts) => {
      ctx.write(accounts.Accounts);
    }).catch( (err) => {
      if (err.code === 'AccessDeniedException') {
        throw 403;
      }
      throw 500;
    });
  }
}
ConfigurationService.CONFIG_FILENAME = './ivoryshield.config.json';

var ServerConfig = {
  version: 1,
  parameters: {
    website: {
      url: 'localhost',
      path: 'wui/',
      index: 'index.html'
    }
  },
  services: {
    configuration: {
      require: ConfigurationService
    }
  }
};

class IvoryShieldConfigurationServer extends WebdaServer {
  serveStaticWebsite(express, app) {
    app.use(express.static(__dirname + '/../wui/'));
  }

  serveIndex(express, app) {
    app.use(express.static(__dirname + '/../wui/index.html'));
    app.get('*', this.handleStaticIndexRequest.bind(this));
  }

  serve(port, openBrowser) {
    this._staticIndex = path.resolve(__dirname + '/../wui/index.html');
    // This is the configuration server
    super.serve(port);
    if (openBrowser || openBrowser === undefined) {
      var open = require('open');
      open("http://localhost:" + port);
    }
  }

  loadConfiguration(config) {
    return ServerConfig;
  }
}

module.exports = class IvoryShieldConsole {
  static help() {
    let lines = [];
    lines.push('config'.bold + ' launch web ui configuration');
    lines.push('install'.bold + ' setup your AWS accounts');
    lines.push('deploy'.bold + ' deploy your new configuration');
    return this.logo(lines);
  }

  static parser(argv) {
    return argv.argv;
  }

  static logo(lines = []) {
    const logoLines = require('./logo.json');
    console.log('');
    logoLines.forEach( (line, idx) => {
      line = '  ' + line.join('') + '  ';
      if (idx > 0 && lines.length > (idx - 1)) {
        line = line + lines[idx - 1];
      }
      console.log(line);
    });
    console.log('');
  }

  static config(argv) {
    let webda = new IvoryShieldConfigurationServer();
    return new Promise( () => {
      webda.serve(18181, argv.open);
    });
  }

  static install(argv) {

  }

  static deploy(argv) {

  }

  static handleCommand(argv) {
    switch (argv._[0]) {
      case 'config':
        return this.config(argv);
      case 'install':
        return this.install(argv);
      case 'deploy':
        return this.deploy(argv);
      case 'help':
      default:
        return this.help();
    }
  }
}
