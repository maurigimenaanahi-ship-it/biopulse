import {
  fetchWindyApi,
  normalizeWindyWebcam,
  pickWindyPlayerUrl,
  pickWindySnapshotUrl,
  windyErrorResponse,
} from "../src/app/lib/windyWebcams";

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
  const cameraId = (url.searchParams.get("cameraId") ?? "").trim();

  if (!/^\d+$/.test(cameraId)) {
    return json({ error: "Invalid cameraId" }, { status: 400 });
  }

  try {
    const { data, cached } = await fetchWindyApi<any>(`/webcams/api/v3/webcams/${encodeURIComponent(cameraId)}`, {
      include: "images,urls,player",
    });

    const webcam = normalizeWindyWebcam(data);
    const snapshotUrl = pickWindySnapshotUrl(webcam.images);
    const playerUrl = pickWindyPlayerUrl(webcam.player);
    const detailUrl = webcam.urls?.detail ?? `https://www.windy.com/webcams/${cameraId}`;

    return json(
      {
        provider: "windy",
        providerCameraId: cameraId,
        status: webcam.status ?? null,
        title: webcam.title ?? null,
        snapshotUrl,
        playerUrl,
        detailUrl,
        attributionText: "Webcams provided by Windy.com",
      },
      {
        headers: {
          "cache-control": "s-maxage=300, stale-while-revalidate=900",
          "x-biopulse-windy-cache": cached ? "hit" : "miss",
        },
      }
    );
  } catch (err) {
    const response = windyErrorResponse(err, "Unable to fetch Windy camera", { notFoundAs404: true });
    return json(response.body, { status: response.status });
  }
}
