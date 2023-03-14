import { join } from 'path';
import {
  assertDeployedEndpoint,
  DeploymentConfiguration,
  env,
  execPromise,
  fsPromises,
} from '@e2e/shared-scripts';
import * as cf from '@pulumi/cloudflare';
import { version } from '@pulumi/cloudflare/package.json';
import * as pulumi from '@pulumi/pulumi';
import { Stack } from '@pulumi/pulumi/automation';

export function createCfDeployment(
  projectName: string,
  isModule = false,
): DeploymentConfiguration<{
  workerUrl: string;
}> {
  return {
    name: projectName,
    prerequisites: async (stack: Stack) => {
      console.info('\t\tℹ️ Installing Pulumi CF plugin...');
      // Intall Pulumi CF Plugin
      await stack.workspace.installPlugin('cloudflare', version, 'resource');

      // Build and bundle the worker
      console.info('\t\tℹ️ Bundling the CF Worker....');
      await execPromise('yarn build', {
        cwd: join(__dirname, '..', '..', projectName),
      });
    },
    config: async (stack: Stack) => {
      // Configure the Pulumi environment with the CloudFlare credentials
      // This will allow Pulummi program to just run without caring about secrets/configs.
      // See: https://www.pulumi.com/registry/packages/cloudflare/installation-configuration/
      await stack.setConfig('cloudflare:apiToken', {
        value: env('CLOUDFLARE_API_TOKEN'),
      });
      await stack.setConfig('cloudflare:accountId', {
        value: env('CLOUDFLARE_ACCOUNT_ID'),
      });
    },
    program: async () => {
      const stackName = pulumi.getStack();
      const workerUrl = `e2e.graphql-yoga.com/${stackName}`;

      // Deploy CF script as Worker
      const workerScript = new cf.WorkerScript('worker', {
        accountId: env('CLOUDFLARE_ACCOUNT_ID'),
        content: await fsPromises.readFile(
          join(__dirname, '..', '..', projectName, 'dist', 'index.js'),
          'utf-8',
        ),
        module: isModule,
        name: stackName,
        plainTextBindings: [
          {
            name: 'WORKER_PATH',
            text: `/${stackName}`,
          },
        ],
      });

      // Create a nice route for easy testing
      new cf.WorkerRoute('worker-route', {
        scriptName: workerScript.name,
        pattern: workerUrl + '*',
        zoneId: env('CLOUDFLARE_ZONE_ID'),
      });

      return {
        workerUrl: `https://${workerUrl}`,
      };
    },
    test: async ({ workerUrl }) => {
      console.log(`ℹ️ CloudFlare Worker deployed to URL: ${workerUrl.value}`);
      await assertDeployedEndpoint(workerUrl.value);
    },
  };
}
