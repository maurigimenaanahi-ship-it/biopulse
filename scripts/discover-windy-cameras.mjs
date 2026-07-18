#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const OPEN_CCTV_BASE = "https://opencctv.org/es/cameras/argentina";

const ROOT_PRESETS = {
  argentina: OPEN_CCTV_BASE,
  "buenos-aires": `${OPEN_CCTV_BASE}/buenos-aires`,
  cordoba: `${OPEN_CCTV_BASE}/cordoba`,
  "rio-negro": `${OPEN_CCTV_BASE}/rio-negro`,
  "rio-negro-province": `${OPEN_CCTV_BASE}/rio-negro-province`,
  neuquen: `${OPEN_CCTV_BASE}/neuquen`,
  "neuquen-province": `${OPEN_CCTV_BASE}/neuquen-province`,
  chubut: `${OPEN_CCTV_BASE}/chubut`,
  mendoza: `${OPEN_CCTV_BASE}/mendoza`,
  "tierra-del-fuego": `${OPEN_CCTV_BASE}/tierra-del-fuego`,
  "santa-fe": `${OPEN_CCTV_BASE}/santa-fe`,
  "santiago-del-estero": `${OPEN_CCTV_BASE}/santiago-del-estero`,
  "distrito-federal": `${OPEN_CCTV_BASE}/distrito-federal`,
  "autonomous-city-of-buenos-aires": `${OPEN_CCTV_BASE}/autonomous-city-of-buenos-aires`,
};

const DEFAULT_ROOTS = Object.keys(ROOT_PRESETS);
const DEFAULT_OUT = ".camera-reports/windy-candidates.json";

function parseArgs(argv) {
  const args = {
    pages: 8,
    minBytes: 2500,
    concurrency: 5,
    limit: 0,
    roots: DEFAULT_ROOTS,
    registry: "public/cameraregistry.json",
    out: DEFAULT_OUT,
    includeExisting: false,
    noWrite: false,
  };

  for (const raw of argv) {
    if (raw === "--include-existing") {
      args.includeExisting = true;
      continue;
    }
    if (raw === "--no-write") {
      args.noWrite = true;
      continue;
    }

    const [flag, value = ""] = raw.split("=", 2);
    if (flag === "--pages") args.pages = positiveInt(value, "pages");
    else if (flag === "--min-bytes") args.minBytes = positiveInt(value, "min-bytes");
    else if (flag === "--concurrency") args.concurrency = positiveInt(value, "concurrency");
    else if (flag === "--limit") args.limit = positiveInt(value, "limit");
    else if (flag === "--registry") args.registry = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--roots") args.roots = value.split(",").map((item) => item.trim()).filter(Boolean);
    else if (flag === "--help" || flag === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${raw}`);
    }
  }

  return args;
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return parsed;
}

function printHelp() {
  console.log(`
Discover Windy camera candidates from OpenCCTV Argentina.

Usage:
  npm run cameras:discover
  npm run cameras:discover -- --pages=12 --roots=argentina,buenos-aires,cordoba

Options:
  --pages=N              Pages per root to scan. Default: 8
  --roots=a,b,c          Preset names or full URLs. Default: all Argentina presets
  --min-bytes=N          Minimum preview bytes to count as usable. Default: 2500
  --concurrency=N        Parallel detail/preview checks. Default: 5
  --limit=N              Stop after N candidate detail pages. Default: 0, no limit
  --registry=PATH        Camera registry path. Default: public/cameraregistry.json
  --out=PATH             JSON report path. Default: .camera-reports/windy-candidates.json
  --include-existing     Include cameraKeys already present in the registry
  --no-write             Print summary only, do not write report
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await loadRegistry(args.registry);
  const roots = args.roots.map(resolveRoot);

  console.log(`Scanning ${roots.length} root(s), ${args.pages} page(s) each...`);
  const pageLinks = await collectLinks(roots, args.pages);
  const links = args.limit > 0 ? pageLinks.slice(0, args.limit) : pageLinks;
  console.log(`Found ${pageLinks.length} unique detail link(s); checking ${links.length}.`);

  const checked = await mapConcurrent(links, args.concurrency, (sourceUrl) =>
    inspectDetailPage(sourceUrl, registry, args)
  );

  const candidates = checked
    .filter(Boolean)
    .sort((a, b) => {
      if (a.existing !== b.existing) return a.existing ? 1 : -1;
      if (b.previewBytes !== a.previewBytes) return b.previewBytes - a.previewBytes;
      return String(a.title ?? "").localeCompare(String(b.title ?? ""));
    });

  const ready = candidates.filter((item) => item.ready && !item.existing);
  const existing = candidates.filter((item) => item.existing);
  const rejected = checked.filter((item) => item && !item.ready && !item.existing);

  const report = {
    generatedAt: new Date().toISOString(),
    source: "OpenCCTV Argentina index, Windy previews",
    options: {
      pages: args.pages,
      roots: roots,
      minBytes: args.minBytes,
      includeExisting: args.includeExisting,
    },
    summary: {
      detailLinks: links.length,
      readyNew: ready.length,
      existing: existing.length,
      rejected: rejected.length,
    },
    ready,
    existing,
    rejected,
  };

  printSummary(report);

  if (!args.noWrite) {
    await mkdir(path.dirname(args.out), { recursive: true });
    await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Report written to ${args.out}`);
  }
}

async function loadRegistry(filePath) {
  const raw = await readFile(filePath, "utf8");
  const items = JSON.parse(raw);
  const cameraKeys = new Map();
  const ids = new Set();

  for (const item of items) {
    ids.add(item.id);
    const fetchInfo = item.fetch ?? {};
    if (fetchInfo.kind === "provider_api" && fetchInfo.provider === "windy" && fetchInfo.cameraKey) {
      cameraKeys.set(String(fetchInfo.cameraKey), item.id);
    }
  }

  return { items, ids, cameraKeys };
}

function resolveRoot(root) {
  if (/^https?:\/\//i.test(root)) return root.replace(/\/$/, "");
  const resolved = ROOT_PRESETS[root];
  if (!resolved) {
    throw new Error(`Unknown root preset "${root}". Use --help for presets or pass a full URL.`);
  }
  return resolved;
}

async function collectLinks(roots, pages) {
  const links = new Set();

  for (const root of roots) {
    for (let page = 1; page <= pages; page += 1) {
      const url = page === 1 ? root : `${root}?page=${page}`;
      try {
        const html = await fetchText(url, 18_000);
        for (const link of extractCameraLinks(html)) {
          links.add(link);
        }
      } catch (err) {
        console.warn(`WARN index fetch failed: ${url} :: ${err.message}`);
      }
    }
  }

  return Array.from(links).sort();
}

function extractCameraLinks(html) {
  const links = [];
  const pattern = /href="([^"]+)"/g;
  let match;

  while ((match = pattern.exec(html))) {
    const href = match[1];
    if (!href.startsWith("/es/cameras/argentina/")) continue;
    if (href.includes("/category")) continue;
    if (href.split("/").length <= 5) continue;
    links.push(`https://opencctv.org${href}`);
  }

  return links;
}

async function inspectDetailPage(sourceUrl, registry, args) {
  try {
    const html = await fetchText(sourceUrl, 10_000);
    const cameraKey = extractWindyCameraKey(html);
    if (!cameraKey) return null;

    const existingId = registry.cameraKeys.get(cameraKey) ?? null;
    if (existingId && !args.includeExisting) {
      return {
        ready: true,
        existing: true,
        existingId,
        cameraKey,
        sourceUrl,
      };
    }

    const meta = extractLdJson(html);
    const title = String(meta?.name ?? `Windy ${cameraKey}`).trim();
    const geo = meta?.contentLocation?.geo ?? {};
    const lat = Number(geo.latitude);
    const lon = Number(geo.longitude);
    const location = String(meta?.contentLocation?.name ?? "").trim();
    const previewUrl = `https://imgproxy.windy.com/_/preview/plain/current/${cameraKey}/original.jpg`;
    const preview = await inspectPreview(previewUrl, args.minBytes);

    return {
      ready: preview.ready,
      existing: Boolean(existingId),
      existingId,
      cameraKey,
      title,
      location,
      geo: {
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
      },
      sourceUrl,
      previewUrl,
      previewContentType: preview.contentType,
      previewBytes: preview.bytes,
      reason: preview.reason,
      proposedId: makeProposedId(title, cameraKey),
      registrySnippet: makeRegistrySnippet({
        title,
        cameraKey,
        lat,
        lon,
        location,
        sourceUrl,
      }),
    };
  } catch (err) {
    return {
      ready: false,
      existing: false,
      sourceUrl,
      reason: `detail_error:${err.message}`,
    };
  }
}

function extractWindyCameraKey(html) {
  const direct = html.match(/data-camera-id="windy-(\d+)"/);
  if (direct) return direct[1];

  const preview = html.match(/current\/(\d+)\/original\.jpg/);
  if (preview) return preview[1];

  return null;
}

function extractLdJson(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function inspectPreview(url, minBytes) {
  try {
    const res = await fetchWithTimeout(url, {}, 12_000);
    const contentType = res.headers.get("content-type") ?? "";
    const bytes = Buffer.byteLength(Buffer.from(await res.arrayBuffer()));

    if (!res.ok) {
      return { ready: false, contentType, bytes, reason: `preview_status:${res.status}` };
    }
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { ready: false, contentType, bytes, reason: `preview_type:${contentType || "unknown"}` };
    }
    if (bytes < minBytes) {
      return { ready: false, contentType, bytes, reason: `preview_too_small:${bytes}` };
    }

    return { ready: true, contentType, bytes, reason: "ready" };
  } catch (err) {
    return { ready: false, contentType: "", bytes: 0, reason: `preview_error:${err.message}` };
  }
}

function makeProposedId(title, cameraKey) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `ar-windy-${slug || "camera"}-${cameraKey}`;
}

function makeRegistrySnippet({ title, cameraKey, lat, lon, location }) {
  const coverage = inferCoverage(location);
  const tags = inferTags(title, location);
  return {
    schema: "biopulse.camera.v1",
    id: makeProposedId(title, cameraKey),
    providerId: "windy",
    title: `${normalizeDisplayTitle(title)} (Windy)`,
    description: "Camara publica registrada como observacion independiente mediante Windy Webcams API.",
    geo: {
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    },
    coverage,
    mediaType: "snapshot",
    fetch: {
      kind: "provider_api",
      provider: "windy",
      cameraKey,
      endpoint: "/api/windy-camera",
    },
    update: { expectedIntervalSec: 300 },
    usage: {
      isPublic: true,
      attributionText: "Fuente: Windy Webcams",
      termsUrl: "https://api.windy.com/webcams/terms",
    },
    tags,
    priority: tags.includes("traffic") || tags.includes("mountain") ? 2 : 1,
    validation: {
      status: "verified",
      verifiedBy: "Codex via OpenCCTV metadata and Windy preview check",
      verifiedAt: new Date().toISOString().slice(0, 10),
    },
  };
}

function normalizeDisplayTitle(title) {
  return title
    .replace(/\s*[›:]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCoverage(location) {
  const parts = location.split(",").map((item) => item.trim()).filter(Boolean);
  const country = parts.at(-1) ?? "Argentina";
  const admin1 = parts.length >= 2 ? normalizeAdmin(parts.at(-2)) : undefined;
  const locality = parts.length >= 3 ? parts[0] : parts.length === 2 ? parts[0] : undefined;

  return {
    countryISO2: country.toLowerCase().includes("argentina") ? "AR" : country,
    ...(admin1 ? { admin1 } : {}),
    ...(locality ? { locality } : {}),
  };
}

function normalizeAdmin(value = "") {
  return value
    .replace("Neuquen Province", "Neuquen")
    .replace("Córdoba", "Cordoba")
    .replace("Buenos Aires Province", "Buenos Aires")
    .replace("Autonomous City of Buenos Aires", "CABA");
}

function inferTags(title, location) {
  const text = `${title} ${location}`.toLowerCase();
  const tags = new Set(["weather", "snapshot"]);
  if (/cordoba|terminal|avenida|boulevard|puente|calle|traffic|transito/.test(text)) {
    tags.add("city");
    tags.add("traffic");
  }
  if (/playa|beach|mar|costa|rio|plata|chiringo|hermoso|teresita|ajo|clara/.test(text)) {
    tags.add("coast");
  }
  if (/ski|cerro|volcan|cumbre|montana|mountain|lenas|angostura|domuyo|tromen/.test(text)) {
    tags.add("mountain");
  }
  if (/ruta|road|carmencita/.test(text)) {
    tags.add("road");
    tags.add("vegetation");
  }
  return Array.from(tags);
}

async function fetchText(url, timeoutMs) {
  const res = await fetchWithTimeout(url, { headers: { accept: "text/html" } }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function mapConcurrent(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
      if ((index + 1) % 25 === 0) {
        console.log(`Checked ${index + 1}/${items.length}...`);
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return output;
}

function printSummary(report) {
  const { summary } = report;
  console.log("");
  console.log(`Ready new: ${summary.readyNew}`);
  console.log(`Existing: ${summary.existing}`);
  console.log(`Rejected: ${summary.rejected}`);

  for (const item of report.ready.slice(0, 20)) {
    console.log(`+ ${item.cameraKey} | ${item.title} | ${item.previewBytes} bytes | ${item.sourceUrl}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
