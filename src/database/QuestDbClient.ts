import QuestDb from '@questdb/nodejs-client';
import { singleton } from 'tsyringe';
import AppConfiguration from '../config/AppConfiguration.js';

export type ProxyServerMetric = {
  displayName: string,
  online: boolean,
  rttMs?: number,
  timestamp: Date
}

@singleton()
export default class QuestDbClient {
  private readonly sender?: QuestDb.Sender;

  constructor(appConfig: AppConfiguration) {
    if (appConfig.config.questDbMetricsConfig.length > 0) {
      this.sender = QuestDb.Sender.fromConfig(appConfig.config.questDbMetricsConfig);
    }
  }

  async pushImportQueueSize(itemsQueued: number, itemsErrored: number): Promise<void> {
    if (this.sender == null) {
      return;
    }

    this.sender
      .table('sprax_api_import_queue_stats')
      .intColumn('queued', itemsQueued)
      .intColumn('errored', itemsErrored);
    await this.sender.at(Date.now(), 'ms');

    await this.sender.flush();
  }

  async pushProxyServerMetric(metrics: ProxyServerMetric[]): Promise<void> {
    if (this.sender == null) {
      return;
    }

    for (const metric of metrics) {
      this.sender
        .table('sprax_api_proxy_servers')
        .stringColumn('displayName', metric.displayName)
        .booleanColumn('online', metric.online);
      if (metric.rttMs != null) {
        this.sender.intColumn('rttMs', metric.rttMs);
      }

      await this.sender.at(metric.timestamp.getTime(), 'ms');
    }

    await this.sender.flush();
  }

  async shutdown(): Promise<void> {
    await this.sender?.flush();
    await this.sender?.close();
  }
}
