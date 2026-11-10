let queue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;
let blockedUntil = 0;

const INTERVAL_MS = 1_100;
const DEFAULT_COOLDOWN_MS = 60_000;

export type NominatimResult = {
  status: number;
  data?: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(header: string | null): number {
  if (!header) return DEFAULT_COOLDOWN_MS;

  const seconds = Number(header);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = Date.parse(header);

  if (Number.isFinite(date)) {
    return Math.max(0, date - Date.now());
  }

  return DEFAULT_COOLDOWN_MS;
}

export function fetchNominatim(
  url: string,
  userAgent: string
): Promise<NominatimResult> {
  const request = queue.then(async (): Promise<NominatimResult> => {
    const allowedAt = Math.max(nextRequestAt, blockedUntil);

    await sleep(Math.max(0, allowedAt - Date.now()));

    nextRequestAt = Date.now() + INTERVAL_MS;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent },
        signal: controller.signal
      });

      const status = response.status || (response.ok ? 200 : 0);

      if (status === 429) {
        const cooldown = retryAfterMs(
          response.headers?.get("Retry-After") ?? null
        );

        blockedUntil = Math.max(
          blockedUntil,
          Date.now() + cooldown
        );

        await response.body?.cancel();

        return { status };
      }

      if (!response.ok) {
        await response.body?.cancel();
        return { status };
      }

      const data = await response.json();

      return { status, data };
    } finally {
      clearTimeout(timeout);
    }
  });

  queue = request.then(
    () => undefined,
    () => undefined
  );

  return request;
}
