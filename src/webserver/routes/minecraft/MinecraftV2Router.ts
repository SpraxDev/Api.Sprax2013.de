import { FastifyInstance } from 'fastify';
import { autoInjectable } from 'tsyringe';
import BadRequestError from '../../../http/errors/BadRequestError.js';
import NotFoundError from '../../../http/errors/NotFoundError.js';
import MinecraftApiClient from '../../../minecraft/MinecraftApiClient.js';
import FastifyWebServer from '../../FastifyWebServer.js';
import Router from '../Router.js';

@autoInjectable()
export default class MinecraftV2Router implements Router {
  constructor(
    private readonly minecraftApiClient: MinecraftApiClient
  ) {
  }

  register(server: FastifyInstance): void {
    server.all('/mc/v2/uuid/:username', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const inputUsername = (request.params as any).username;
          if (typeof inputUsername !== 'string' || inputUsername.length > 16 || inputUsername.length < 3) {
            throw new BadRequestError('Invalid username');
          }

          const fetchedUuid = await this.minecraftApiClient.fetchUuidForUsername(inputUsername);
          if (fetchedUuid == null) {
            throw new NotFoundError('No UUID found for username');
          }

          return reply.send({
            id: fetchedUuid.id,
            name: fetchedUuid.name
          });
        }
      });
    });

    server.all('/mc/v2/profile/:user', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const inputUser = (request.params as any).user;
          if (typeof inputUser !== 'string') {
            throw new BadRequestError('Invalid username or UUID');
          }

          const inputUserLooksLikeUsername = inputUser.length <= 16;
          const inputUserLooksLikeUuid = inputUser.replaceAll('-', '').length === 32;
          if (!inputUserLooksLikeUsername && !inputUserLooksLikeUuid) {
            throw new BadRequestError('Invalid username or UUID');
          }

          let userId = inputUser;
          if (inputUserLooksLikeUsername) {
            const fetchedUuid = await this.minecraftApiClient.fetchUuidForUsername(inputUser);
            if (fetchedUuid == null) {
              throw new NotFoundError('No UUID found for username');
            }
            userId = fetchedUuid.id;
          }

          const fetchedProfile = await this.minecraftApiClient.fetchProfileForUuid(userId);
          if (fetchedProfile == null) {
            throw new NotFoundError('No profile found for UUID');
          }

          return reply.send(fetchedProfile);
        }
      });
    });
  }
}
