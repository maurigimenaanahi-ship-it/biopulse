import {
  fetchWindyApi,
  normalizeWindyWebcams,
  pickWindyPlayerUrl,
  pickWindySnapshotUrl,
  windyErrorResponse,
  type WindyWebcam,
} from "../src/app/lib/windyWebcams.ts";

export const config = {
  runtime: "edge",
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

function normalizeItem(webcam: WindyWebcam) {
  const webcamId = webcam.webcamId ?? webcam.id ?? null;
  return {
    webcamId: webcamId == null ? null : String(webcamId),
    title: webcam.title ?? null,
    status: webcam.status ?? null,
    lat: Number.isFinite(webcam.location?.latitude) ? webcam.location!.latitude : null,
    lon: Number.isFinite(webcam.location?.longitude) ? webcam.location!.longitude : null,
    snapshotUrl: pickWindySnapshotUrl(webcam.images),
    playerUrl: pickWindyPlayerUrl(webcam.player),
    detailUrl:
      webcam.urls?.detail ??
      (webcamId == null ? null : `https://www.windy.com/webcams/${String(webcamId)}`),
  };
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

  const nearby = `${lat},${lon},${radius}`;

  try {
    const { data, cached } = await fetchWindyApi<any>("/webcams/api/v3/webcams", {
      nearby,
      include: "images,urls,location,player",
      limit: 50,
    });

    const webcams = normalizeWindyWebcams(data);
    const items = webcams.map(normalizeItem);

    return json(
      { count: items.length, items },
      {
        headers: {
          "cache-control": "s-maxage=300, stale-while-revalidate=900",
          "x-biopulse-windy-cache": cached ? "hit" : "miss",
        },
      }
    );
  } catch (err) {
    const response = windyErrorResponse(err, "Unable to search Windy cameras");
    return json(response.body, { status: response.status });
  }
}
