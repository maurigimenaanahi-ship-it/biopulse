export const config = {
  runtime: "edge",
};

type AgvpStation = {
  title: string;
  locality: string;
};

const AGVP_STATIONS: Record<string, AgvpStation> = {
  EM01: { title: "Rio Gallegos (InSET)", locality: "Rio Gallegos" },
  EM02: { title: "Monte Leon (AGVP)", locality: "Monte Leon" },
  EM03: { title: "El Cerrito (AGVP)", locality: "El Cerrito" },
  EM04: { title: "Tres Lagos (AGVP)", locality: "Tres Lagos" },
  EM05: { title: "La Esperanza (AGVP)", locality: "La Esperanza" },
  EM06: { title: "28 de Noviembre (AGVP)", locality: "28 de Noviembre" },
  EM07: { title: "Tapi Aike (AGVP)", locality: "Tapi Aike" },
  EM08: { title: "Canadon Seco (AGVP)", locality: "Canadon Seco" },
  EM09: { title: "Las Heras (AGVP)", locality: "Las Heras" },
  EM10: { title: "Tamel Aike (AGVP)", locality: "Tamel Aike" },
  EM11: { title: "El Chalten (AGVP)", locality: "El Chalten" },
  EM12: { title: "Tellier (AGVP)", locality: "Tellier" },
  EM13: { title: "Puerto San Julian (AGVP)", locality: "Puerto San Julian" },
  EM14: { title: "Tres Cerros (AGVP)", locality: "Tres Cerros" },
  EM15: { title: "Cerro Bombero (UNPA-UASJ)", locality: "Cerro Bombero" },
  EM16: { title: "Gobernador Gregores (AGVP)", locality: "Gobernador Gregores" },
  EM17: { title: "Puerto San Julian (UNEPOSC)", locality: "Puerto San Julian" },
  EM18: { title: "Moscoso (INTA-EEASC)", locality: "Moscoso" },
  EM19: { title: "Lago Posadas (AGVP)", locality: "Lago Posadas" },
  EM20: { title: "Perito Moreno (AGVP)", locality: "Perito Moreno" },
  EM21: { title: "Gobernador Gregores (CPE)", locality: "Gobernador Gregores" },
  EM22: { title: "Paraje Las Vegas (CPE)", locality: "Paraje Las Vegas" },
  EM23: { title: "Destacamento Onelli (APN-PNPM)", locality: "Parque Nacional Perito Moreno" },
  EM24: { title: "Destacamento El Rincon (APN-PNPM)", locality: "Parque Nacional Perito Moreno" },
  EM25: { title: "Las Heras (Aeroclub)", locality: "Las Heras" },
};

const AGVP_BASE = "https://www.agvp.gob.ar/estaciones";

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...(init.headers ?? {}),
    },
  });
}

function stationPageUrl(stationKey: string) {
  return `${AGVP_BASE}/${stationKey}/${stationKey}.html`;
}

function stationPhotoUrl(stationKey: string, stamp: string) {
  return `${AGVP_BASE}/${stationKey}/Fotos/${stationKey}-${stamp}.jpg`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function stationHourStamp(date: Date, hoursBack = 0) {
  const shifted = new Date(date.getTime() - hoursBack * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Rio_Gallegos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(shifted)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}${parts.month}${parts.day}${parts.hour}`;
}

function parseUpdateStamp(html: string) {
  const match = html.match(
    /hora\s+(\d{1,2}):00\s+del\s+d(?:i|\u00ed|\u00c3\u00ad|&iacute;)a\s+(\d{1,2})\/(\d{1,2})\/(\d{2})/i
  );
  if (!match) return null;

  const hour = Number(match[1]);
  const day = Number(match[2]);
  const month = Number(match[3]);
  const year = 2000 + Number(match[4]);

  if (!Number.isFinite(hour) || !Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }

  return `${year}${pad2(month)}${pad2(day)}${pad2(hour)}`;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function isUsableJpeg(url: string) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "HEAD",
        headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
      },
      2500
    );

    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    return /image\/jpe?g/i.test(contentType) && (!Number.isFinite(contentLength) || contentLength === 0 || contentLength > 2000);
  } catch {
    return false;
  }
}

async function firstUsableSnapshot(stationKey: string, html: string, now: Date) {
  const parsedStamp = parseUpdateStamp(html);
  const candidateStamps = unique([
    parsedStamp,
    stationHourStamp(now, 0),
    stationHourStamp(now, 1),
    stationHourStamp(now, 2),
    stationHourStamp(now, 3),
    stationHourStamp(now, 6),
    stationHourStamp(now, 12),
    stationHourStamp(now, 24),
  ].filter((stamp): stamp is string => Boolean(stamp)));

  for (const stamp of candidateStamps) {
    const snapshotUrl = stationPhotoUrl(stationKey, stamp);
    if (await isUsableJpeg(snapshotUrl)) {
      return { snapshotUrl, observedHour: stamp };
    }
  }

  return { snapshotUrl: null, observedHour: parsedStamp ?? candidateStamps[0] ?? null };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(req.url);
  const stationKey = (url.searchParams.get("stationKey") ?? url.searchParams.get("cameraKey") ?? "")
    .trim()
    .toUpperCase();
  const station = AGVP_STATIONS[stationKey];

  if (!station || !/^EM(0[1-9]|1[0-9]|2[0-5])$/.test(stationKey)) {
    return json({ error: "Invalid AGVP stationKey" }, { status: 400 });
  }

  const detailUrl = stationPageUrl(stationKey);
  const now = new Date();

  try {
    const upstream = await fetchWithTimeout(detailUrl, { headers: { Accept: "text/html" } }, 6000);

    if (!upstream.ok) {
      return json(
        {
          error: "AGVP station page error",
          status: upstream.status,
          detailUrl,
        },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const html = await upstream.text();
    const snapshot = await firstUsableSnapshot(stationKey, html, now);

    if (!snapshot.snapshotUrl) {
      return json(
        {
          error: "No recent AGVP snapshot found",
          provider: "agvp-santa-cruz",
          providerCameraId: stationKey,
          status: "no_snapshot",
          title: station.title,
          detailUrl,
          observedHour: snapshot.observedHour,
          attributionText: "Fuente: Administracion General de Vialidad Provincial de Santa Cruz",
        },
        { status: 502 }
      );
    }

    return json(
      {
        provider: "agvp-santa-cruz",
        providerCameraId: stationKey,
        status: "ready",
        title: station.title,
        locality: station.locality,
        snapshotUrl: snapshot.snapshotUrl,
        observedHour: snapshot.observedHour,
        detailUrl,
        attributionText: "Fuente: Administracion General de Vialidad Provincial de Santa Cruz",
      },
      {
        headers: {
          "cache-control": "s-maxage=300, stale-while-revalidate=900",
        },
      }
    );
  } catch (err: any) {
    return json(
      {
        error: "Unable to fetch AGVP camera",
        message: err?.message ? String(err.message) : "Unknown error",
        detailUrl,
      },
      { status: 502 }
    );
  }
}
