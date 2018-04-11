import { Validator } from './validator';

export default class AutoTagCreatorValidator extends Validator {
  async validate(aws, resource) : Promise<any> {
    let metrics = {};
    let promise = Promise.resolve();
    let error = '';
    if (!resource.canTag() || !resource._fromEvent || !resource._fromEvent.eventName.startsWith('Create')) {
      return Promise.resolve(metrics);
    }
    if (resource._fromEvent.eventName === 'CreateTags') {
      return Promise.resolve(metrics);	
    }
    if (!resource.getTag(this.getTagName('creator')) && resource._fromEvent.userIdentity) {
    	return this.updateTag(resource, 'creator', resource._fromEvent.userIdentity.arn);
    }
    return Promise.resolve(metrics)
  }

  static getModda() {
    return {
      "uuid": "IvoryShield/AutoTagCreator",
      "label": "AutoTagCreator",
      "description": "Add a tag to any resources created with the creator of the resource",
      "webcomponents": [],
      "logo": "images/icons/dynamodb.png",
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "configuration": {
        "schema": {
          type: "object",
          description: "When we receive a Create event, we will tag the resource with the name of the current user",
          properties: {
            "tagName": {
              type: "string",
              title: "Tag name for creator",
            }
          },
          required: ["tagName"]
        }
      }
    }
  }
}