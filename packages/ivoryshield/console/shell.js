const WebdaServer = require("webda-shell/handlers/http");
const Executor = require("webda/services/executor");
const path = require('path');
const fs = require('fs');
const AWSServiceMixIn = require("../services/aws-mixin");

class ConfigurationService extends AWSServiceMixIn(Executor) {
  init(params) {
    super.init(params);
    this._params = this._params || {};
    console.log('init configuration service');
    this._addRoute('/api/credentials', {"method": ["GET", "PUT"], "executor": this._name, "_method": this._restCredentials});
    this._addRoute('/api/accounts', {"method": ["GET", "PUT"], "executor": this._name, "_method": this.getOrganization});
    this._addRoute('/api/accounts/test', {"method": ["PUT"], "executor": this._name, "_method": this.testConnection});
    this._addRoute('/api/me', {"method": ["GET"], "executor": this._name, "_method": this.getMe});
    this._aws = this._getAWS({region: 'us-east-1'});
    this.reinitClients();
    this.load();
  }


  reinitClients() {
    this._sts = new this._aws.STS();
    this.mainAccount = this._sts.getCallerIdentity().promise();
    this.organization =  new (this._aws.Organizations)().listAccounts({}).promise();
  }

  testConnection(ctx) {
    console.log('Testing all', ctx.body);
    this._aws = this._getAWS({region: 'us-east-1', accessKeyId: ctx.body.accessKeyId, secretAccessKey: ctx.body.secretAccessKey});
    this.reinitClients();
    let accounts;
    return this.organization.then( (res) => {
      accounts = res.Accounts;
      let promises = accounts.map( (acc) => {
        console.log('should test', acc);
        acc.AssumeRoleSuccessful = false;
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
    return this.mainAccount.then( (acc) => {
      ctx.write(acc);
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
