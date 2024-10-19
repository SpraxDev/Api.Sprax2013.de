import 'reflect-metadata';
import { container, Lifecycle } from 'tsyringe';
import CreateInternalApiKeyCommand from './cli/commands/CreateInternalApiKeyCommand.js';
import ImportCommand from './cli/commands/ImportCommand.js';
import AppConfiguration from './config/AppConfiguration.js';
import LabymodCapeProvider from './minecraft/cape/provider/LabymodCapeProvider.js';
import MojangCapeProvider from './minecraft/cape/provider/MojangCapeProvider.js';
import OptifineCapeProvider from './minecraft/cape/provider/OptifineCapeProvider.js';
import MinecraftV1Router from './webserver/routes/minecraft/MinecraftV1Router.js';
import MinecraftV2Router from './webserver/routes/minecraft/MinecraftV2Router.js';
import StatusRouter from './webserver/routes/StatusRouter.js';

container.register('Router', { useClass: StatusRouter }, { lifecycle: Lifecycle.Singleton });
container.register('Router', { useClass: MinecraftV2Router }, { lifecycle: Lifecycle.Singleton });
container.register('Router', { useClass: MinecraftV1Router }, { lifecycle: Lifecycle.Singleton });

container.register('CapeProvider', { useClass: MojangCapeProvider }, { lifecycle: Lifecycle.Singleton });
container.register('CapeProvider', { useClass: OptifineCapeProvider }, { lifecycle: Lifecycle.Singleton });
container.register('CapeProvider', { useClass: LabymodCapeProvider }, { lifecycle: Lifecycle.Singleton });

container.register('CliCommand', { useClass: ImportCommand }, { lifecycle: Lifecycle.Singleton });
container.register('CliCommand', { useClass: CreateInternalApiKeyCommand }, { lifecycle: Lifecycle.Singleton });

container.register('value.proxy_server_uris', {
  useFactory: (container): string[] => {
    return container
      .resolve(AppConfiguration)
      .config
      .proxyServerUris
      .split(',')
      .map(uri => uri.trim())
      .filter(uri => uri !== '');
  }
});
