export type WindyPlayerValue =
  | string
  | {
      embed?: string | null;
      player?: string | null;
      url?: string | null;
      available?: boolean | null;
    }
  | null
  | undefined;

export type WindyWebcam = {
  webcamId?: string | number;
  id?: string | number;
  status?: string;
  title?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
  };
  images?: {
    current?: Record<string, string | null | undefined>;
    daylight?: Record<string, string | null | undefined>;
  };
  player?: string | Record<string, WindyPlayerValue> | null;
  urls?: {
    detail?: string;
  };
};

type WindyRequestResult<T> = {
  data: T;
  cached: boolean;
};

type CacheEntry<T> = {
  expiresAt: number;
  data: T;
};

const WINDY_BASE_URL = "https://api.windy.com";
const WINDY_CACHE_TTL_MS = 5 * 60 * 1000;
const WINDY_TIMEOUT_MS = 30_000;
const WINDY_MAX_RETRIES = 2;
const WINDY_MIN_REQUEST_SPACING_MS = 500;

const cache = new Map<string, CacheEntry<unknown>>();
let lastRequestAt = 0;

export class WindyMissingApiKeyError extends Error {
  constructor() {
    super("Missing WINDY_WEBCAMS_API_KEY");
    this.name = "WindyMissingApiKeyError";
  }
}

export class WindyApiError extends Error {
  status: number;
  statusText: string;

  constructor(status: number, statusText: string) {
    super(`Windy API error ${status}`);
    this.name = "WindyApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(pathname: string, params: URLSearchParams) {
  return `${pathname}?${params.toString()}`;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

async function fetchWithTimeout(url: URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function paceWindyRequest() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < WINDY_MIN_REQUEST_SPACING_MS) {
    await sleep(WINDY_MIN_REQUEST_SPACING_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

export function pickWindySnapshotUrl(images?: WindyWebcam["images"]) {
  const current = images?.current ?? {};
  const daylight = images?.daylight ?? {};
  const preferred = ["full", "preview", "medium", "thumbnail", "icon", "toenail"];

  for (const key of preferred) {
    const value = current[key] ?? daylight[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }

  for (const value of [...Object.values(current), ...Object.values(daylight)]) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }

  return null;
}

export function pickWindyPlayerUrl(player?: WindyWebcam["player"]) {
  if (typeof player === "string" && /^https?:\/\//i.test(player)) return player;
  if (!player || typeof player !== "object") return null;

  const preferred = ["live", "day", "month", "year", "lifetime", "embed", "url"];

  for (const key of preferred) {
    const value: any = player[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    if (value && typeof value === "object") {
      const embed = value.embed ?? value.player ?? value.url;
      if (typeof embed === "string" && /^https?:\/\//i.test(embed)) return embed;
    }
  }

  for (const value of Object.values(player)) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    if (value && typeof value === "object") {
      const embed = (value as any).embed ?? (value as any).player ?? (value as any).url;
      if (typeof embed === "string" && /^https?:\/\//i.test(embed)) return embed;
    }
  }

  return null;
}

export async function fetchWindyApi<T>(
  pathname: string,
  params: Record<string, string | number | boolean | null | undefined>
): Promise<WindyRequestResult<T>> {
  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;
  if (!apiKey) throw new WindyMissingApiKeyError();

  const url = new URL(pathname, WINDY_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  const key = cacheKey(url.pathname, url.searchParams);
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return { data: cached.data, cached: true };
  }
  if (cached) cache.delete(key);

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= WINDY_MAX_RETRIES; attempt += 1) {
    try {
      await paceWindyRequest();
      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "BioPulse/1.0 (+https://biopulse-weld.vercel.app)",
            "x-windy-api-key": apiKey,
          },
        },
        WINDY_TIMEOUT_MS
      );

      if (response.ok) {
        const data = (await response.json()) as T;
        cache.set(key, {
          data,
          expiresAt: Date.now() + WINDY_CACHE_TTL_MS,
        });
        return { data, cached: false };
      }

      const error = new WindyApiError(response.status, response.statusText);
      if (!isRetryableStatus(response.status) || attempt === WINDY_MAX_RETRIES) {
        throw error;
      }
      lastError = error;
    } catch (err) {
      lastError = err;
      if (err instanceof WindyApiError && !isRetryableStatus(err.status)) throw err;
      if (attempt === WINDY_MAX_RETRIES) break;
    }

    await sleep(350 * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to fetch Windy API");
}

export function normalizeWindyWebcams(raw: any): WindyWebcam[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.webcams)) return raw.webcams;
  if (Array.isArray(raw?.result?.webcams)) return raw.result.webcams;
  return [];
}

export function normalizeWindyWebcam(raw: any): WindyWebcam {
  return (raw?.webcam ?? raw?.result?.webcam ?? raw) as WindyWebcam;
}

export function windyErrorResponse(err: unknown, fallbackError: string, options: { notFoundAs404?: boolean } = {}) {
  if (err instanceof WindyMissingApiKeyError) {
    return {
      status: 500,
      body: { error: "Missing WINDY_WEBCAMS_API_KEY" },
    };
  }

  if (err instanceof WindyApiError) {
    const isNotFound = err.status === 404;
    const status = isNotFound && options.notFoundAs404 ? 404 : 502;
    const message =
      err.status === 401 || err.status === 403
        ? "Windy API authentication failed."
        : err.status === 429
        ? "Windy API rate limit exceeded."
        : err.statusText || undefined;

    return {
      status,
      body: {
        error: "Windy API error",
        status: err.status,
        message,
      },
    };
  }

  return {
    status: 502,
    body: {
      error: fallbackError,
      message: err instanceof Error && err.message ? err.message : "Unknown error",
    },
  };
}
