import * as QuestDb from '@questdb/nodejs-client';
import { Disposable, singleton } from 'tsyringe';
import AppConfiguration from '../config/AppConfiguration.js';

export type ProxyServerMetric = {
  displayName: string,
  online: boolean,
  rttMs?: number,
  timestamp: Date
}

@singleton()
export default class QuestDbClient implements Disposable {
  private readonly senderPromise?: Promise<QuestDb.Sender>;

  constructor(appConfig: AppConfiguration) {
    if (appConfig.config.questDbMetricsConfig.length > 0) {
      this.senderPromise = QuestDb.Sender.fromConfig(appConfig.config.questDbMetricsConfig);
    }
  }

  async pushImportQueueSize(itemsQueued: number, itemsErrored: number): Promise<void> {
    if (this.senderPromise == null) {
      return;
    }

    const sender = await this.senderPromise;

    sender
      .table('sprax_api_import_queue_stats')
      .intColumn('queued', itemsQueued)
      .intColumn('errored', itemsErrored);
    await sender.at(Date.now(), 'ms');

    await sender.flush();
  }

  async pushProxyServerMetric(metrics: ProxyServerMetric[]): Promise<void> {
    if (this.senderPromise == null) {
      return;
    }

    const sender = await this.senderPromise;

    for (const metric of metrics) {
      sender
        .table('sprax_api_proxy_servers')
        .stringColumn('displayName', metric.displayName)
        .booleanColumn('online', metric.online);
      if (metric.rttMs != null) {
        sender.intColumn('rttMs', metric.rttMs);
      }

      await sender.at(metric.timestamp.getTime(), 'ms');
    }

    await sender.flush();
  }

  async dispose(): Promise<void> {
    await (await this.senderPromise)?.flush();
    await (await this.senderPromise)?.close();
  }
}
