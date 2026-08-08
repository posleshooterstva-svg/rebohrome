import "server-only";

const ENABLED = process.env.PERF_LOGS !== "0";

export function logPerf(label: string, startedAt: number) {
  if (!ENABLED) {
    return;
  }

  const duration = Math.max(0, Math.round(performance.now() - startedAt));
  console.info(`[PERF] ${label} duration=${duration}ms`);
}

export async function withPerf<T>(label: string, task: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    logPerf(label, startedAt);
  }
}
