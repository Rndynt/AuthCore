export type StatusBucket = "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "other";

export interface CounterSummary {
  totalResponses: number;
  byMethod: Record<string, number>;
  byStatus: Record<StatusBucket, number>;
}

export interface HistogramBucket {
  /** Upper bound for the bucket in milliseconds. The final bucket uses "+Inf". */
  upperBound: number | "+Inf";
  count: number;
}

export interface HistogramSummary {
  count: number;
  sum: number;
  buckets: HistogramBucket[];
}

export interface RequestMetricsSnapshot {
  counters: CounterSummary;
  durations: HistogramSummary;
  lastUpdatedAt: string | null;
}

const statusBuckets: StatusBucket[] = ["1xx", "2xx", "3xx", "4xx", "5xx", "other"];
const durationBucketBounds = [50, 100, 250, 500, 1000, 2500, 5000];

const methodCounts = new Map<string, number>();
const statusCounts: Record<StatusBucket, number> = {
  "1xx": 0,
  "2xx": 0,
  "3xx": 0,
  "4xx": 0,
  "5xx": 0,
  other: 0
};
const histogramBuckets: HistogramBucket[] = durationBucketBounds.map(bound => ({
  upperBound: bound,
  count: 0
}));
histogramBuckets.push({ upperBound: "+Inf", count: 0 });

let totalResponses = 0;
let totalDuration = 0;
let lastUpdatedAt: string | null = null;

function getStatusBucket(statusCode: number): StatusBucket {
  if (!Number.isFinite(statusCode)) {
    return "other";
  }

  const bucket = Math.floor(statusCode / 100);
  switch (bucket) {
    case 1:
      return "1xx";
    case 2:
      return "2xx";
    case 3:
      return "3xx";
    case 4:
      return "4xx";
    case 5:
      return "5xx";
    default:
      return "other";
  }
}

function recordDuration(durationMs: number): void {
  totalDuration += durationMs;
  for (const bucket of histogramBuckets) {
    if (bucket.upperBound === "+Inf" || durationMs <= bucket.upperBound) {
      bucket.count += 1;
      break;
    }
  }
}

function recordMethod(method: string): void {
  const normalized = method.toUpperCase();
  methodCounts.set(normalized, (methodCounts.get(normalized) ?? 0) + 1);
}

export interface RecordRequestOptions {
  method: string;
  statusCode: number;
  durationMs: number;
}

export function recordCompletedRequest(options: RecordRequestOptions): void {
  totalResponses += 1;
  const bucket = getStatusBucket(options.statusCode);
  statusCounts[bucket] += 1;
  recordMethod(options.method);
  recordDuration(options.durationMs);
  lastUpdatedAt = new Date().toISOString();
}

export function getRequestMetricsSnapshot(): RequestMetricsSnapshot {
  const methodSummary: Record<string, number> = {};
  for (const [method, count] of methodCounts.entries()) {
    methodSummary[method] = count;
  }

  return {
    counters: {
      totalResponses,
      byMethod: methodSummary,
      byStatus: statusBuckets.reduce((acc, key) => {
        acc[key] = statusCounts[key];
        return acc;
      }, {} as Record<StatusBucket, number>)
    },
    durations: {
      count: totalResponses,
      sum: totalDuration,
      buckets: histogramBuckets.map(bucket => ({ ...bucket }))
    },
    lastUpdatedAt
  };
}

export function resetRequestMetrics(): void {
  totalResponses = 0;
  totalDuration = 0;
  lastUpdatedAt = null;
  methodCounts.clear();
  for (const key of statusBuckets) {
    statusCounts[key] = 0;
  }
  for (const bucket of histogramBuckets) {
    bucket.count = 0;
  }
}
