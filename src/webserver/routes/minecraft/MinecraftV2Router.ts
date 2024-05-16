import { FastifyInstance } from 'fastify';
import { autoInjectable } from 'tsyringe';
import BadRequestError from '../../../http/errors/BadRequestError.js';
import NotFoundError from '../../../http/errors/NotFoundError.js';
import type { UsernameToUuidResponse } from '../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileService, { type Profile } from '../../../minecraft/MinecraftProfileService.js';
import MinecraftSkinService from '../../../minecraft/skin/MinecraftSkinService.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import FastifyWebServer from '../../FastifyWebServer.js';
import Router from '../Router.js';

@autoInjectable()
export default class MinecraftV2Router implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftSkinService: MinecraftSkinService
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
          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            throw new NotFoundError(`Unable to find a profile for the given UUID or username`);
          }
          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .send(profile.profile);
        }
      });
    });

    server.all('/mc/v2/skin/:user', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            throw new NotFoundError(`Unable to find a profile for the given UUID or username`);
          }

          const pngImage = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));
          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Content-Type', 'image/png')
            .send(pngImage);
        }
      });
    });
  }

  private async resolveUserToProfile(inputUser: unknown): Promise<Profile | null> {
    if (typeof inputUser !== 'string') {
      throw new BadRequestError('Invalid username or UUID');
    }

    const inputUserLooksLikeUsername = inputUser.length <= 16;
    const inputUserLooksLikeUuid = inputUser.replaceAll('-', '').length === 32;
    if (!inputUserLooksLikeUsername && !inputUserLooksLikeUuid) {
      throw new BadRequestError('Invalid username or UUID');
    }

    if (inputUserLooksLikeUsername) {
      return await this.minecraftProfileService.provideProfileByUsername(inputUser);
    }
    return await this.minecraftProfileService.provideProfileByUuid(inputUser);
  }
}
