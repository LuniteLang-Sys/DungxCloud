// src/lib/metrics.ts
// Lightweight, Edge-ready, zero-dependency Prometheus Metric Registry for Next.js Serverless.
// Avoids heavy native bindings and manages Counters, Gauges, and Histograms in-memory.

export type Labels = Record<string, string | number | undefined>;

function formatLabels(labels?: Labels): string {
  if (!labels) return '';
  const parts = Object.entries(labels)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}="${value}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

class Counter {
  private values = new Map<string, number>();
  readonly name: string;
  readonly help: string;

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels?: Labels, amount = 1) {
    const key = JSON.stringify(labels || {});
    const current = this.values.get(key) || 0;
    this.values.set(key, current + amount);
  }

  expose(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
    for (const [keyStr, val] of this.values.entries()) {
      const labels = JSON.parse(keyStr) as Labels;
      out += `${this.name}${formatLabels(labels)} ${val}\n`;
    }
    return out;
  }
}

class Gauge {
  private values = new Map<string, number>();
  readonly name: string;
  readonly help: string;

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  set(value: number, labels?: Labels) {
    const key = JSON.stringify(labels || {});
    this.values.set(key, value);
  }

  inc(labels?: Labels, amount = 1) {
    const key = JSON.stringify(labels || {});
    const current = this.values.get(key) || 0;
    this.values.set(key, current + amount);
  }

  dec(labels?: Labels, amount = 1) {
    const key = JSON.stringify(labels || {});
    const current = this.values.get(key) || 0;
    this.values.set(key, current - amount);
  }

  expose(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n`;
    for (const [keyStr, val] of this.values.entries()) {
      const labels = JSON.parse(keyStr) as Labels;
      out += `${this.name}${formatLabels(labels)} ${val}\n`;
    }
    return out;
  }
}

class Histogram {
  private buckets: number[];
  private counts = new Map<string, number[]>(); // label key -> bucket counts
  private sums = new Map<string, number>();     // label key -> sum of observations
  private totalCounts = new Map<string, number>(); // label key -> total count
  readonly name: string;
  readonly help: string;

  constructor(name: string, help: string, buckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    this.name = name;
    this.help = help;
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(value: number, labels?: Labels) {
    const key = JSON.stringify(labels || {});
    
    // Sum
    const currentSum = this.sums.get(key) || 0;
    this.sums.set(key, currentSum + value);

    // Total Count
    const currentTotal = this.totalCounts.get(key) || 0;
    this.totalCounts.set(key, currentTotal + 1);

    // Buckets
    let bucketCounts = this.counts.get(key);
    if (!bucketCounts) {
      bucketCounts = new Array(this.buckets.length).fill(0);
      this.counts.set(key, bucketCounts);
    }

    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        bucketCounts[i]++;
      }
    }
  }

  expose(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
    
    const allKeys = new Set([
      ...this.sums.keys(),
      ...this.totalCounts.keys(),
      ...this.counts.keys()
    ]);

    for (const keyStr of allKeys) {
      const labels = JSON.parse(keyStr) as Labels;
      const bucketCounts = this.counts.get(keyStr) || new Array(this.buckets.length).fill(0);
      const sum = this.sums.get(keyStr) || 0;
      const count = this.totalCounts.get(keyStr) || 0;

      // Output individual buckets
      let accumulated = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        accumulated += bucketCounts[i];
        const bucketLabels = { ...labels, le: this.buckets[i] };
        out += `${this.name}_bucket${formatLabels(bucketLabels)} ${accumulated}\n`;
      }
      
      // Output Inf bucket
      const infLabels = { ...labels, le: '+Inf' };
      out += `${this.name}_bucket${formatLabels(infLabels)} ${count}\n`;

      // Output sum and count
      out += `${this.name}_sum${formatLabels(labels)} ${sum}\n`;
      out += `${this.name}_count${formatLabels(labels)} ${count}\n`;
    }

    return out;
  }
}

// Global Metrics Registry to ensure state is shared across hot-reload / dynamic server module mounts
class MetricsRegistry {
  readonly uploadAttempts = new Counter('nas_upload_attempts_total', 'Total chunk upload attempts');
  readonly chunkRetryCount = new Counter('nas_chunk_retry_attempts_total', 'Total chunk transfer retries');
  readonly uploadRecoveryCount = new Counter('nas_recovered_uploads_total', 'Total successful recoveries after network interruption');
  
  readonly downloadAttempts = new Counter('nas_download_attempts_total', 'Total file download transactions');
  readonly downloadInterruptions = new Counter('nas_download_interruptions_total', 'Total client-side stream interruptions');
  readonly downloadTokenFailures = new Counter('nas_download_token_failures_total', 'Total on-demand token fetch errors');
  readonly downloadCorruptions = new Counter('nas_corrupted_downloads_total', 'Total SHA/MD5 integrity check mismatches');

  readonly totalStorageBytes = new Gauge('nas_total_storage_bytes', 'Virtual capacity metrics across connected storage shards');
  readonly unhealthyAccounts = new Gauge('nas_unhealthy_accounts_total', 'Total currently active accounts in error/expired states');
  readonly tokenRefreshFailures = new Counter('nas_google_token_refresh_failures_total', 'Google API account token refresh failures');
  readonly quotaSyncFailures = new Counter('nas_quota_sync_failures_total', 'Google Drive background storage sync failures');

  readonly googleOauthLatency = new Histogram('nas_google_oauth_duration_seconds', 'Google API OAuth access token request duration');
  readonly databaseSlowQueries = new Gauge('nas_postgres_slow_queries_total', 'Total database slow queries executed');
  readonly databaseTransactionFailures = new Counter('nas_postgres_transaction_failures_total', 'Total failed database write transactions');
  readonly databaseDeadlocks = new Counter('nas_postgres_deadlocks_total', 'Total postgres lockdead conditions encountered');

  readonly frontendUiCrashes = new Counter('nas_frontend_ui_crashes_total', 'Total caught React UI component freeze crashes');
  readonly frontendHydrationErrors = new Counter('nas_frontend_hydration_errors_total', 'Total client-server hydration mismatch exceptions');
  readonly frontendFailedOptimisticUpdates = new Counter('nas_frontend_failed_optimistic_updates_total', 'Total client optimistic states rollbacks');

  expose(): string {
    return [
      this.uploadAttempts.expose(),
      this.chunkRetryCount.expose(),
      this.uploadRecoveryCount.expose(),
      this.downloadAttempts.expose(),
      this.downloadInterruptions.expose(),
      this.downloadTokenFailures.expose(),
      this.downloadCorruptions.expose(),
      this.totalStorageBytes.expose(),
      this.unhealthyAccounts.expose(),
      this.tokenRefreshFailures.expose(),
      this.quotaSyncFailures.expose(),
      this.googleOauthLatency.expose(),
      this.databaseSlowQueries.expose(),
      this.databaseTransactionFailures.expose(),
      this.databaseDeadlocks.expose(),
      this.frontendUiCrashes.expose(),
      this.frontendHydrationErrors.expose(),
      this.frontendFailedOptimisticUpdates.expose(),
    ].join('\n');
  }
}

// Preserve global singleton reference in Next.js live-reload contexts
const globalRef = globalThis as unknown as { metricsRegistry?: MetricsRegistry };
export const metricsRegistry = globalRef.metricsRegistry || new MetricsRegistry();

if (process.env.NODE_ENV !== 'production') {
  globalRef.metricsRegistry = metricsRegistry;
}
