export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 1, delayMs = 5000, label = 'operation' }: RetryOptions = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(
          `[retry] ${label} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delayMs}ms:`,
          err instanceof Error ? err.message : err
        );
        await sleep(delayMs);
      }
    }
  }

  throw new Error(
    `${label} failed after ${retries + 1} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    { cause: lastError }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
