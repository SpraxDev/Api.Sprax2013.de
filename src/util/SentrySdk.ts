import * as Sentry from '@sentry/node';
import { IS_PRODUCTION } from '../constants.js';

export default class SentrySdk {
  static logAndCaptureError(error: unknown): void {
    Sentry.captureException(error);
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

  static async shutdown(): Promise<void> {
    await Sentry.close(15_000);
  }
}
