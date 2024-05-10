import type { Transaction } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Os from 'node:os';
import { container } from 'tsyringe';
import AppConfiguration from './config/AppConfiguration.js';
import { getAppInfo, IS_PRODUCTION } from './constants.js';

export default class SentrySdk {
  static logAndCaptureError(error: unknown): void {
    Sentry.captureException(error);

    if (error instanceof Error && IS_PRODUCTION) {
      console.error('An unexpected error occurred:', error.message);
      return;
    }
    console.error(error);
  }

  static captureError(error: unknown): void {
    Sentry.captureException(error);
  }

  static logAndCaptureWarning(message: string, data?: Record<string, unknown>): void {
    Sentry.captureMessage(message, {
      level: 'warning',
      extra: data
    });
    console.warn(message);
  }

  static async init(): Promise<void> {
    const dsn = container.resolve(AppConfiguration).config.sentryDsn;
    if (dsn == '') {
      console.warn('Sentry DSN is not set up, skipping Sentry initialization');
      return;
    }

    const appVersion = getAppInfo().version;
    Sentry.init({
      dsn,
      environment: IS_PRODUCTION ? 'production' : 'development',
      release: appVersion,

      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,

      maxBreadcrumbs: 50,
      initialScope: {
        contexts: {
          Machine: {
            hostname: Os.hostname(),
            os_type: Os.type(),
            os_release: Os.release(),

            cpus: Os.cpus().length,
            memory_total: (Os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GiB',
            memory_free: null
          }
        }
      },

      defaultIntegrations: false,
      integrations: [
        new Sentry.Integrations.OnUncaughtException(),
        new Sentry.Integrations.OnUnhandledRejection(),
        new Sentry.Integrations.FunctionToString(),
        new Sentry.Integrations.ContextLines(),
        new Sentry.Integrations.InboundFilters(),
        new Sentry.Integrations.LinkedErrors(),
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Console(),

        nodeProfilingIntegration()
      ],

      beforeSend(event) {
        if (event.contexts && typeof event.contexts['Machine'] == 'object') {
          event.contexts['Machine'].memory_free = (Os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
        }

        return event;
      }
    });
  }

  static async shutdown(): Promise<void> {
    await Sentry.close(15_000);
  }

  /** This is a workaround until Sentry supports Fastify: https://github.com/getsentry/sentry-javascript/issues/4784 */
  static setupSentryFastifyIntegration(fastify: FastifyInstance): void {
    fastify.decorateRequest('sentryTransaction', null);

    fastify.addHook('onRequest', (request: FastifyRequest, reply, done) => {
      const path = new URL(request.url, 'http://localhost').pathname;

      Sentry.runWithAsyncContext(() => {
        // We can't use startSpanManual here for some reason... so we use deprecated startTransaction instead
        // It looks like we somehow loose the context? Or the created span is not attached to the current scope? :shrug:
        const transaction = Sentry.startTransaction(
          {
            op: 'http.server',
            name: `${request.method} ${path}`,
            attributes: {
              'http.method': request.method,
              'http.path': path,
              'sentry.source': 'url'
            }
          },
          { request: { method: request.method, path, headers: request.headers } }
        );

        Sentry.getCurrentScope().setSpan(transaction);
        (request as any).sentryTransaction = transaction;

        done();
      });
    });

    fastify.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done): void => {
      const transaction: Transaction | undefined = (request as any).sentryTransaction;
      if (transaction != null) {
        // Push `#end` call to the next event loop so open spans have a chance to finish before the transaction closes
        setImmediate(() => {
          Sentry.setHttpStatus(transaction, reply.statusCode);
          transaction.end();
        });
      }

      done();
    });
  }
}
