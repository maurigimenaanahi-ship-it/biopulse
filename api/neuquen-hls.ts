export const config = {
  runtime: "edge",
};

const UPSTREAM_BASE = "https://camaras.neuquencapital.gov.ar/live";

const ALLOWED_CAMERAS = new Set([
  "balconvalle",
  "canal7",
  "isla132",
  "monumento-calle",
  "monumento-muni",
  "monumento-piso3",
  "parquecentral",
  "rotonda-riolimay",
]);

function corsHeaders(extra: HeadersInit = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "content-type, range",
    ...extra,
  };
}

function textResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    ...init,
    headers: corsHeaders({
      "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    }),
  });
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: corsHeaders({
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    }),
  });
}

function segmentHeaders(upstream: Response) {
  const headers: Record<string, string> = {
    "content-type": upstream.headers.get("content-type") ?? "video/mp2t",
    "cache-control": "no-store",
  };
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers["content-length"] = contentLength;
  return headers;
}

function isAllowedCamera(camera: string) {
  return ALLOWED_CAMERAS.has(camera);
}

function buildProxyUrl(req: Request, params: Record<string, string>) {
  const url = new URL(req.url);
  url.search = "";

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

function rewriteMasterPlaylist(req: Request, camera: string, playlist: string) {
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(new RegExp(`^/live/${camera.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.m3u8\\?hls_ctx=([a-z0-9]+)$`, "i"));
      if (!match) return line;

      return buildProxyUrl(req, {
        camera,
        playlist: "media",
        hls_ctx: match[1],
      });
    })
    .join("\n");
}

function rewriteMediaPlaylist(req: Request, camera: string, hlsCtx: string, playlist: string) {
  return playlist
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(new RegExp(`^(${camera.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+\\.ts)\\?hls_ctx=([a-z0-9]+)$`, "i"));
      if (!match) return line;

      return buildProxyUrl(req, {
        camera,
        segment: match[1],
        hls_ctx: match[2] || hlsCtx,
      });
    })
    .join("\n");
}

async function fetchUpstream(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.apple.mpegurl,video/mp2t,*/*",
      ...(init.headers ?? {}),
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestUrl = new URL(req.url);
  const camera = (requestUrl.searchParams.get("camera") ?? "").trim().toLowerCase();
  const playlistType = (requestUrl.searchParams.get("playlist") ?? "master").trim().toLowerCase();
  const hlsCtx = (requestUrl.searchParams.get("hls_ctx") ?? "").trim();
  const segment = (requestUrl.searchParams.get("segment") ?? "").trim();

  if (!isAllowedCamera(camera)) {
    return json({ error: "Invalid Neuquen Capital camera" }, { status: 400 });
  }

  if (segment) {
    const expectedSegment = new RegExp(`^${camera.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+\\.ts$`, "i");
    if (!expectedSegment.test(segment) || !/^[a-z0-9]+$/i.test(hlsCtx)) {
      return json({ error: "Invalid Neuquen Capital segment" }, { status: 400 });
    }

    const upstreamUrl = `${UPSTREAM_BASE}/${segment}?hls_ctx=${encodeURIComponent(hlsCtx)}`;
    const upstream = await fetchUpstream(upstreamUrl, { method: req.method });

    if (!upstream.ok) {
      return json({ error: "Neuquen Capital segment error", status: upstream.status }, { status: upstream.status });
    }

    return new Response(req.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: corsHeaders(segmentHeaders(upstream)),
    });
  }

  if (playlistType !== "master" && playlistType !== "media") {
    return json({ error: "Invalid Neuquen Capital playlist type" }, { status: 400 });
  }

  const upstreamUrl =
    playlistType === "media"
      ? `${UPSTREAM_BASE}/${camera}.m3u8?hls_ctx=${encodeURIComponent(hlsCtx)}`
      : `${UPSTREAM_BASE}/${camera}.m3u8`;

  if (playlistType === "media" && !/^[a-z0-9]+$/i.test(hlsCtx)) {
    return json({ error: "Invalid Neuquen Capital hls_ctx" }, { status: 400 });
  }

  const upstream = await fetchUpstream(upstreamUrl, { method: req.method });

  if (!upstream.ok) {
    return json({ error: "Neuquen Capital playlist error", status: upstream.status }, { status: upstream.status });
  }

  if (req.method === "HEAD") {
    return new Response(null, {
      status: upstream.status,
      headers: corsHeaders({
        "content-type": "application/vnd.apple.mpegurl",
        "cache-control": "no-store",
      }),
    });
  }

  const playlist = await upstream.text();
  const rewritten =
    playlistType === "media"
      ? rewriteMediaPlaylist(req, camera, hlsCtx, playlist)
      : rewriteMasterPlaylist(req, camera, playlist);

  return textResponse(rewritten);
}
