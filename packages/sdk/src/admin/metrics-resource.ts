import type { RealmioAdminClient } from '../realmio-admin-client';

export class MetricsResource {
  constructor(private readonly client: RealmioAdminClient) {}

  async getSystem(): Promise<unknown> {
    const data = await this.client.get<{ metrics: unknown }>('/admin/api/metrics');
    return data.metrics;
  }

  async getOverview(): Promise<unknown> {
    const data = await this.client.get<{ overview: unknown }>('/admin/api/overview');
    return data.overview;
  }

  async getDashboard(): Promise<unknown> {
    const data = await this.client.get<{ metrics: unknown }>('/admin/api/dashboard-metrics');
    return data.metrics;
  }

  async getTimeSeries(): Promise<unknown> {
    const data = await this.client.get<{ data: unknown }>('/admin/api/time-series');
    return data.data;
  }
}
