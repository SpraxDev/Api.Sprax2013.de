import { FastifyInstance } from 'fastify';
import { autoInjectable } from 'tsyringe';
import { BadRequestError } from '../../../http/errors/HttpErrors.js';
import { CAPE_TYPE_STRINGS, CapeType } from '../../../minecraft/cape/CapeType.js';
import UserCapeProvider from '../../../minecraft/cape/UserCapeProvider.js';
import type { UsernameToUuidResponse } from '../../../minecraft/MinecraftApiClient.js';
import MinecraftProfileService, { type Profile } from '../../../minecraft/MinecraftProfileService.js';
import ServerBlocklistService, {
  InvalidHostError
} from '../../../minecraft/server/blocklist/ServerBlocklistService.js';
import MinecraftProfile from '../../../minecraft/value-objects/MinecraftProfile.js';
import FastifyWebServer from '../../FastifyWebServer.js';
import Router from '../Router.js';

@autoInjectable()
export default class MinecraftV1Router implements Router {
  constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly userCapeProvider: UserCapeProvider,
    private readonly serverBlocklistService: ServerBlocklistService
  ) {
  }

  register(server: FastifyInstance): void {
    server.all('/mc/v1/uuid/:username?', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const inputUsername = (request.params as any).username;
          if (typeof inputUsername !== 'string' || inputUsername.length <= 0) {
            return reply
              .status(400)
              .send({
                error: 'Bad Request',
                message: 'Missing or invalid url parameters',
                details: [{ param: 'name', condition: 'name.length > 0' }]
              });
          }
          if (inputUsername.length > 16 || inputUsername.length < 3) {
            return reply
              .status(400)
              .send({
                error: 'Bad Request',
                message: 'Invalid username',
                details: [{ param: 'name', condition: 'name.length >= 3 && name.length <= 16' }]
              });
          }

          const profile = await this.minecraftProfileService.provideProfileByUsername(inputUsername);
          if (profile == null) {
            await reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            return reply
              .status(404)
              .send({
                error: 'Not Found',
                message: 'UUID for given username'
              });
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

    server.all('/mc/v1/profile/:user?', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          let profile: Profile | null;
          try {
            profile = await this.resolveUserToProfile((request.params as any).user);
          } catch (err: any) {
            if (err instanceof BadRequestError) {
              return reply
                .status(400)
                .send({
                  error: 'Bad Request',
                  message: 'Missing or invalid url parameters',
                  details: [{ param: 'user', condition: 'user.length > 0' }]
                });
            }
            throw err;
          }

          if (profile == null) {
            await reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            return reply
              .status(404)
              .send({
                error: 'Not Found',
                message: 'Profile for given user'
              });
          }
          return reply
            .header('Age', Math.floor(profile.ageInSeconds).toString())
            .header('Cache-Control', 'public, max-age=60, s-maxage=60')
            .send(profile.profile);
        }
      });
    });

    server.all('/mc/v1/history/:user?', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          return reply
            .status(410)
            .send({
              error: 'Gone',
              message: 'This endpoint has been removed as Mojang removed the username history API (https://web.archive.org/web/20221006001721/https://help.minecraft.net/hc/en-us/articles/8969841895693-Username-History-API-Removal-FAQ-)'
            });
        }
      });
    });

    server.all('/mc/v1/capes/:capeType/:user?', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const inputCapeType = (request.params as any).capeType;
          if (typeof inputCapeType !== 'string' || !CAPE_TYPE_STRINGS.includes(inputCapeType.toLowerCase())) {
            return reply
              .status(400)
              .send({
                error: 'Bad Request',
                message: 'Missing or invalid url parameters',
                details: [{ param: 'capeType', condition: `capeType in [${CAPE_TYPE_STRINGS.join(', ')}]` }]
              });
          }
          const capeType = inputCapeType.toLowerCase() as CapeType;

          let profile: Profile | null;
          try {
            profile = await this.resolveUserToProfile((request.params as any).user);
          } catch (err: any) {
            if (err instanceof BadRequestError) {
              return reply
                .status(400)
                .send({
                  error: 'Bad Request',
                  message: 'Missing or invalid url parameters',
                  details: [{ param: 'user', condition: 'user.length > 0' }]
                });
            }
            throw err;
          }

          if (profile == null) {
            await reply.header('Cache-Control', 'public, max-age=60, s-maxage=60');
            return reply
              .status(404)
              .send({
                error: 'Not Found',
                message: 'Profile for given user'
              });
          }

          const minecraftProfile = new MinecraftProfile(profile.profile);
          const capeResponse = await this.userCapeProvider.provide(minecraftProfile, capeType);
          if (capeResponse == null) {
            return reply
              .status(404)
              .send({
                error: 'Not Found',
                message: 'User does not have a cape for that type'
              });
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

    server.all('/mc/v1/servers/blocked', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const blocklist = await this.serverBlocklistService.provideBlocklist();
          return reply
            .header('Cache-Control', 'public, max-age=120, s-maxage=120')
            .send(blocklist);
        }
      });
    });

    server.all('/mc/v1/servers/blocked/known', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
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

    server.all('/mc/v1/servers/blocked/check', (request, reply): Promise<void> => {
      return FastifyWebServer.handleRestfully(request, reply, {
        get: async (): Promise<void> => {
          const inputHost = (request.query as any).host;
          if (typeof inputHost !== 'string' || inputHost.length <= 0) {
            return reply
              .status(400)
              .send({
                error: 'Bad Request',
                message: 'Missing or invalid query parameters',
                details: [{ param: 'host', 'condition': 'host.length > 0' }]
              });
          }

          let blocklist;
          try {
            blocklist = await this.serverBlocklistService.checkBlocklist(inputHost);
          } catch (err: any) {
            if (err instanceof InvalidHostError) {
              return reply
                .status(400)
                .send({
                  error: 'Bad Request',
                  message: 'Missing or invalid query parameters',
                  details: [{ param: 'host', 'condition': 'A valid IPv4, IPv6 or domain' }]
                });
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
