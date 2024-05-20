import { FastifyInstance } from 'fastify';
import { autoInjectable } from 'tsyringe';
import BadRequestError from '../../../http/errors/BadRequestError.js';
import NotFoundError from '../../../http/errors/NotFoundError.js';
import type { UsernameToUuidResponse } from '../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileService, { type Profile } from '../../../minecraft/MinecraftProfileService.js';
import type ImageManipulator from '../../../minecraft/skin/manipulator/ImageManipulator.js';
import MinecraftSkinService from '../../../minecraft/skin/MinecraftSkinService.js';
import SkinImage2DRenderer from '../../../minecraft/skin/renderer/SkinImage2DRenderer.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import FastifyWebServer from '../../FastifyWebServer.js';
import Router from '../Router.js';

@autoInjectable()
export default class MinecraftV2Router implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftSkinService: MinecraftSkinService,
    private readonly skinImage2DRenderer: SkinImage2DRenderer
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

    server.all('/mc/v2/skin/:user/:skinArea?', (request, reply): Promise<void> => {
      function parseSkinArea(input: unknown): 'head' | 'body' | null {
        if (input == null) {
          return null;
        }

        if (input !== 'head' && input !== 'body') {
          throw new BadRequestError(`Only supports "head" or "body" as skin area but got ${JSON.stringify(input)}`);
        }
        return input;
      }

      function parseBoolean(input: unknown): boolean | null {
        if (input == null) {
          return null;
        }

        if (input !== '1' && input !== '0' && input !== 'true' && input !== 'false') {
          throw new BadRequestError(`Expected a "1", "0", "true" or "false" but got ${JSON.stringify(input)}`);
        }
        return input === '1' || input === 'true';
      }

      function parseInteger(input: unknown): number | null {
        if (input == null) {
          return null;
        }

        if (typeof input !== 'string' || !/^\d+$/.test(input)) {
          throw new BadRequestError(`Expected a number but got ${JSON.stringify(input)}`);
        }

        const result = parseInt(input, 10);
        if (Number.isFinite(result)) {
          return result;
        }
        throw new BadRequestError(`Expected a number but got ${JSON.stringify(input)}`);
      }

      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            throw new NotFoundError(`Unable to find a profile for the given UUID or username`);
          }

          const userInputOverlay = (request.query as any).overlay;
          const userInputSize = (request.query as any).size;

          const requestedSkinArea = parseSkinArea((request.params as any).skinArea);
          const renderOverlay = parseBoolean(userInputOverlay) ?? true;
          const renderSize = parseInteger(userInputSize) ?? 512;
          if (userInputOverlay != null && requestedSkinArea == null) {
            throw new BadRequestError('Cannot use "overlay" when just requesting the skin file (without "skinArea" or "3d")');
          }
          if (userInputSize != null && requestedSkinArea == null) {
            throw new BadRequestError('Cannot use "size" when just requesting the skin file (without "skinArea" or "3d")');
          }
          if (renderSize != null && (renderSize < 8 || renderSize > 1024)) {
            throw new BadRequestError('Size must be between 8 and 1024');
          }

          const skin = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));
          let responseSkin: ImageManipulator = skin;

          if (requestedSkinArea === 'head') {
            responseSkin = await this.skinImage2DRenderer.extractHead(skin, renderOverlay);
          } else if (requestedSkinArea === 'body') {
            responseSkin = await this.skinImage2DRenderer.extractBody(skin, renderOverlay, false /* FIXME */);
          }

          const responseResizeOptions = responseSkin === skin ? undefined : { width: renderSize, height: renderSize };
          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Content-Type', 'image/png')
            .send(await responseSkin.toPngBuffer(responseResizeOptions));
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
