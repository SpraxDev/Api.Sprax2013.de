import { FastifyInstance } from 'fastify';
import { autoInjectable } from 'tsyringe';
import BadRequestError from '../../../http/errors/BadRequestError.js';
import NotFoundError from '../../../http/errors/NotFoundError.js';
import type { UsernameToUuidResponse } from '../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileService from '../../../minecraft/MinecraftProfileService.js';
import FastifyWebServer from '../../FastifyWebServer.js';
import Router from '../Router.js';

@autoInjectable()
export default class MinecraftV2Router implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService
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

          const profile = await this.minecraftProfileService.provideProfileByUsername(inputUsername);
          if (profile == null) {
            throw new NotFoundError('No UUID found for username');
          }

          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .send({
              id: profile.profile.id,
              name: profile.profile.name
            } satisfies UsernameToUuidResponse);
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

          let profile;
          if (inputUserLooksLikeUsername) {
            profile = await this.minecraftProfileService.provideProfileByUsername(inputUser);
          } else {
            profile = await this.minecraftProfileService.provideProfileByUuid(inputUser);
          }

          if (profile == null) {
            throw new NotFoundError(`Unable to find a profile for the given ${inputUserLooksLikeUsername ? 'username' : 'UUID'}`);
          }
          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .send(profile.profile);
        }
      });
    });
  }
}
