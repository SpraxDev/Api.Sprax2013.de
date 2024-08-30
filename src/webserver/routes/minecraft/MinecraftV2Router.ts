import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Net from 'node:net';
import { autoInjectable } from 'tsyringe';
import HttpClient from '../../../http/HttpClient.js';
import type ImageManipulator from '../../../minecraft/image/ImageManipulator.js';
import type { UsernameToUuidResponse } from '../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileService, { type Profile } from '../../../minecraft/MinecraftProfileService.js';
import ServerBlocklistService, {
  InvalidHostError
} from '../../../minecraft/server/blocklist/ServerBlocklistService.js';
import MinecraftServerStatusService from '../../../minecraft/server/ping/MinecraftServerStatusService.js';
import MinecraftSkinNormalizer from '../../../minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../../../minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinService from '../../../minecraft/skin/MinecraftSkinService.js';
import MinecraftSkinTypeDetector from '../../../minecraft/skin/MinecraftSkinTypeDetector.js';
import SkinImage2DRenderer from '../../../minecraft/skin/renderer/SkinImage2DRenderer.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import { BadRequestError, NotFoundError } from '../../errors/HttpErrors.js';
import FastifyWebServer from '../../FastifyWebServer.js';
import Router from '../Router.js';

@autoInjectable()
export default class MinecraftV2Router implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftSkinService: MinecraftSkinService,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly minecraftSkinTypeDetector: MinecraftSkinTypeDetector,
    private readonly skinImage2DRenderer: SkinImage2DRenderer,
    private readonly serverBlocklistService: ServerBlocklistService,
    private readonly minecraftServerStatusService: MinecraftServerStatusService,
    private readonly httpClient: HttpClient
  ) {
  }

  register(server: FastifyInstance): void {
    server.all('/mc/v2/uuid/:username?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const inputUsername = (request.params as any).username;
          if (typeof inputUsername !== 'string' || inputUsername.length > 16 || inputUsername.length < 3) {
            throw new BadRequestError('Invalid username');
          }

          const profile = await this.minecraftProfileService.provideProfileByUsername(inputUsername);
          if (profile == null) {
            await reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw new NotFoundError('No UUID found for username');
          }

          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send({
              id: profile.profile.id,
              name: profile.profile.name
            } satisfies UsernameToUuidResponse);
        }
      });
    });

    server.all('/mc/v2/profile/:user?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            await reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw new NotFoundError(`Unable to find a profile for the given UUID or username`);
          }
          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(profile.profile);
        }
      });
    });

    server.all('/mc/v2/skin/x-url/:skinArea?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const skinUrl = (request.query as any).url;
          if (typeof skinUrl !== 'string' || skinUrl.length <= 0) {
            throw new BadRequestError('Missing or invalid url parameters');
          }

          let parsedSkinUrl: URL;
          try {
            parsedSkinUrl = new URL(skinUrl);
          } catch (err: any) {
            throw new BadRequestError(`Invalid URL provided`);
          }

          if (parsedSkinUrl.protocol !== 'https:') {
            throw new BadRequestError(`Only HTTPS URLs are supported`);
          }
          // TODO: disallow local, private, etc. IP addresses (also check dns resolution!)
          // TODO: Have trusted domains that don't need to hide the host's IP address

          // TODO: Cache the response (try to respect the Cache-Control header but enforce a minimum cache time and set a maximum cache time of one month)
          // TODO: Properly handle errors when requesting the skin (check content-type?)
          const fetchedSkinImage = await this.httpClient.get(skinUrl);
          if (fetchedSkinImage.statusCode !== 200) {
            throw new BadRequestError(`Failed to fetch skin from URL, got status code ${fetchedSkinImage.statusCode}`);
          }

          const skin = await this.minecraftSkinNormalizer.normalizeSkin(await SkinImageManipulator.createByImage(fetchedSkinImage.body));
          const renderSlim = this.parseBoolean((request.query as any).slim) ?? this.minecraftSkinTypeDetector.detect(skin) === 'alex';

          const skinResponse = await this.processSkinRequest(request, skin, renderSlim);

          reply.header('Content-Type', 'image/png');
          if (skinResponse.forceDownload) {
            reply.header('Content-Disposition', `attachment; filename="x-url${skinResponse.skinArea != null ? `-${skinResponse.skinArea}` : ''}.png"`);
            reply.header('Content-Type', 'application/octet-stream');
          }

          return reply
            // .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(skinResponse.pngBody);
        }
      });
    });

    server.all('/mc/v2/skin/:user/:skinArea?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            await reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw new NotFoundError(`Unable to find a profile for the given UUID or username`);
          }
          const minecraftProfile = new MinecraftProfile(profile.profile);

          const renderSlim = this.parseBoolean((request.query as any).slim) ?? minecraftProfile.parseTextures()?.slimPlayerModel ?? minecraftProfile.determineDefaultSkin() === 'alex';
          const skin = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));

          const skinResponse = await this.processSkinRequest(request, skin, renderSlim);

          reply.header('Content-Type', 'image/png');
          if (skinResponse.forceDownload) {
            reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}${skinResponse.skinArea != null ? `-${skinResponse.skinArea}` : ''}.png"`);
            reply.header('Content-Type', 'application/octet-stream');
          }

          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(skinResponse.pngBody);
        }
      });
    });

    server.all('/mc/v2/server/blocklist', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const blocklist = await this.serverBlocklistService.provideBlocklist();
          return reply
            .header('Cache-Control', 'public, max-age=120, s-maxage=120')
            .send(blocklist);
        }
      });
    });

    server.all('/mc/v2/server/blocklist/check', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const inputHost = (request.query as any).host;
          if (typeof inputHost !== 'string') {
            throw new BadRequestError('Missing or invalid query parameter "host"');
          }

          let blocklist;
          try {
            blocklist = await this.serverBlocklistService.checkBlocklist(inputHost);
          } catch (err: any) {
            if (err instanceof InvalidHostError) {
              throw new BadRequestError(err.message);
            }
            throw err;
          }
          const responseBody: { [key: string]: boolean } = {};
          for (const [host, isBlocked] of blocklist) {
            responseBody[host] = isBlocked;
          }
          return reply
            .header('Cache-Control', 'public, max-age=120, s-maxage=120')
            .send(responseBody);
        }
      });
    });

    server.all('/mc/v2/server/blocklist/discovered', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const blocklist = await this.serverBlocklistService.provideBlocklistForKnownHosts();
          const responseBody: { [key: string]: string } = {};
          for (const listEntry of blocklist) {
            if (listEntry.host != null) {
              responseBody[listEntry.sha1.toString('hex')] = listEntry.host;
            }
          }

          return reply
            .header('Cache-Control', 'public, max-age=120, s-maxage=120')
            .send(responseBody);
        }
      });
    });

    server.all('/mc/v2/server/ping', (request, reply): Promise<FastifyReply> => {
      const validateHost = (inputHost: string) => {
        if (Net.isIP(inputHost) > 0) {
          return;
        }

        if (inputHost.includes(':')) {
          throw new BadRequestError('Invalid host – If you want to provide a port, use the "port" query parameter');
        }
      };

      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const inputHost = (request.query as any).host;
          if (typeof inputHost !== 'string') {
            throw new BadRequestError('Missing or invalid query parameter "host"');
          }
          const inputPort = (request.query as any).port;
          if (inputPort != null && (typeof inputPort !== 'string' || /^\d+$/.exec(inputPort) == null)) {
            throw new BadRequestError('Missing or invalid query parameter "port"');
          }

          const port = inputPort != null ? parseInt(inputPort, 10) : 25565;
          validateHost(inputHost);

          const serverStatus = await this.minecraftServerStatusService.provideServerStatus(inputHost, port);

          reply
            .header('Cache-Control', `public, max-age=${Math.max(0, 30 - serverStatus.ageInSeconds)}, s-maxage=${Math.max(0, 30 - serverStatus.ageInSeconds)}`)
            .header('Age', serverStatus.ageInSeconds);

          if (serverStatus.serverStatus != null) {
            return reply
              .send(serverStatus.serverStatus);
          }

          // FIXME: Unify success and "error" response content/layout
          return reply
            .status(200)
            .send({ online: false });
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

  private async processSkinRequest(request: FastifyRequest, skin: SkinImageManipulator, renderSlim: boolean): Promise<{ pngBody: Buffer, skinArea: 'head' | 'body' | null, forceDownload: boolean }> {
    function parseSkinArea(input: unknown): 'head' | 'body' | null {
      if (input == null) {
        return null;
      }

      if (input !== 'head' && input !== 'body') {
        throw new BadRequestError(`Only supports "head" or "body" as skin area but got ${JSON.stringify(input)}`);
      }
      return input;
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

    const userInputOverlay = (request.query as any).overlay;
    const userInputSlim = (request.query as any).slim;
    const userInputSize = (request.query as any).size;

    const requestedSkinArea = parseSkinArea((request.params as any).skinArea);
    if (userInputOverlay != null && requestedSkinArea == null) {
      throw new BadRequestError('Cannot use "overlay" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSize != null && requestedSkinArea == null) {
      throw new BadRequestError('Cannot use "size" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea == null) {
      throw new BadRequestError('Cannot use "slim" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea === 'head') {
      throw new BadRequestError('Cannot use "slim" when requesting the rendered head');
    }

    const renderOverlay = this.parseBoolean(userInputOverlay) ?? true;
    const renderSize = parseInteger(userInputSize) ?? 512;
    const forceDownload = this.parseBoolean((request.query as any).download) ?? false;

    if (renderSize != null && (renderSize < 8 || renderSize > 1024)) {
      throw new BadRequestError('Size must be between 8 and 1024');
    }

    let responseSkin: ImageManipulator = skin;

    if (requestedSkinArea === 'head') {
      responseSkin = await this.skinImage2DRenderer.extractHead(skin, renderOverlay);
    } else if (requestedSkinArea === 'body') {
      responseSkin = await this.skinImage2DRenderer.extractBody(skin, renderOverlay, renderSlim);
    }

    const responseResizeOptions = responseSkin === skin ? undefined : { width: renderSize, height: renderSize };
    const responseBody = await responseSkin.toPngBuffer(responseResizeOptions);

    return {
      pngBody: responseBody,
      skinArea: requestedSkinArea,
      forceDownload
    };
  }

  private parseBoolean(input: unknown): boolean | null {
    if (input == null) {
      return null;
    }

    if (input !== '1' && input !== '0' && input !== 'true' && input !== 'false') {
      throw new BadRequestError(`Expected a "1", "0", "true" or "false" but got ${JSON.stringify(input)}`);
    }
    return input === '1' || input === 'true';
  }
}
