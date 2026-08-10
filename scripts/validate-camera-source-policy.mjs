#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_REGISTRY = path.resolve("public", "cameraregistry.json");
const EXPECTED_SCHEMA = "biopulse.camera.v1";

const ALLOWED_FETCH_KINDS = new Set(["provider_api", "stream_url", "html_embed", "image_url", "external_page"]);
const ALLOWED_MEDIA_TYPES = new Set(["snapshot", "video", "stream", "embed"]);

const PROVIDER_POLICIES = new Map([
  ["windy", { licenseClass: "display-only", publishSignal: "platform-api", allowedKinds: ["provider_api"], attribution: /windy/i }],
  ["worldcam", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["provider_api", "external_page", "html_embed"], attribution: /worldcam/i }],
  ["youtube", { licenseClass: "embed-only", publishSignal: "platform-api", allowedKinds: ["html_embed"], attribution: /youtube|fuente/i }],
  ["twitch", { licenseClass: "embed-only", publishSignal: "platform-api", allowedKinds: ["html_embed"], attribution: /twitch|fuente/i }],
  ["dailymotion", { licenseClass: "embed-only", publishSignal: "platform-api", allowedKinds: ["html_embed"], attribution: /dailymotion|fuente/i }],
  ["skyline", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["external_page"], attribution: /skyline/i }],
  ["estadodelmar", { licenseClass: "external-only", publishSignal: "operator-page", allowedKinds: ["external_page"], attribution: /estado del mar/i }],
  ["webcamtaxi", { licenseClass: "embed-only", publishSignal: "operator-page", allowedKinds: ["html_embed", "external_page"], attribution: /webcamtaxi|youtube/i }],
  ["neuquen-capital", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url", "html_embed", "external_page"], attribution: /neuquen/i }],
  ["neuquen-fauna", { licenseClass: "display-only", publishSignal: "gov-open-data", allowedKinds: ["stream_url"], attribution: /neuquen|fauna|caza/i }],
  ["agvp-santa-cruz", { licenseClass: "display-only", publishSignal: "gov-open-data", allowedKinds: ["provider_api"], attribution: /agvp|santa cruz/i }],
  ["agp", { licenseClass: "display-only", publishSignal: "gov-open-data", allowedKinds: ["stream_url"], attribution: /agp|argentina/i }],
  ["gesell", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url"], attribution: /gesell/i }],
  ["telpin", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url"], attribution: /telpin/i }],
  ["infopico", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url"], attribution: /infopico/i }],
  ["fenix951", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url"], attribution: /fenix|fénix/i }],
  ["canal7-santiago", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url"], attribution: /canal 7|diario panorama|santiago/i }],
  ["canal7salta", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url"], attribution: /canal 7|salta/i }],
  ["canal13jujuy", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["stream_url"], attribution: /canal 13|jujuy|genex/i }],
  ["chapelco", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["provider_api"], attribution: /chapelco|varitech/i }],
  ["catedral", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["image_url", "html_embed"], attribution: /catedral|varitech/i }],
  ["cerrobayo", { licenseClass: "embed-only", publishSignal: "operator-page", allowedKinds: ["html_embed", "external_page"], attribution: /cerro bayo/i }],
  ["lahoya", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["image_url"], attribution: /hoya|varitech/i }],
  ["varitech", { licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: ["image_url"], attribution: /varitech/i }],
]);

const EMBED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "player.twitch.tv",
  "www.dailymotion.com",
  "geo.dailymotion.com",
  "ipcamlive.com",
  "www.ipcamlive.com",
  "streamable.com",
]);

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth",
  "authorization",
  "client_secret",
  "key",
  "password",
  "secret",
  "token",
]);

function parseArgs(argv) {
  const args = {
    registry: DEFAULT_REGISTRY,
    strict: false,
  };

  for (const raw of argv) {
    if (raw === "--strict") {
      args.strict = true;
      continue;
    }

    const [flag, value = ""] = raw.split("=", 2);
    if (flag === "--registry") args.registry = path.resolve(value);
    else if (flag === "--help" || flag === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${raw}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Validate camera source policy guardrails.

Usage:
  npm run cameras:policy
  npm run cameras:policy -- --strict

Options:
  --registry=PATH  Camera registry path. Default: public/cameraregistry.json
  --strict         Treat warnings as failures.
`);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function providerId(camera) {
  const fetchProvider = cleanString(camera.fetch?.provider);
  const registryProvider = cleanString(camera.providerId);
  return normalize(fetchProvider || registryProvider || "unknown");
}

function inferPolicy(camera) {
  const provider = providerId(camera);
  const known = PROVIDER_POLICIES.get(provider);
  if (known) return { provider, ...known, known: true };

  const kind = cleanString(camera.fetch?.kind);
  if (kind === "provider_api") return { provider, licenseClass: "display-only", publishSignal: "platform-api", allowedKinds: [kind], known: false };
  if (kind === "html_embed") return { provider, licenseClass: "embed-only", publishSignal: "operator-page", allowedKinds: [kind], known: false };
  if (kind === "external_page") return { provider, licenseClass: "external-only", publishSignal: "operator-page", allowedKinds: [kind], known: false };
  return { provider, licenseClass: "display-only", publishSignal: "operator-page", allowedKinds: [kind], known: false };
}

function addIssue(list, severity, camera, pathName, message) {
  list.push({
    severity,
    id: cleanString(camera?.id) || "unknown",
    provider: camera ? providerId(camera) : "unknown",
    path: pathName,
    message,
  });
}

function candidateUrls(camera) {
  const fetchInfo = camera.fetch ?? {};
  return [
    ["fetch.url", fetchInfo.url],
    ["fetch.sourceUrl", fetchInfo.sourceUrl],
    ["usage.termsUrl", camera.usage?.termsUrl],
  ].filter(([, value]) => cleanString(value));
}

function validateHttpUrl(rawUrl, camera, pathName, issues) {
  const text = cleanString(rawUrl);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      addIssue(issues, "error", camera, pathName, "must be an http(s) URL");
      return null;
    }

    if (url.username || url.password) {
      addIssue(issues, "error", camera, pathName, "must not include credentials in the URL");
    }

    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        addIssue(issues, "error", camera, pathName, `must not include sensitive query parameter "${key}"`);
      }
    }

    return url;
  } catch {
    addIssue(issues, "error", camera, pathName, "must be a valid URL");
    return null;
  }
}

function validateFetchShape(camera, index, issues) {
  const base = `cameras[${index}]`;
  const fetchInfo = camera.fetch;
  const kind = cleanString(fetchInfo?.kind);

  if (!kind) {
    addIssue(issues, "error", camera, `${base}.fetch.kind`, "is required");
    return;
  }

  if (!ALLOWED_FETCH_KINDS.has(kind)) {
    addIssue(issues, "warning", camera, `${base}.fetch.kind`, `unknown fetch kind "${kind}"`);
  }

  if (kind === "provider_api") {
    if (!cleanString(fetchInfo.provider)) addIssue(issues, "error", camera, `${base}.fetch.provider`, "is required for provider_api");
    if (!cleanString(fetchInfo.cameraKey)) addIssue(issues, "error", camera, `${base}.fetch.cameraKey`, "is required for provider_api");
  } else if (!cleanString(fetchInfo.url)) {
    addIssue(issues, "error", camera, `${base}.fetch.url`, `is required for ${kind}`);
  }

  candidateUrls(camera).forEach(([pathName, value]) => validateHttpUrl(value, camera, `${base}.${pathName}`, issues));
}

function validatePolicy(camera, index, issues, stats) {
  const base = `cameras[${index}]`;
  const policy = inferPolicy(camera);
  stats.providers.set(policy.provider, (stats.providers.get(policy.provider) ?? 0) + 1);
  stats.licenseClasses.set(policy.licenseClass, (stats.licenseClasses.get(policy.licenseClass) ?? 0) + 1);
  stats.publishSignals.set(policy.publishSignal, (stats.publishSignals.get(policy.publishSignal) ?? 0) + 1);

  const kind = cleanString(camera.fetch?.kind);
  if (policy.allowedKinds.length > 0 && !policy.allowedKinds.includes(kind)) {
    addIssue(
      issues,
      "warning",
      camera,
      `${base}.fetch.kind`,
      `${policy.provider} is classified as ${policy.licenseClass}/${policy.publishSignal}; expected kind: ${policy.allowedKinds.join(", ")}`,
    );
  }

  if (!policy.known) {
    addIssue(issues, "warning", camera, `${base}.provider`, "provider has no explicit source policy yet");
  }

  if (camera.usage?.isPublic !== true) {
    addIssue(issues, "error", camera, `${base}.usage.isPublic`, "must be true for camera registry entries");
  }

  if (!cleanString(camera.usage?.attributionText)) {
    addIssue(issues, "warning", camera, `${base}.usage.attributionText`, "is missing");
  } else if (policy.attribution && !policy.attribution.test(camera.usage.attributionText)) {
    addIssue(issues, "warning", camera, `${base}.usage.attributionText`, "does not match the expected provider attribution");
  }

  if (!cleanString(camera.usage?.termsUrl)) {
    addIssue(issues, "warning", camera, `${base}.usage.termsUrl`, "is missing; verify terms before promoting this source");
  }

  if (kind === "html_embed") {
    const url = validateHttpUrl(camera.fetch?.url, camera, `${base}.fetch.url`, issues);
    if (url && !EMBED_HOSTS.has(url.hostname.toLowerCase()) && !policy.known) {
      addIssue(issues, "warning", camera, `${base}.fetch.url`, "embed host is not in the known platform allowlist");
    }
  }

  if (kind === "stream_url") {
    const url = validateHttpUrl(camera.fetch?.url, camera, `${base}.fetch.url`, issues);
    if (url && url.protocol !== "https:") {
      addIssue(issues, "warning", camera, `${base}.fetch.url`, "stream is not HTTPS");
    }
    if (normalize(camera.fetch?.protocol) === "hls" && !cleanString(camera.fetch?.sourceUrl)) {
      addIssue(issues, "warning", camera, `${base}.fetch.sourceUrl`, "HLS stream should keep the original source page URL");
    }
  }
}

function validateCamera(camera, index, issues, ids, stats) {
  const base = `cameras[${index}]`;
  if (!isObject(camera)) {
    addIssue(issues, "error", { id: `index-${index}` }, base, "must be an object");
    return;
  }

  if (camera.schema !== EXPECTED_SCHEMA) {
    addIssue(issues, "error", camera, `${base}.schema`, `must be ${EXPECTED_SCHEMA}`);
  }

  const id = cleanString(camera.id);
  if (!id) addIssue(issues, "error", camera, `${base}.id`, "is required");
  else if (ids.has(id)) addIssue(issues, "error", camera, `${base}.id`, "must be unique");
  ids.add(id);

  if (!ALLOWED_MEDIA_TYPES.has(cleanString(camera.mediaType))) {
    addIssue(issues, "warning", camera, `${base}.mediaType`, "is missing or not a known media type");
  }

  if (!Number.isFinite(Number(camera.geo?.lat)) || !Number.isFinite(Number(camera.geo?.lon))) {
    addIssue(issues, "error", camera, `${base}.geo`, "must include finite lat/lon");
  }

  validateFetchShape(camera, index, issues);
  validatePolicy(camera, index, issues, stats);
}

function topEntries(map, limit = 12) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = JSON.parse(await readFile(args.registry, "utf8"));
  const issues = [];
  const ids = new Set();
  const stats = {
    providers: new Map(),
    licenseClasses: new Map(),
    publishSignals: new Map(),
  };

  if (!Array.isArray(registry)) {
    console.error("Camera source policy validation failed: registry must be an array.");
    process.exit(1);
  }

  registry.forEach((camera, index) => validateCamera(camera, index, issues, ids, stats));

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  console.log(`Camera source policy OK scan (${registry.length} cameras).`);
  console.log(`Providers: ${JSON.stringify(topEntries(stats.providers))}`);
  console.log(`License classes: ${JSON.stringify(topEntries(stats.licenseClasses))}`);
  console.log(`Publish signals: ${JSON.stringify(topEntries(stats.publishSignals))}`);
  console.log(`Errors: ${errors.length}; warnings: ${warnings.length}.`);

  const show = [...errors, ...warnings].slice(0, 50);
  if (show.length > 0) {
    console.log("");
    console.log("First issues:");
    show.forEach((issue) => {
      console.log(`- [${issue.severity}] ${issue.id} (${issue.provider}) ${issue.path}: ${issue.message}`);
    });
    if (issues.length > show.length) {
      console.log(`... ${issues.length - show.length} more issue(s).`);
    }
  }

  if (errors.length > 0 || (args.strict && warnings.length > 0)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
