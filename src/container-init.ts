import 'reflect-metadata';
import { container, Lifecycle } from 'tsyringe';
import StatusRouter from './webserver/routes/StatusRouter.js';

container.register('Router', { useClass: StatusRouter }, { lifecycle: Lifecycle.Singleton });
