export const config = {
  runtime: "edge",
};

const LAGACETA_PLAY_URL = "https://www.lagaceta.com.ar/lgplay";

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
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/");
}

function normalizeYoutubeEmbed(rawUrl: string) {
  try {
    const parsed = new URL(decodeHtmlAttribute(rawUrl));
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

    const match = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{6,})$/);
    if (!match) return null;

    const embed = new URL(`https://www.youtube.com/embed/${match[1]}`);
    embed.searchParams.set("rel", "0");
    embed.searchParams.set("autoplay", "1");
    embed.searchParams.set("mute", "1");
    return { playerUrl: embed.toString(), videoId: match[1] };
  } catch {
    return null;
  }
}

function currentYoutubeEmbed(html: string) {
  const iframeSrcMatches = Array.from(
    html.matchAll(/<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
    (match) => match[1]
  );

  for (const src of iframeSrcMatches) {
    const embed = normalizeYoutubeEmbed(src);
    if (embed) return embed;
  }

  const fallback = html.match(/https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[a-zA-Z0-9_-]{6,}(?:\?[^"'<>\\\s]*)?/i);
  return fallback ? normalizeYoutubeEmbed(fallback[0]) : null;
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
  const cameraKey = (url.searchParams.get("cameraKey") ?? "main").trim().toLowerCase();
  if (cameraKey !== "main" && cameraKey !== "lgplay") {
    return json({ error: "Invalid LA GACETA Play cameraKey" }, { status: 400 });
  }

  try {
    const upstream = await fetch(LAGACETA_PLAY_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "BioPulse/1.0 (+https://biopulse-weld.vercel.app)",
      },
    });

    if (!upstream.ok) {
      return json(
        {
          error: "LA GACETA Play page error",
          status: upstream.status,
          detailUrl: LAGACETA_PLAY_URL,
        },
        { status: upstream.status === 404 ? 404 : 502 }
      );
    }

    const html = await upstream.text();
    const embed = currentYoutubeEmbed(html);

    return json(
      {
        provider: "lagaceta-play",
        providerCameraId: cameraKey,
        status: embed ? "ready" : "unavailable",
        title: "LA GACETA Play",
        playerUrl: embed?.playerUrl ?? null,
        currentVideoId: embed?.videoId ?? null,
        snapshotUrl: null,
        detailUrl: LAGACETA_PLAY_URL,
        attributionText: "Fuente: LA GACETA Play",
        message: embed ? null : "No current YouTube iframe found on LA GACETA Play.",
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
        error: "Unable to fetch LA GACETA Play",
        message: err?.message ? String(err.message) : "Unknown error",
        detailUrl: LAGACETA_PLAY_URL,
      },
      { status: 502 }
    );
  }
}
