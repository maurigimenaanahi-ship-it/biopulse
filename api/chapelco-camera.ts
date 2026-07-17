export const config = {
  runtime: "edge",
};

const CHAPELCO_CAMERAS: Record<string, { title: string; detailPath: string }> = {
  cam016: {
    title: "Pradera del Puma (Silla del Mocho)",
    detailPath: "cam016",
  },
  cam017: {
    title: "Desenganche Lift del Puente",
    detailPath: "cam017",
  },
  cam018: {
    title: "Desenganche Silla Rancho Grande (hacia la cordillera)",
    detailPath: "cam018",
  },
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

function latestSnapshotUrl(html: string, cameraKey: string) {
  const escaped = cameraKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `https://camaras\\.ar/imagenes_100726/${escaped}/[^"'<>\\s]+\\.jpg`,
    "g"
  );
  const matches = Array.from(new Set(html.match(pattern) ?? []));
  return matches[0] ?? null;
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
  const cameraKey = (url.searchParams.get("cameraKey") ?? "").trim();
  const camera = CHAPELCO_CAMERAS[cameraKey];

  if (!camera) {
    return json({ error: "Invalid Chapelco cameraKey" }, { status: 400 });
  }

  const detailUrl =
    `https://chapelco.com.ar/camaras/?cam=${encodeURIComponent(camera.detailPath)}` +
    "&hora=&dia=&cant_dias_atras=15";

  try {
    const upstream = await fetch(detailUrl, {
      headers: {
        Accept: "text/html",
      },
    });

    if (!upstream.ok) {
      return json(
        {
          error: "Chapelco camera page error",
          status: upstream.status,
        },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const html = await upstream.text();
    const snapshotUrl = latestSnapshotUrl(html, cameraKey);

    if (!snapshotUrl) {
      return json({ error: "No Chapelco snapshot found" }, { status: 502 });
    }

    return json(
      {
        provider: "chapelco",
        providerCameraId: cameraKey,
        status: "ready",
        title: camera.title,
        snapshotUrl,
        detailUrl,
        attributionText: "Fuente: Chapelco / Varitech",
      },
      {
        headers: {
          "cache-control": "s-maxage=60, stale-while-revalidate=240",
        },
      }
    );
  } catch (err: any) {
    return json(
      {
        error: "Unable to fetch Chapelco camera",
        message: err?.message ? String(err.message) : "Unknown error",
      },
      { status: 502 }
    );
  }
}
