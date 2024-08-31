import 'reflect-metadata';
import { container, Lifecycle } from 'tsyringe';
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

container.register('value.proxies.http', { useFactory: (container): string[] => [] });  // FIXME: Make configurable
container.register('value.http.allowNonProxyConnections', { useFactory: (container): boolean => false }); // FIXME: Make configurable and fallback to true on dev-env
