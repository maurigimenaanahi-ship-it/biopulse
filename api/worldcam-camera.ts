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

function decodeHtmlAttribute(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;/g, "'");
}

function isTrustedWorldcamImage(rawUrl: string) {
  try {
    const url = new URL(decodeHtmlAttribute(rawUrl));
    const host = url.hostname.toLowerCase();
    if (host !== "www.worldcam.pl" && host !== "worldcam.pl" && host !== "img2.worldcam.pl") return null;
    if (!/^\/(?:images\/)?webcams\/(?:840x472|420x236)(?:\/\d{4}-\d{2}-\d{2})?\/[a-z0-9._-]+\.jpe?g$/i.test(url.pathname)) {
      return null;
    }
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}

function currentSnapshotUrl(html: string) {
  const primaryImage =
    html.match(/<img\b[^>]*class=["'][^"']*image-preview-thumbnail[^"']*["'][^>]*>/i)?.[0] ??
    html.match(/image-preview-thumbnail[\s\S]{0,1200}/i)?.[0] ??
    "";
  const searchSpace = primaryImage || html;
  const matches = Array.from(
    searchSpace.matchAll(/https?:\/\/(?:www\.|img2\.)?worldcam\.pl\/(?:images\/)?webcams\/(?:840x472|420x236)(?:\/\d{4}-\d{2}-\d{2})?\/[^"'<>\\\s)]+\.jpe?g(?:\?[^"'<>\\\s)]+)?/gi),
    (match) => match[0]
  );

  const trusted = Array.from(new Set(matches.map(isTrustedWorldcamImage).filter((url): url is string => Boolean(url))));
  return trusted.find((url) => url.includes("/840x472/")) ?? trusted[0] ?? null;
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
  const cameraId = (url.searchParams.get("cameraId") ?? url.searchParams.get("cameraKey") ?? "").trim();

  if (!/^\d+$/.test(cameraId)) {
    return json({ error: "Invalid WorldCam cameraId" }, { status: 400 });
  }

  const detailUrl = `https://worldcam.eu/liveview/${encodeURIComponent(cameraId)}`;

  try {
    const upstream = await fetch(detailUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": "BioPulse/1.0 (+https://biopulse-weld.vercel.app)",
      },
    });

    if (!upstream.ok) {
      return json(
        {
          error: "WorldCam liveview error",
          status: upstream.status,
          detailUrl,
        },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const html = await upstream.text();
    const snapshotUrl = currentSnapshotUrl(html);

    return json(
      {
        provider: "worldcam",
        providerCameraId: cameraId,
        status: snapshotUrl ? "ready" : "unavailable",
        snapshotUrl,
        playerUrl: null,
        detailUrl,
        attributionText: "Fuente: WorldCam",
        message: snapshotUrl ? null : "No current WorldCam image found.",
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
        error: "Unable to fetch WorldCam liveview",
        message: err?.message ? String(err.message) : "Unknown error",
        detailUrl,
      },
      { status: 502 }
    );
  }
}
