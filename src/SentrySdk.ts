import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
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
}
