/**
 * Metrics Store
 * Collects and aggregates metrics for dashboard charts
 */

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface TimeSeriesMetric {
  name: string;
  points: MetricPoint[];
}

export interface DashboardMetrics {
  requests: {
    total: number;
    perMinute: number;
    successRate: number;
  };
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  errors: {
    total4xx: number;
    total5xx: number;
    errorRate: number;
  };
  connections: {
    active: number;
    max: number;
    utilization: number;
  };
  tenants: {
    active: number;
    requestsPerTenant: Record<string, number>;
  };
  timeSeries: {
    requestsPerMinute: MetricPoint[];
    responseTimeAvg: MetricPoint[];
    errorRate: MetricPoint[];
    activeConnections: MetricPoint[];
  };
}

// In-memory metrics storage (reset on server restart)
const MAX_POINTS = 60; // 60 data points (1 minute each = 1 hour of data)

class MetricsStore {
  private requestsPerMinute: MetricPoint[] = [];
  private responseTimeAvg: MetricPoint[] = [];
  private errorRate: MetricPoint[] = [];
  private activeConnections: MetricPoint[] = [];
  
  private currentMinute: { timestamp: number; count: number; errors: number; totalTime: number } | null = null;
  
  private totalRequests = 0;
  private total4xx = 0;
  private total5xx = 0;
  private totalResponseTime = 0;
  
  /**
   * Record a request
   */
  recordRequest(statusCode: number, durationMs: number, tenantId?: string) {
    const now = Date.now();
    const minuteKey = Math.floor(now / 60000) * 60000;
    
    // Initialize or rotate minute bucket
    if (!this.currentMinute || this.currentMinute.timestamp !== minuteKey) {
      if (this.currentMinute) {
        // Save previous minute
        this.requestsPerMinute.push({
          timestamp: this.currentMinute.timestamp,
          value: this.currentMinute.count
        });
        this.responseTimeAvg.push({
          timestamp: this.currentMinute.timestamp,
          value: this.currentMinute.count > 0 
            ? this.currentMinute.totalTime / this.currentMinute.count 
            : 0
        });
        this.errorRate.push({
          timestamp: this.currentMinute.timestamp,
          value: this.currentMinute.count > 0 
            ? (this.currentMinute.errors / this.currentMinute.count) * 100 
            : 0
        });
        
        // Trim arrays
        if (this.requestsPerMinute.length > MAX_POINTS) {
          this.requestsPerMinute.shift();
          this.responseTimeAvg.shift();
          this.errorRate.shift();
        }
      }
      
      this.currentMinute = {
        timestamp: minuteKey,
        count: 0,
        errors: 0,
        totalTime: 0
      };
    }
    
    // Update current minute
    this.currentMinute.count++;
    this.currentMinute.totalTime += durationMs;
    if (statusCode >= 400) {
      this.currentMinute.errors++;
    }
    
    // Update totals
    this.totalRequests++;
    this.totalResponseTime += durationMs;
    if (statusCode >= 400 && statusCode < 500) this.total4xx++;
    if (statusCode >= 500) this.total5xx++;
  }
  
  /**
   * Update connection metrics
   */
  updateConnections(active: number, max: number) {
    const now = Date.now();
    this.activeConnections.push({
      timestamp: now,
      value: active
    });
    
    if (this.activeConnections.length > MAX_POINTS) {
      this.activeConnections.shift();
    }
  }
  
  /**
   * Get dashboard metrics
   */
  getMetrics(connectionStats?: { active: number; max: number }): DashboardMetrics {
    const successfulRequests = this.totalRequests - this.total4xx - this.total5xx;
    
    // Calculate percentiles from response time history
    const responseTimes = this.responseTimeAvg.map(p => p.value).filter(v => v > 0);
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    
    const p50 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.5)] : 0;
    const p95 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] : 0;
    const p99 = sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.99)] : 0;
    const avg = this.totalRequests > 0 ? this.totalResponseTime / this.totalRequests : 0;
    
    // Calculate requests per minute
    const lastMinute = this.requestsPerMinute[this.requestsPerMinute.length - 1];
    const perMinute = lastMinute?.value || this.currentMinute?.count || 0;
    
    return {
      requests: {
        total: this.totalRequests,
        perMinute,
        successRate: this.totalRequests > 0 
          ? (successfulRequests / this.totalRequests) * 100 
          : 100
      },
      responseTime: {
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
        avg: Math.round(avg)
      },
      errors: {
        total4xx: this.total4xx,
        total5xx: this.total5xx,
        errorRate: this.totalRequests > 0 
          ? ((this.total4xx + this.total5xx) / this.totalRequests) * 100 
          : 0
      },
      connections: {
        active: connectionStats?.active || 0,
        max: connectionStats?.max || 50,
        utilization: connectionStats 
          ? (connectionStats.active / connectionStats.max) * 100 
          : 0
      },
      tenants: {
        active: 0,
        requestsPerTenant: {}
      },
      timeSeries: {
        requestsPerMinute: this.requestsPerMinute,
        responseTimeAvg: this.responseTimeAvg,
        errorRate: this.errorRate,
        activeConnections: this.activeConnections
      }
    };
  }
  
  /**
   * Get time series data
   */
  getTimeSeriesData() {
    return {
      requestsPerMinute: this.requestsPerMinute,
      responseTimeAvg: this.responseTimeAvg,
      errorRate: this.errorRate,
      activeConnections: this.activeConnections,
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.requestsPerMinute = [];
    this.responseTimeAvg = [];
    this.errorRate = [];
    this.activeConnections = [];
    this.currentMinute = null;
    this.totalRequests = 0;
    this.total4xx = 0;
    this.total5xx = 0;
    this.totalResponseTime = 0;
  }
}

export const metricsStore = new MetricsStore();
