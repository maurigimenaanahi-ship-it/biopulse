#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUT = ".camera-reports/camera-visual-audit.json";
const DEFAULT_REVIEW_OUT = ".camera-reports/camera-visual-audit.md";

const PATAGONIA_ADMINS = new Set([
  "neuquen",
  "rio negro",
  "chubut",
  "santa cruz",
  "tierra del fuego",
]);

const KNOWN_HLS_RELAYS = new Map([
  ["neuquen-capital", "/api/neuquen-hls"],
]);

function parseArgs(argv) {
  const args = {
    registry: "public/cameraregistry.json",
    out: DEFAULT_OUT,
    reviewOut: DEFAULT_REVIEW_OUT,
    scope: "patagonia",
    kinds: new Set(["stream_url", "external_page"]),
    concurrency: 4,
    limit: 0,
    timeoutMs: 18_000,
    noWrite: false,
  };

  for (const raw of argv) {
    if (raw === "--no-write") {
      args.noWrite = true;
      continue;
    }

    const [flag, value = ""] = raw.split("=", 2);
    if (flag === "--registry") args.registry = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--review-out") args.reviewOut = value;
    else if (flag === "--scope") args.scope = value || "patagonia";
    else if (flag === "--kinds") args.kinds = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
    else if (flag === "--concurrency") args.concurrency = positiveInt(value, "concurrency");
    else if (flag === "--limit") args.limit = positiveInt(value, "limit");
    else if (flag === "--timeout-ms") args.timeoutMs = positiveInt(value, "timeout-ms");
    else if (flag === "--help" || flag === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${raw}`);
    }
  }

  if (args.concurrency < 1) throw new Error("--concurrency must be at least 1");
  return args;
}

function printHelp() {
  console.log(`
Audit camera registry visual reachability.

Usage:
  npm run cameras:audit
  npm run cameras:audit -- --scope=neuquen --limit=25

Options:
  --scope=patagonia|neuquen|argentina|all   Registry subset. Default: patagonia
  --kinds=a,b                              Fetch kinds to inspect. Default: stream_url,external_page
  --limit=N                                Stop after N matching cameras. Default: 0, no limit
  --concurrency=N                          Parallel checks. Default: 4
  --timeout-ms=N                           Fetch timeout. Default: 18000
  --registry=PATH                          Camera registry path. Default: public/cameraregistry.json
  --out=PATH                               JSON report path. Default: ${DEFAULT_OUT}
  --review-out=PATH                        Markdown report path. Default: ${DEFAULT_REVIEW_OUT}
  --no-write                               Print summary only
`);
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cameras = JSON.parse(await readFile(args.registry, "utf8"));
  const targets = cameras.filter((camera) => inScope(camera, args.scope) && args.kinds.has(camera.fetch?.kind));
  const limited = args.limit > 0 ? targets.slice(0, args.limit) : targets;

  console.log(`Auditing ${limited.length} camera(s) from ${targets.length} matching ${args.scope}.`);

  const results = await mapConcurrent(limited, args.concurrency, (camera) => inspectCamera(camera, args));
  const report = {
    generatedAt: new Date().toISOString(),
    scope: args.scope,
    options: {
      kinds: Array.from(args.kinds),
      limit: args.limit,
      timeoutMs: args.timeoutMs,
      registry: args.registry,
    },
    summary: summarize(results),
    results,
  };

  printSummary(report);

  if (!args.noWrite) {
    await mkdir(path.dirname(args.out), { recursive: true });
    await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`JSON report written to ${args.out}`);

    await mkdir(path.dirname(args.reviewOut), { recursive: true });
    await writeFile(args.reviewOut, makeMarkdown(report), "utf8");
    console.log(`Review report written to ${args.reviewOut}`);
  }
}

function inScope(camera, scope) {
  const normalizedScope = normalize(scope);
  if (normalizedScope === "all") return true;

  const country = normalize(camera.coverage?.countryISO2);
  const admin = normalize(camera.coverage?.admin1);
  const haystack = normalize(JSON.stringify(camera));

  if (normalizedScope === "argentina") return country === "ar" || haystack.includes("argentina");
  if (normalizedScope === "neuquen") return admin === "neuquen" || haystack.includes("neuquen");
  if (normalizedScope === "patagonia") return PATAGONIA_ADMINS.has(admin);

  return haystack.includes(normalizedScope);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function inspectCamera(camera, args) {
  const base = baseResult(camera);

  try {
    if (camera.fetch?.kind === "stream_url" && normalize(camera.fetch.protocol) === "hls") {
      const hls = await inspectHls(camera.fetch.url, args);
      return classifyHls(base, camera, hls);
    }

    if (camera.fetch?.kind === "external_page") {
      const page = await inspectExternalPage(camera, camera.fetch.url, args);
      return classifyExternalPage(base, camera, page);
    }

    return {
      ...base,
      status: "skipped",
      recommendation: "Fetch kind not handled by visual audit.",
    };
  } catch (err) {
    return {
      ...base,
      status: "audit_error",
      severity: "medium",
      recommendation: "Retry manually; the audit could not complete this check.",
      error: err?.message ? String(err.message) : String(err),
    };
  }
}

function baseResult(camera) {
  return {
    id: camera.id,
    title: camera.title ?? camera.id,
    providerId: camera.providerId ?? camera.fetch?.provider ?? null,
    fetchKind: camera.fetch?.kind ?? null,
    mediaType: camera.mediaType ?? null,
    admin1: camera.coverage?.admin1 ?? null,
    locality: camera.coverage?.locality ?? null,
    url: camera.fetch?.url ?? camera.fetch?.sourceUrl ?? null,
    sourceUrl: camera.fetch?.sourceUrl ?? null,
  };
}

async function inspectHls(rawUrl, args) {
  const master = await fetchText(rawUrl, args.timeoutMs);
  const masterUris = parsePlaylistUris(master.body);
  const firstChild = masterUris.find((uri) => /\.m3u8(?:[?#]|$)/i.test(uri));
  const firstMasterSegment = masterUris.find((uri) => /\.(ts|m4s|mp4)(?:[?#]|$)/i.test(uri));

  let media = null;
  let segment = null;

  if (firstChild) {
    const mediaUrl = resolveUri(master.url, firstChild);
    media = await fetchText(mediaUrl, args.timeoutMs);
    const mediaUris = parsePlaylistUris(media.body);
    const segmentUri = mediaUris.find((uri) => /\.(ts|m4s|mp4)(?:[?#]|$)/i.test(uri));
    if (segmentUri) {
      segment = await probeResource(resolveUri(media.url, segmentUri), args.timeoutMs);
    }
  } else if (firstMasterSegment) {
    segment = await probeResource(resolveUri(master.url, firstMasterSegment), args.timeoutMs);
  }

  return {
    master: responseSummary(master),
    media: media ? responseSummary(media) : null,
    segment,
    masterLooksLikeHls: /^#EXTM3U/m.test(master.body),
    mediaLooksLikeHls: media ? /^#EXTM3U/m.test(media.body) : null,
    firstChild: firstChild ? resolveUri(master.url, firstChild) : null,
    firstSegment: segment?.url ?? null,
  };
}

function classifyHls(base, camera, hls) {
  const provider = camera.providerId ?? camera.fetch?.provider ?? "";
  const relay = KNOWN_HLS_RELAYS.get(provider) ?? null;
  const segmentOk = Boolean(hls.segment?.ok);
  const corsOk = corsAllowsBrowser(hls.master.cors) || corsAllowsBrowser(hls.media?.cors) || corsAllowsBrowser(hls.segment?.cors);

  if (!hls.master.ok || !hls.masterLooksLikeHls) {
    return {
      ...base,
      status: "hls_master_unusable",
      severity: "high",
      recommendation: "Recheck source URL or downgrade only after confirming no alternate player/feed exists.",
      hls,
    };
  }

  if (!segmentOk) {
    return {
      ...base,
      status: "hls_no_verified_segment",
      severity: "high",
      recommendation: "Find a valid media playlist/segment before treating this as playable video.",
      hls,
    };
  }

  if (!corsOk && relay) {
    return {
      ...base,
      status: "hls_real_via_known_relay",
      severity: "low",
      recommendation: `Keep stream_url and route playback through ${relay}; do not degrade to external_page.`,
      hls,
      relay,
    };
  }

  if (!corsOk) {
    return {
      ...base,
      status: "hls_real_no_cors",
      severity: "high",
      recommendation: "Candidate for allowlisted HLS relay if source terms permit. Do not mark as merely external before checking relay path.",
      hls,
    };
  }

  return {
    ...base,
    status: "hls_direct_playable",
    severity: "low",
    recommendation: "Keep as stream_url; direct HLS appears playable from browser context.",
    hls,
  };
}

async function inspectExternalPage(camera, rawUrl, args) {
  const page = await fetchText(rawUrl, args.timeoutMs, { headers: { Accept: "text/html,*/*" } });
  const hlsCandidates = extractHlsCandidates(page.body, page.url);
  const matchedHlsCandidates = hlsCandidates.filter((candidate) => hlsCandidateMatchesCamera(candidate, camera));
  const iframeCandidates = extractIframeCandidates(page.body, page.url).slice(0, 10);
  const sampledHls = [];

  for (const candidate of matchedHlsCandidates.slice(0, 2)) {
    try {
      sampledHls.push({
        url: candidate,
        probe: await inspectHls(candidate, args),
      });
    } catch (err) {
      sampledHls.push({
        url: candidate,
        error: err?.message ? String(err.message) : String(err),
      });
    }
  }

  return {
    page: responseSummary(page),
    framePolicy: framePolicy(page.headers),
    hlsCandidates,
    matchedHlsCandidates,
    unmatchedHlsCount: hlsCandidates.length - matchedHlsCandidates.length,
    sampledHls,
    iframeCandidates,
  };
}

function classifyExternalPage(base, camera, page) {
  const playableHls = page.sampledHls.find((item) => item.probe?.segment?.ok);
  const hasMatchedHls = page.matchedHlsCandidates.length > 0;
  const hasUnmatchedHls = page.hlsCandidates.length > 0;
  const hasIframe = page.iframeCandidates.length > 0;
  const frameBlocked = page.framePolicy.blocked;

  if (!page.page.ok) {
    return {
      ...base,
      status: "external_page_unreachable",
      severity: "high",
      recommendation: "Recheck source; page did not load during audit.",
      page,
    };
  }

  if (playableHls) {
    return {
      ...base,
      status: "external_has_playable_hls",
      severity: "high",
      recommendation: "Promote to stream_url or allowlisted relay if source terms permit; do not leave only as external_page.",
      page,
    };
  }

  if (hasMatchedHls) {
    return {
      ...base,
      status: "external_has_hls_candidates",
      severity: "medium",
      recommendation: "Review HLS candidates manually; audit found playlist references but no verified segment yet.",
      page,
    };
  }

  if (hasUnmatchedHls) {
    return {
      ...base,
      status: "external_page_contains_unmatched_hls",
      severity: "low",
      recommendation:
        "Aggregate page contains HLS, but no candidate matched this camera slug. Do not promote without manual feed correlation.",
      page,
    };
  }

  if (hasIframe && !frameBlocked) {
    return {
      ...base,
      status: "external_has_embed_candidate",
      severity: "medium",
      recommendation: "Review iframe provider/terms and add html_embed allowlist if compatible.",
      page,
    };
  }

  return {
    ...base,
    status: frameBlocked ? "external_only_frame_blocked" : "external_only",
    severity: "low",
    recommendation: frameBlocked
      ? "Keep external_page unless API/feed is discovered; page blocks framing."
      : "No direct HLS/embed candidate found in first-pass HTML. Keep external_page for now.",
    page,
  };
}

function parsePlaylistUris(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function extractHlsCandidates(html, baseUrl) {
  const found = new Set();
  const patterns = [
    /https?:\/\/[^"'<>\s)]+\.m3u8[^"'<>\s)]*/gi,
    /["'](\/[^"']+\.m3u8[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1] ?? match[0];
      const cleaned = raw.replace(/^["']|["']$/g, "").replace(/\\\//g, "/");
      try {
        found.add(resolveUri(baseUrl, cleaned));
      } catch {
        // Ignore malformed URLs.
      }
    }
  }

  return Array.from(found).sort();
}

function hlsCandidateMatchesCamera(candidateUrl, camera) {
  const candidate = compact(candidateUrl);
  const tokens = cameraMatchTokens(camera);
  return tokens.some((token) => candidate.includes(token) || token.includes(candidate));
}

function cameraMatchTokens(camera) {
  const tokens = new Set();
  const values = [camera.id, camera.title, camera.fetch?.url, camera.fetch?.sourceUrl];

  for (const value of values) {
    const text = String(value ?? "");
    addToken(tokens, text);

    try {
      const url = new URL(text);
      if (url.hash) addToken(tokens, url.hash.replace(/^#/, ""));
      const lastPath = url.pathname.split("/").filter(Boolean).pop();
      if (lastPath) addToken(tokens, lastPath.replace(/\.[a-z0-9]+$/i, ""));
    } catch {
      // Not a URL; already handled as plain text.
    }
  }

  return Array.from(tokens).filter((token) => token.length >= 5);
}

function addToken(tokens, value) {
  const token = compact(value);
  if (token) tokens.add(token);

  const withoutStopWords = compact(
    String(value ?? "")
      .replace(/\b(neuquen|capital|camara|camera|municipalidad|municipal|argentina|ar)\b/gi, " ")
      .replace(/\b(del|de|la|el|las|los|rio)\b/gi, " ")
  );
  if (withoutStopWords) tokens.add(withoutStopWords);
}

function compact(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function extractIframeCandidates(html, baseUrl) {
  const found = new Set();
  const pattern = /<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      found.add(resolveUri(baseUrl, match[1]));
    } catch {
      // Ignore malformed URLs.
    }
  }

  return Array.from(found).sort();
}

function framePolicy(headers) {
  const xFrameOptions = headers["x-frame-options"] ?? null;
  const contentSecurityPolicy = headers["content-security-policy"] ?? null;
  const blocked =
    /deny|sameorigin/i.test(String(xFrameOptions ?? "")) ||
    /frame-ancestors\s+([^;]*'none'|[^;]*'self')/i.test(String(contentSecurityPolicy ?? ""));

  return { xFrameOptions, contentSecurityPolicy, blocked };
}

async function fetchText(url, timeoutMs, init = {}) {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  const body = await response.text();
  return {
    url: response.url || url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") ?? null,
    cors: response.headers.get("access-control-allow-origin") ?? null,
    headers: headerObject(response.headers),
    body,
  };
}

async function probeResource(url, timeoutMs) {
  const head = await fetchWithTimeout(url, { method: "HEAD" }, timeoutMs).catch((err) => ({ error: err }));
  if (head && !head.error) {
    return {
      url: head.url || url,
      ok: head.ok,
      status: head.status,
      contentType: head.headers.get("content-type") ?? null,
      contentLength: numberOrNull(head.headers.get("content-length")),
      cors: head.headers.get("access-control-allow-origin") ?? null,
      method: "HEAD",
    };
  }

  const response = await fetchWithTimeout(url, { headers: { Range: "bytes=0-0" } }, timeoutMs);
  const bytes = await response.arrayBuffer();
  return {
    url: response.url || url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") ?? null,
    contentLength: numberOrNull(response.headers.get("content-length")) ?? bytes.byteLength,
    cors: response.headers.get("access-control-allow-origin") ?? null,
    method: "GET",
  };
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...init,
      headers: {
        "user-agent": "BioPulseCameraAudit/1.0",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function responseSummary(response) {
  return {
    url: response.url,
    ok: response.ok,
    status: response.status,
    contentType: response.contentType,
    cors: response.cors,
  };
}

function headerObject(headers) {
  const obj = {};
  for (const [key, value] of headers.entries()) obj[key.toLowerCase()] = value;
  return obj;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function corsAllowsBrowser(value) {
  const text = String(value ?? "").trim();
  return text === "*" || /^https?:\/\//i.test(text);
}

function resolveUri(baseUrl, value) {
  return new URL(value, baseUrl).toString();
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
      process.stdout.write(".");
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  process.stdout.write("\n");
  return results;
}

function summarize(results) {
  const byStatus = {};
  const bySeverity = {};
  for (const result of results) {
    byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
    bySeverity[result.severity ?? "none"] = (bySeverity[result.severity ?? "none"] ?? 0) + 1;
  }

  return {
    total: results.length,
    byStatus,
    bySeverity,
    highPriority: results.filter((item) => item.severity === "high").length,
    relayCandidates: results.filter((item) => item.status === "hls_real_no_cors" || item.status === "external_has_playable_hls").length,
  };
}

function printSummary(report) {
  console.log(JSON.stringify(report.summary, null, 2));
}

function makeMarkdown(report) {
  const high = report.results.filter((item) => item.severity === "high");
  const medium = report.results.filter((item) => item.severity === "medium");
  const rows = [...high, ...medium].slice(0, 80);

  return `# Camera visual audit

Generated: ${report.generatedAt}
Scope: ${report.scope}

## Summary

\`\`\`json
${JSON.stringify(report.summary, null, 2)}
\`\`\`

## Priority Findings

| severity | status | camera | provider | locality | recommendation |
| --- | --- | --- | --- | --- | --- |
${rows.map((item) => `| ${escapeCell(item.severity)} | ${escapeCell(item.status)} | ${escapeCell(item.title)} | ${escapeCell(item.providerId)} | ${escapeCell(item.locality ?? item.admin1)} | ${escapeCell(item.recommendation)} |`).join("\n") || "| low | none | No priority findings |  |  |  |"}

## Rule Reminder

Before degrading a camera to \`external_page\`, check API, official embed, HLS with CORS, and HLS without CORS that can be resolved via an allowlisted relay. Neuquen Capital is the precedent: valid HLS segments needed a relay plus \`hls.js\`, not native HLS and not a plain external link.
`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

main().catch((err) => {
  console.error(err?.stack ?? err?.message ?? String(err));
  process.exit(1);
});
