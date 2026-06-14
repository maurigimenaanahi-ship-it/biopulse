export const config = {
  runtime: "edge",
};

type WindyWebcamResponse = {
  status?: string;
  title?: string;
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

function pickSnapshotUrl(images?: WindyWebcamResponse["images"]) {
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
  const cameraId = (url.searchParams.get("cameraId") ?? "").trim();

  if (!/^\d+$/.test(cameraId)) {
    return json({ error: "Invalid cameraId" }, { status: 400 });
  }

  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;
  if (!apiKey) {
    return json({ error: "Missing WINDY_WEBCAMS_API_KEY" }, { status: 500 });
  }

  const windyUrl =
    `https://api.windy.com/webcams/api/v3/webcams/${encodeURIComponent(cameraId)}` +
    `?include=images,urls`;

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
        { status: res.status === 404 ? 404 : 502 }
      );
    }

    const raw = await res.json();
    const data = ((raw as any)?.webcam ?? raw) as WindyWebcamResponse;
    const snapshotUrl = pickSnapshotUrl(data.images);
    const detailUrl = data.urls?.detail ?? `https://www.windy.com/webcams/${cameraId}`;

    return json({
      provider: "windy",
      providerCameraId: cameraId,
      status: data.status ?? null,
      title: data.title ?? null,
      snapshotUrl,
      detailUrl,
      attributionText: "Webcams provided by Windy.com",
    });
  } catch (err: any) {
    return json(
      {
        error: "Unable to fetch Windy camera",
        message: err?.message ? String(err.message) : "Unknown error",
      },
      { status: 502 }
    );
  }
}
