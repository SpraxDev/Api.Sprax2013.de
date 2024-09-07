import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import Os from 'node:os';
import { getAppInfo, IS_PRODUCTION } from './constants.js';

(() => {
  const dsn = process.env.SENTRY_DSN ?? '';
  delete process.env.SENTRY_DSN;

  if (dsn === '') {
    console.warn('Sentry DSN is not configured – skipping Sentry initialization');
    return;
  }

  const appInfo = getAppInfo();
  Sentry.init({
    dsn,
    environment: IS_PRODUCTION ? 'production' : 'development',
    release: `${appInfo.name}@${appInfo.version}`,

    tracesSampleRate: 0.0,
    profilesSampleRate: 0.0,

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
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.inboundFiltersIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.httpIntegration(),
      Sentry.consoleIntegration(),
      Sentry.prismaIntegration(),
      Sentry.fastifyIntegration(),

      nodeProfilingIntegration()
    ],

    beforeSend(event) {
      if (event.contexts && typeof event.contexts['Machine'] == 'object') {
        event.contexts['Machine'].memory_free = (Os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GiB';
      }

      return event;
    }
  });
})();
