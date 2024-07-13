import { FastifyInstance } from 'fastify';
import { autoInjectable } from 'tsyringe';
import ServerBlocklistService, {
  InvalidHostError
} from '../../../minecraft/server/blocklist/ServerBlocklistService.js';
import FastifyWebServer from '../../FastifyWebServer.js';
import Router from '../Router.js';

@autoInjectable()
export default class MinecraftV1Router implements Router {
  constructor(
    private readonly serverBlocklistService: ServerBlocklistService
  ) {
  }

  register(server: FastifyInstance): void {
    server.all('/mc/v1/history/:usernameOrId', (request, reply): Promise<void> => {
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
}
