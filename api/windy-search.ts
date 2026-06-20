export const config = {
  runtime: "edge",
};

type WindyWebcam = {
  webcamId?: string | number;
  id?: string | number;
  title?: string;
  status?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  images?: {
    current?: Record<string, string | null | undefined>;
  };
  urls?: {
    detail?: string;
  };
};

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

function pickSnapshotUrl(images?: WindyWebcam["images"]) {
  const current = images?.current ?? {};
  const preferred = ["full", "preview", "medium", "thumbnail", "icon"];

  for (const key of preferred) {
    const value = current[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }

  for (const value of Object.values(current)) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }

  return null;
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
  const latRaw = url.searchParams.get("lat");
  const lonRaw = url.searchParams.get("lon");
  const radiusRaw = url.searchParams.get("radius");
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  const radius = Number(radiusRaw);

  if (latRaw == null || latRaw.trim() === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return json({ error: "Invalid lat" }, { status: 400 });
  }

  if (lonRaw == null || lonRaw.trim() === "" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return json({ error: "Invalid lon" }, { status: 400 });
  }

  if (
    radiusRaw == null ||
    radiusRaw.trim() === "" ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    radius > 1000
  ) {
    return json({ error: "Invalid radius" }, { status: 400 });
  }

  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;
  if (!apiKey) {
    return json({ error: "Missing WINDY_WEBCAMS_API_KEY" }, { status: 500 });
  }

  const nearby = `${lat},${lon},${radius}`;
  const windyUrl =
    `https://api.windy.com/webcams/api/v3/webcams` +
    `?nearby=${encodeURIComponent(nearby)}` +
    `&include=images,urls,location` +
    `&limit=50`;

  try {
    const res = await fetch(windyUrl, {
      headers: {
        Accept: "application/json",
        "x-windy-api-key": apiKey,
      },
    });

    if (!res.ok) {
      return json(
        {
          error: "Windy API error",
          status: res.status,
        },
        { status: 502 }
      );
    }

    const data: any = await res.json();
    const webcams: WindyWebcam[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.webcams)
      ? data.webcams
      : Array.isArray(data?.result?.webcams)
      ? data.result.webcams
      : [];

    const items = webcams.map((webcam) => {
      const webcamId = webcam.webcamId ?? webcam.id ?? null;
      return {
        webcamId: webcamId == null ? null : String(webcamId),
        title: webcam.title ?? null,
        status: webcam.status ?? null,
        lat: Number.isFinite(webcam.location?.latitude) ? webcam.location!.latitude : null,
        lon: Number.isFinite(webcam.location?.longitude) ? webcam.location!.longitude : null,
        snapshotUrl: pickSnapshotUrl(webcam.images),
        detailUrl:
          webcam.urls?.detail ??
          (webcamId == null ? null : `https://www.windy.com/webcams/${String(webcamId)}`),
      };
    });

    return json({ count: items.length, items });
  } catch (err: any) {
    return json(
      {
        error: "Unable to search Windy cameras",
        message: err?.message ? String(err.message) : "Unknown error",
      },
      { status: 502 }
    );
  }
}
