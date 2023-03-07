import { join } from 'path';
import {
  assertDeployedEndpoint,
  DeploymentConfiguration,
  env,
  execPromise,
} from '@e2e/shared-scripts';
import * as aws from '@pulumi/aws';
import { version } from '@pulumi/aws/package.json';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import { Stack } from '@pulumi/pulumi/automation';

export function createAwsLambdaDeployment(): DeploymentConfiguration<{
  functionUrl: string;
}> {
  return {
    name: 'aws-lambda',
    prerequisites: async (stack: Stack) => {
      console.info('\t\tℹ️ Installing AWS plugin...');
      // Intall Pulumi AWS Plugin
      await stack.workspace.installPlugin('aws', version, 'resource');

      // Build and bundle the worker
      console.info('\t\tℹ️ Build the AWS Lambda Function....');
      await execPromise('yarn build', {
        cwd: join(__dirname, '..'),
      });
    },
    config: async (stack: Stack) => {
      // Configure the Pulumi environment with the AWS credentials
      // This will allow Pulummi program to just run without caring about secrets/configs.
      // See: https://www.pulumi.com/registry/packages/aws/installation-configuration/
      await stack.setConfig('aws:accessKey', {
        value: env('AWS_ACCESS_KEY'),
      });
      await stack.setConfig('aws:secretKey', {
        value: env('AWS_SECRET_KEY'),
      });
      await stack.setConfig('aws:region', {
        value: env('AWS_REGION'),
      });
      await stack.setConfig('aws:allowedAccountIds', {
        value: `[${env('AWS_ACCOUNT_ID')}]`,
      });
    },
    program: async () => {
      const lambdaRole = new aws.iam.Role('lambda-role', {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
          Service: 'lambda.amazonaws.com',
        }),
      });

      const lambdaRolePolicy = new aws.iam.RolePolicy('role-policy', {
        role: lambdaRole.id,
        policy: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
              Resource: 'arn:aws:logs:*:*:*',
            },
          ],
        },
      });

      const func = new aws.lambda.Function(
        'func',
        {
          role: lambdaRole.arn,
          runtime: 'nodejs14.x',
          handler: 'index.handler',
          code: new pulumi.asset.AssetArchive({
            'index.js': new pulumi.asset.FileAsset(join(__dirname, '../dist/index.js')),
          }),
        },
        { dependsOn: lambdaRolePolicy },
      );

      const lambdaGw = new awsx.apigateway.API('api', {
        routes: [
          {
            path: '/',
            method: 'GET',
            eventHandler: func,
          },
          {
            path: '/greetings/{name}',
            method: 'GET',
            eventHandler: func,
          },
          {
            path: '/bye',
            method: 'POST',
            eventHandler: func,
          },
        ],
      });

      return {
        functionUrl: lambdaGw.url,
      };
    },
    test: async ({ functionUrl }) => {
      console.log(`ℹ️ AWS Lambda Function deployed to URL: ${functionUrl.value}`);
      await assertDeployedEndpoint(functionUrl.value);
    },
  };
}
