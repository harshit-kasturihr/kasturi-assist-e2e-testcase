export function generateRandomPhoneNumber(): string {
  const number = Math.floor(9000000000 + Math.random() * 100000000);
  return `${number}`;
}

export function generateRandomEmail(prefix = 'demo'): string {
  const suffix = Math.floor(Math.random() * 1_000_000);
  return `${prefix}+${suffix}@example.com`;
}

export async function retry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}
