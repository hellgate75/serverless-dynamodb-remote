'use strict';

const aws = require('aws-sdk');

const getDynamoDB = serverless => {
  aws.config.update({
    region: serverless.service.provider.region,
    apiVersions: {
      dynamodb: '2012-08-10',
    }
  });
  return new aws.DynamoDB();
}

// Version 2
class DynamoDbPlugin {
  constructor(serverless, options) {
    this.commands = {
      'copy-data': {
        lifecycleEvents: [
          'downloadData',
          'uploadData'
        ],
        usage: 'Pushes/Pulls data from one database to another',
        options: [
          'target-stage': {
            usage: 'Stage you want to upload data to',
            required: true,
            shortcut: 't'
          },
        ],
      },
    };

    this.hooks = {
      'dynamodb-remote:downloadData': downloadData.bind(null, serverless, options),
      'dynamodb-remote:uploadData': uploadData.bind(null, serverless, options),
    };
  }

  const getTableName = (serverless, options, isUpload = false) => {
    const table = serverless.service.resources.Resources[options.resource].Properties.TableName;
    if (!isUpload) return table;
    return table.replace(serverless.service.custom.stage, options['target-stage']);
  }

  const getGetPromise = (dynamodb, params, serverless) => new Promise((resolve, reject) => {
    dynamodb.scan(params, (error, result) => {
      if (error) {
        serverless.cli.log(`Error on downloading data! ${JSON.stringify(error)}`);
        return reject(error);
      }
      serverless.variables.copyData = result;
      serverless.cli.log(`Downloaded ${JSON.stringify(result.Items.length)} items`);
      return resolve(result);
    });
  });


  const downloadData = (serverless, options) => new Promise((resolve, reject) => {
    // function configuring aws-sdk and getting the DynamoDB client
    const dynamodb = getDynamoDB(serverless);
    const params = {
      TableName: getTableName(serverless, options)
    };
    getGetPromise(dynamodb, params, serverless);
  });

  const getPutPromise = (dynamodb, params, serverless) => new Promise((resolve, reject) => {
    dynamodb.putItem(params, (error) => {
      if (error) {
        return reject(error);
      }
      serverless.cli.log(`Uploaded: ${JSON.stringify(params)}`);
      return resolve();
    });
  });

  const uploadData = (serverless, options) => new Promise((resolve, reject) => {
    // function configuring aws-sdk and getting the DynamoDB client
    const dynamodb = getDynamoDB(serverless);
    const uploads = [];

    serverless.variables.DynamoDbPlugin.Items.forEach(data => {
      const params = {
        TableName: getTableName(serverless, options),
        Item: data
      };
      uploads.push(getPutPromise(dynamodb, params, serverless));
    });

    Promise.all(uploads).then(() => {
      serverless.cli.log('Data uploaded successfully!');
      resolve();
    }).catch(error => {
      serverless.cli.log(`Data upload failed: ${JSON.stringify(error)}`);
      reject(error);
    });
  });
}
module.exports = DynamoDbPlugin;
