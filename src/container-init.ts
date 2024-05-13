import 'reflect-metadata';
import { container, Lifecycle } from 'tsyringe';
import MinecraftV2Router from './webserver/routes/minecraft/MinecraftV2Router.js';
import StatusRouter from './webserver/routes/StatusRouter.js';

container.register('Router', { useClass: StatusRouter }, { lifecycle: Lifecycle.Singleton });
container.register('Router', { useClass: MinecraftV2Router }, { lifecycle: Lifecycle.Singleton });
