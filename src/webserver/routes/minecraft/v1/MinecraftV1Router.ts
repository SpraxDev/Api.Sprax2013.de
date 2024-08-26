import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import assert from 'node:assert';
import https from 'node:http';
import Sharp from 'sharp';
import { autoInjectable } from 'tsyringe';
import HttpClient from '../../../../http/HttpClient.js';
import { CAPE_TYPE_STRINGS, CapeType } from '../../../../minecraft/cape/CapeType.js';
import Cape2dRenderer from '../../../../minecraft/cape/renderer/Cape2dRenderer.js';
import UserCapeProvider from '../../../../minecraft/cape/UserCapeProvider.js';
import ImageManipulator from '../../../../minecraft/image/ImageManipulator.js';
import type { UsernameToUuidResponse } from '../../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileService, { type Profile } from '../../../../minecraft/MinecraftProfileService.js';
import ServerBlocklistService, {
  InvalidHostError
} from '../../../../minecraft/server/blocklist/ServerBlocklistService.js';
import MinecraftSkinNormalizer from '../../../../minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../../../../minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinService from '../../../../minecraft/skin/MinecraftSkinService.js';
import MinecraftSkinTypeDetector from '../../../../minecraft/skin/MinecraftSkinTypeDetector.js';
import LegacyMinecraft3DRenderer from '../../../../minecraft/skin/renderer/LegacyMinecraft3DRenderer.js';
import SkinImage2DRenderer from '../../../../minecraft/skin/renderer/SkinImage2DRenderer.js';
import MinecraftProfile from '../../../../minecraft/value-objects/MinecraftProfile.js';
import FastifyWebServer from '../../../FastifyWebServer.js';
import Router from '../../Router.js';
import { ApiV1BadRequestError, ApiV1NotFoundError } from './errors/ApiV1HttpError.js';

// FIXME: Cache-Control header should take 'Age' header into account
@autoInjectable()
export default class MinecraftV1Router implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftSkinService: MinecraftSkinService,
    private readonly skinImage2DRenderer: SkinImage2DRenderer,
    private readonly userCapeProvider: UserCapeProvider,
    private readonly cape2dRenderer: Cape2dRenderer,
    private readonly serverBlocklistService: ServerBlocklistService,
    private readonly httpClient: HttpClient,
    private readonly minecraftSkinNormalizer: MinecraftSkinNormalizer,
    private readonly minecraftSkinTypeDetector: MinecraftSkinTypeDetector,
    private readonly legacyMinecraft3DRenderer: LegacyMinecraft3DRenderer
  ) {
  }

  register(server: FastifyInstance): void {
    server.all('/mc/v1/uuid/:username?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const inputUsername = (request.params as any).username;
          if (typeof inputUsername !== 'string' || inputUsername.length <= 0) {
            throw ApiV1BadRequestError.missingOrInvalidUrlParameter('name', 'name.length > 0');
          }
          if (inputUsername.length > 16 || inputUsername.length < 3) {
            reply.header('Cache-Control', 'public, max-age=300, s-maxage=300');
            throw ApiV1NotFoundError.uuidForGivenUsernameNotFound();
          }

          const profile = await this.minecraftProfileService.provideProfileByUsername(inputUsername);
          if (profile == null) {
            reply.header('Cache-Control', 'public, max-age=120, s-maxage=120');
            throw ApiV1NotFoundError.uuidForGivenUsernameNotFound();
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

    server.all('/mc/v1/profile/:user?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw ApiV1NotFoundError.profileForGivenUserNotFound();
          }

          let sendProcessedProfile = false;

          const inputRaw = this.parseBoolean((request.query as any).raw);
          const inputFull = this.parseBoolean((request.query as any).full);
          if (inputRaw != null) {
            sendProcessedProfile = !inputRaw;
          } else if (inputFull != null) {
            sendProcessedProfile = inputFull;
          }

          reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60');

          if (!sendProcessedProfile) {
            return reply
              .send({
                legacy: false,
                ...profile.profile
              });
          }

          const minecraftProfile = new MinecraftProfile(profile.profile);
          return reply
            .send({
              id: profile.profile.id,
              id_hyphens: profile.profile.id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'),
              name: profile.profile.name,
              legacy: false,

              textures: {
                skinUrl: minecraftProfile.parseTextures()?.skinUrl ?? null,
                capeUrl: minecraftProfile.parseTextures()?.capeUrl ?? null,
                texture_value: minecraftProfile.getTexturesProperty()?.value,
                texture_signature: minecraftProfile.getTexturesProperty()?.signature
              },

              profile_actions: [],
              name_history: []
            });
        }
      });
    });

    server.all('/mc/v1/history/:user?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          return reply
            .status(410)
            .header('Cache-Control', 'public, max-age=300, s-maxage=300')
            .send({
              error: 'Gone',
              message: 'This endpoint has been removed as Mojang removed the username history API ' +
                '(https://web.archive.org/web/20221006001721/https://help.minecraft.net/hc/en-us/articles/8969841895693-Username-History-API-Removal-FAQ-)'
            });
        }
      });
    });

    server.all('/mc/v1/skin/x-url/:skinArea?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const skinUrl = (request.query as any).url;
          if (typeof skinUrl !== 'string' || skinUrl.length <= 0) {
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url.length > 0');
          }

          let parsedSkinUrl: URL;
          try {
            parsedSkinUrl = new URL(skinUrl);
          } catch (err: any) {
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be a valid URL (e.g. start with https://)');
          }

          if (parsedSkinUrl.protocol !== 'https:') {
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be an https URL');
          }
          // TODO: disallow local, private, etc. IP addresses (also check dns resolution!)
          // TODO: Have trusted domains that don't need to hide the host's IP address

          // TODO: Cache the response (try to respect the Cache-Control header but enforce a minimum cache time and set a maximum cache time of one month)
          // TODO: Properly handle errors when requesting the skin (check content-type?)
          const fetchedSkinImage = await this.httpClient.get(skinUrl);
          if (fetchedSkinImage.statusCode !== 200) {
            throw new ApiV1BadRequestError(`Provided URL returned ${fetchedSkinImage.statusCode} (${https.STATUS_CODES[fetchedSkinImage.statusCode]})`);
          }

          const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
          const skin = await SkinImageManipulator.createByImage(fetchedSkinImage.body);
          const renderSlim = this.parseBoolean((request.query as any).slim) ?? this.minecraftSkinTypeDetector.detect(skin) === 'alex';

          const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin);

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

    server.all('/mc/v1/skin/x-url/:skinArea/3d', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const skinUrl = (request.query as any).url;
          if (typeof skinUrl !== 'string' || skinUrl.length <= 0) {
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url.length > 0');
          }

          let parsedSkinUrl: URL;
          try {
            parsedSkinUrl = new URL(skinUrl);
          } catch (err: any) {
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be a valid URL (e.g. start with https://)');
          }

          if (parsedSkinUrl.protocol !== 'https:') {
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('url', 'url needs to be an https URL');
          }
          // TODO: disallow local, private, etc. IP addresses (also check dns resolution!)
          // TODO: Have trusted domains that don't need to hide the host's IP address

          // TODO: Cache the response (try to respect the Cache-Control header but enforce a minimum cache time and set a maximum cache time of one month)
          // TODO: Properly handle errors when requesting the skin (check content-type?)
          const fetchedSkinImage = await this.httpClient.get(skinUrl);
          if (fetchedSkinImage.statusCode !== 200) {
            throw new ApiV1BadRequestError(`Provided URL returned ${fetchedSkinImage.statusCode} (${https.STATUS_CODES[fetchedSkinImage.statusCode]})`);
          }

          const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
          const skin = await this.minecraftSkinNormalizer.normalizeSkin(await SkinImageManipulator.createByImage(fetchedSkinImage.body));
          const renderSlim = this.parseBoolean((request.query as any).slim) ?? this.minecraftSkinTypeDetector.detect(skin) === 'alex';

          const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin, true);

          reply.header('Content-Type', 'image/png');
          if (skinResponse.forceDownload) {
            assert(skinResponse.skinArea != null);
            reply.header('Content-Disposition', `attachment; filename="x-url-${skinResponse.skinArea}.png"`);
            reply.header('Content-Type', 'application/octet-stream');
          }

          return reply
            // .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(skinResponse.pngBody);
        }
      });
    });

    server.all('/mc/v1/skin/:user/:skinArea?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const profile = await this.resolveUserToProfile((request.params as any).user);

          if (profile == null) {
            reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw ApiV1NotFoundError.profileForGivenUserNotFound();
          }
          const minecraftProfile = new MinecraftProfile(profile.profile);

          const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
          const renderSlim = this.parseBoolean((request.query as any).slim) ?? minecraftProfile.parseTextures()?.slimPlayerModel ?? minecraftProfile.determineDefaultSkin() === 'alex';
          const skin = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));

          const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin);

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

    server.all('/mc/v1/skin/:user/:skinArea/3d', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw ApiV1NotFoundError.profileForGivenUserNotFound();
          }
          const minecraftProfile = new MinecraftProfile(profile.profile);

          const requestedRawSkin = this.parseBoolean((request.query as any).raw) ?? false;
          const renderSlim = this.parseBoolean((request.query as any).slim) ?? minecraftProfile.parseTextures()?.slimPlayerModel ?? minecraftProfile.determineDefaultSkin() === 'alex';
          const skin = await this.minecraftSkinService.fetchEffectiveSkin(new MinecraftProfile(profile.profile));

          const skinResponse = await this.processSkinRequest(request, skin, renderSlim, requestedRawSkin, true);

          reply.header('Content-Type', 'image/png');
          if (skinResponse.forceDownload) {
            assert(skinResponse.skinArea != null);
            reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}-${skinResponse.skinArea}.png"`);
            reply.header('Content-Type', 'application/octet-stream');
          }

          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(skinResponse.pngBody);
        }
      });
    });

    server.all('/mc/v1/capes/all/:user?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          return reply
            .status(410)
            .header('Cache-Control', 'public, max-age=300, s-maxage=300')
            .send({
              error: 'Gone',
              message: 'This endpoint was never intended for the general public and only returned the internal IDs ' +
                'used by this API to identify the skins (or null) – Please use one of the other cape endpoints instead'
            });
        }
      });
    });

    server.all('/mc/v1/capes/:capeType/:user?', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const inputCapeType = (request.params as any).capeType;
          if (typeof inputCapeType !== 'string' || !CAPE_TYPE_STRINGS.includes(inputCapeType.toLowerCase())) {
            throw ApiV1BadRequestError.missingOrInvalidUrlParameter('capeType', `capeType in [${CAPE_TYPE_STRINGS.join(', ')}]`);
          }
          const capeType = inputCapeType.toLowerCase() as CapeType;

          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw ApiV1NotFoundError.profileForGivenUserNotFound();
          }

          const minecraftProfile = new MinecraftProfile(profile.profile);
          const capeResponse = await this.userCapeProvider.provide(minecraftProfile, capeType);
          if (capeResponse == null) {
            reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw new ApiV1NotFoundError('User does not have a cape for that type');
          }

          const forceDownload = this.parseBoolean((request.query as any).download) ?? false;

          reply.header('Content-Type', capeResponse.mimeType);
          if (forceDownload) {
            reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}-${capeType}.png"`);
            reply.header('Content-Type', 'application/octet-stream');
          }

          return reply
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(capeResponse.image);
        }
      });
    });

    server.all('/mc/v1/capes/:capeType/:user/render', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const inputCapeType = (request.params as any).capeType;
          if (typeof inputCapeType !== 'string' || !CAPE_TYPE_STRINGS.includes(inputCapeType.toLowerCase())) {
            throw ApiV1BadRequestError.missingOrInvalidUrlParameter('capeType', `capeType in [${CAPE_TYPE_STRINGS.join(', ')}]`);
          }

          const size = this.parseSize((request.query as any).size) ?? 512;
          const capeType = inputCapeType.toLowerCase() as CapeType;

          if (capeType == CapeType.LABYMOD) {
            return reply
              .status(503)
              .send({
                error: 'Service Unavailable',
                message: 'Rendering LabyMod-Capes is currently not supported'
              });
          }

          const profile = await this.resolveUserToProfile((request.params as any).user);
          if (profile == null) {
            reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw ApiV1NotFoundError.profileForGivenUserNotFound();
          }

          const minecraftProfile = new MinecraftProfile(profile.profile);
          const capeResponse = await this.userCapeProvider.provide(minecraftProfile, capeType);
          if (capeResponse == null) {
            reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            throw new ApiV1NotFoundError('User does not have a cape for that type');
          }

          const capeRenderResult = await this.cape2dRenderer.renderCape(capeResponse.image, capeType);
          const renderCapeImage = await capeRenderResult.toPngBuffer({ width: size, height: size });

          const forceDownload = this.parseBoolean((request.query as any).download) ?? false;

          reply.header('Content-Type', 'image/png');
          if (forceDownload) {
            reply.header('Content-Disposition', `attachment; filename="${profile.profile.name}-${capeType}.png"`);
            reply.header('Content-Type', 'application/octet-stream');
          }

          return reply
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(renderCapeImage);
        }
      });
    });

    server.all('/mc/v1/servers/blocked', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const blocklist = await this.serverBlocklistService.provideBlocklist();
          return reply
            .header('Cache-Control', 'public, max-age=120, s-maxage=120')
            .send(blocklist);
        }
      });
    });

    server.all('/mc/v1/servers/blocked/known', (request, reply): Promise<FastifyReply> => {
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

    server.all('/mc/v1/servers/blocked/check', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const inputHost = (request.query as any).host;
          if (typeof inputHost !== 'string' || inputHost.length <= 0) {
            throw ApiV1BadRequestError.missingOrInvalidQueryParameter('host', 'host.length > 0');
          }

          let blocklist;
          try {
            blocklist = await this.serverBlocklistService.checkBlocklist(inputHost);
          } catch (err: any) {
            if (err instanceof InvalidHostError) {
              throw ApiV1BadRequestError.missingOrInvalidQueryParameter('host', 'A valid IPv4, IPv6 or domain');
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

    server.all('/mc/v1/render/block', (request, reply): Promise<FastifyReply> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<FastifyReply> => {
          const size = this.parseSize((request.query as any).size) ?? 150;
          if (request.headers['content-type'] !== 'image/png') {
            throw ApiV1BadRequestError.missingOrInvalidBody('Content-Type', 'image/png');
          }

          let body = Buffer.alloc(0);
          for await (const chunk of request.raw) {
            body = Buffer.concat([body, chunk]);

            if (body.length > 3 * 1024 * 1024) {
              throw ApiV1BadRequestError.missingOrInvalidBody('body', 'body under 3 MiB');
            }
          }

          let blockTexture: ImageManipulator;
          try {
            const textureImage = await Sharp(body)
              .ensureAlpha()
              .resize(64, 64, { kernel: 'nearest', fit: 'outside' })
              .raw()
              .toBuffer({ resolveWithObject: true });
            blockTexture = new ImageManipulator(textureImage.data, textureImage.info);
          } catch (err: any) {
            throw ApiV1BadRequestError.missingOrInvalidBody('body', 'Valid PNG');
          }

          const renderedBlock = await this.legacyMinecraft3DRenderer.renderBlock(blockTexture);
          return reply
            .header('Content-Type', 'image/png')
            .send(await renderedBlock.toPngBuffer({ width: size, height: size }));
        }
      });
    });
  }

  private async resolveUserToProfile(inputUser: unknown): Promise<Profile | null> {
    if (typeof inputUser !== 'string' || inputUser.length <= 0) {
      throw ApiV1BadRequestError.missingOrInvalidUrlParameter('user', 'user.length > 0');
    }

    const inputUserLooksLikeUsername = inputUser.length <= 16;
    const inputUserLooksLikeUuid = inputUser.replaceAll('-', '').length === 32;
    if (!inputUserLooksLikeUsername && !inputUserLooksLikeUuid) {
      throw ApiV1BadRequestError.missingOrInvalidUrlParameter('user', 'Is valid uuid string or user.length <= 16');
    }

    if (inputUserLooksLikeUsername) {
      return await this.minecraftProfileService.provideProfileByUsername(inputUser);
    }
    return await this.minecraftProfileService.provideProfileByUuid(inputUser);
  }

  private async processSkinRequest(
    request: FastifyRequest,
    skin: SkinImageManipulator,
    renderSlim: boolean,
    requestedRawSkin: boolean,
    is3d: boolean = false
  ): Promise<{ pngBody: Buffer; skinArea: 'head' | 'body' | null; forceDownload: boolean }> {
    function parseSkinArea(input: unknown): 'head' | 'body' | null {
      if (input == null) {
        return null;
      }

      if (input !== 'head' && input !== 'body') {
        throw ApiV1BadRequestError.missingOrInvalidUrlParameter('skinArea', 'Equal (ignore case) one of the following: "HEAD", "BODY"');
      }
      return input;
    }

    const userInputOverlay = (request.query as any).overlay;
    const userInputSlim = (request.query as any).slim;
    const userInputSize = (request.query as any).size;

    const requestedSkinArea = parseSkinArea((request.params as any).skinArea);
    if (userInputOverlay != null && requestedSkinArea == null) {
      throw new ApiV1BadRequestError('Cannot use "overlay" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSize != null && requestedSkinArea == null) {
      throw new ApiV1BadRequestError('Cannot use "size" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea == null) {
      throw new ApiV1BadRequestError('Cannot use "slim" when just requesting the skin file (without "skinArea" or "3d")');
    }
    if (userInputSlim != null && requestedSkinArea === 'head') {
      throw new ApiV1BadRequestError('Cannot use "slim" when requesting the rendered head');
    }
    if (requestedRawSkin && requestedSkinArea != null) {
      throw new ApiV1BadRequestError('Cannot use "raw" when requesting a rendered skin (3d or skinArea)');
    }

    const renderOverlay = this.parseBoolean(userInputOverlay) ?? true;
    const renderSize = this.parseSize(userInputSize) ?? 512;
    const forceDownload = this.parseBoolean((request.query as any).download) ?? false;

    let responseSkin: ImageManipulator = skin;
    let responseSkinIsRendered = false;

    if (!requestedRawSkin) {
      responseSkin = await this.minecraftSkinNormalizer.normalizeSkin(skin);
    }
    if (is3d) {
      assert(requestedSkinArea != null);
      assert(responseSkin instanceof SkinImageManipulator);
      responseSkin = await this.renderSkin3d(responseSkin, requestedSkinArea, renderOverlay, renderSlim);
      responseSkinIsRendered = true;
    } else if (requestedSkinArea != null) {
      assert(responseSkin instanceof SkinImageManipulator);
      responseSkin = await this.renderSkin2d(responseSkin, requestedSkinArea, renderOverlay, renderSlim);
      responseSkinIsRendered = true;
    }

    const responseResizeOptions = responseSkinIsRendered ? { width: renderSize, height: renderSize } : undefined;
    const responseBody = await responseSkin.toPngBuffer(responseResizeOptions);

    return {
      pngBody: responseBody,
      skinArea: requestedSkinArea,
      forceDownload
    };
  }

  private async renderSkin2d(skin: SkinImageManipulator, area: 'head' | 'body', overlay: boolean, slimModel: boolean): Promise<ImageManipulator> {
    if (area === 'head') {
      return this.skinImage2DRenderer.extractHead(skin, overlay);
    }
    return this.skinImage2DRenderer.extractBody(skin, overlay, slimModel);
  }

  private async renderSkin3d(skin: SkinImageManipulator, area: 'head' | 'body', overlay: boolean, slimModel: boolean): Promise<ImageManipulator> {
    if (area === 'head') {
      return this.legacyMinecraft3DRenderer.renderSkin(skin, area, overlay, slimModel);
    }
    return this.legacyMinecraft3DRenderer.renderSkin(skin, area, overlay, slimModel);
  }

  private parseBoolean(input: unknown): boolean | null {
    if (input == null) {
      return null;
    }

    if (input !== '1' && input !== '0' && input !== 'true' && input !== 'false') {
      throw new ApiV1BadRequestError(`Expected a "1", "0", "true" or "false" but got ${JSON.stringify(input)}`);
    }
    return input === '1' || input === 'true';
  }

  private parseSize(input: unknown): number | null {
    if (input == null) {
      return null;
    }

    if (typeof input !== 'string' || !/^\d+$/.test(input)) {
      throw ApiV1BadRequestError.missingOrInvalidQueryParameter('size', 'size >= 8 and size <= 1024');
    }

    const result = parseInt(input, 10);
    if (result < 8 || result > 1024) {
      throw ApiV1BadRequestError.missingOrInvalidQueryParameter('size', 'size >= 8 and size <= 1024');
    }
    return result;
  }
}
