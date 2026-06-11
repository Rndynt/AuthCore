export interface MetricsStore { getMetrics(): Promise<unknown>; getTimeSeriesData(): Promise<unknown>; }
