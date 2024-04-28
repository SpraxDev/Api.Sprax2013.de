import * as Sentry from '@sentry/node';
import {nodeProfilingIntegration} from '@sentry/profiling-node';
import Os from 'os';
import {appVersion, cfg, runningInProduction} from './index';

export function logAndCaptureError(error: unknown): void {
  Sentry.captureException(error);

  if (error instanceof Error && runningInProduction) {
    console.error('An unexpected error occurred:', error.message);
    return;
  }
  console.error(error);
}

export function captureError(error: unknown): void {
  Sentry.captureException(error);
}

export function logAndCaptureWarning(message: string, data?: Record<string, unknown>): void {
  Sentry.captureMessage(message, {
    level: 'warning',
    extra: data
  });
  console.warn(message);
}

export async function initSentrySdk(): Promise<void> {
  if (cfg.sentryDsn === '') {
    console.warn('Sentry DSN is not set, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: cfg.sentryDsn,
    environment: runningInProduction ? 'production' : 'development',
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
      new Sentry.Integrations.Http({tracing: true}),
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

export async function shutdownSentrySdk(): Promise<void> {
  await Sentry.close(15_000);
}
