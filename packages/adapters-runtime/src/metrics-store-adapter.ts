import { metricsStore } from '../../../src/utils/metrics-store.js';
import type { MetricsStore } from '../../core/src/ports/metrics-store';

export class MetricsStoreAdapter implements MetricsStore {
  async getMetrics(): Promise<unknown> {
    return metricsStore.getMetrics();
  }

  async getTimeSeriesData(): Promise<unknown> {
    return metricsStore.getTimeSeriesData();
  }
}

export const metricsStoreAdapter = new MetricsStoreAdapter();
export { MetricsStoreAdapter as MetricsStoreAdapterClass };
