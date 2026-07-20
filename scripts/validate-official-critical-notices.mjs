#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REGISTRY_PATH = path.resolve("public", "official-critical-notices.json");
const EXPECTED_SCHEMA = "biopulse.official-critical-notices.v1";
const ALLOWED_KINDS = new Set(["official_evacuation"]);
const ALLOWED_STATUSES = new Set(["active", "draft", "archived"]);
const REQUIRED_NOTICE_STRINGS = [
  "id",
  "kind",
  "status",
  "provider",
  "source",
  "title",
  "detail",
  "country",
  "observedAt",
  "expiresAt",
  "reportUrl",
  "areaDesc",
  "alertLevel",
  "urgency",
  "certainty",
];

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDate(value) {
  const text = cleanString(value);
  if (!text) return false;
  const date = new Date(text);
  return Number.isFinite(date.getTime());
}

function asDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isValidUrl(value) {
  try {
    const url = new URL(cleanString(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function addIssue(issues, pathName, message) {
  issues.push(`${pathName}: ${message}`);
}

function validateSource(source, index, issues) {
  const base = `sources[${index}]`;
  if (!isObject(source)) {
    addIssue(issues, base, "must be an object");
    return;
  }

  ["id", "name", "url", "scope"].forEach((field) => {
    if (!cleanString(source[field])) addIssue(issues, `${base}.${field}`, "is required");
  });

  if (cleanString(source.url) && !isValidUrl(source.url)) {
    addIssue(issues, `${base}.url`, "must be an http(s) URL");
  }
}

function validateVerification(verification, base, issues) {
  if (!isObject(verification)) {
    addIssue(issues, `${base}.verification`, "is required");
    return;
  }

  if (cleanString(verification.status) !== "verified") {
    addIssue(issues, `${base}.verification.status`, 'must be "verified"');
  }

  if (!cleanString(verification.verifiedBy)) {
    addIssue(issues, `${base}.verification.verifiedBy`, "is required");
  }

  if (!isValidDate(verification.verifiedAt)) {
    addIssue(issues, `${base}.verification.verifiedAt`, "must be a valid ISO date");
  }
}

function validateNotice(notice, index, issues, now) {
  const base = `notices[${index}]`;
  if (!isObject(notice)) {
    addIssue(issues, base, "must be an object");
    return;
  }

  REQUIRED_NOTICE_STRINGS.forEach((field) => {
    if (!cleanString(notice[field])) addIssue(issues, `${base}.${field}`, "is required");
  });

  if (cleanString(notice.kind) && !ALLOWED_KINDS.has(notice.kind)) {
    addIssue(issues, `${base}.kind`, `must be one of: ${Array.from(ALLOWED_KINDS).join(", ")}`);
  }

  if (cleanString(notice.status) && !ALLOWED_STATUSES.has(notice.status)) {
    addIssue(issues, `${base}.status`, `must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`);
  }

  if (!isFiniteNumber(notice.lat) || notice.lat < -90 || notice.lat > 90) {
    addIssue(issues, `${base}.lat`, "must be a number between -90 and 90");
  }

  if (!isFiniteNumber(notice.lon) || notice.lon < -180 || notice.lon > 180) {
    addIssue(issues, `${base}.lon`, "must be a number between -180 and 180");
  }

  if (cleanString(notice.observedAt) && !isValidDate(notice.observedAt)) {
    addIssue(issues, `${base}.observedAt`, "must be a valid ISO date");
  }

  if (cleanString(notice.expiresAt) && !isValidDate(notice.expiresAt)) {
    addIssue(issues, `${base}.expiresAt`, "must be a valid ISO date");
  }

  const expiresAt = asDate(notice.expiresAt);
  if (notice.status === "active" && expiresAt && expiresAt.getTime() <= now.getTime()) {
    addIssue(issues, `${base}.expiresAt`, "active notices must not be expired");
  }

  if (cleanString(notice.reportUrl) && !isValidUrl(notice.reportUrl)) {
    addIssue(issues, `${base}.reportUrl`, "must be an http(s) URL");
  }

  if (cleanString(notice.detailsUrl) && !isValidUrl(notice.detailsUrl)) {
    addIssue(issues, `${base}.detailsUrl`, "must be an http(s) URL");
  }

  validateVerification(notice.verification, base, issues);
}

async function main() {
  const raw = await readFile(REGISTRY_PATH, "utf8");
  const registry = JSON.parse(raw);
  const issues = [];
  const noticeIds = new Set();
  const now = process.env.BIOPULSE_NOTICE_NOW ? new Date(process.env.BIOPULSE_NOTICE_NOW) : new Date();

  if (!Number.isFinite(now.getTime())) {
    throw new Error("BIOPULSE_NOTICE_NOW must be a valid ISO date when provided.");
  }

  if (!isObject(registry)) {
    addIssue(issues, "registry", "must be an object");
  } else {
    if (registry.schema !== EXPECTED_SCHEMA) {
      addIssue(issues, "schema", `must be ${EXPECTED_SCHEMA}`);
    }

    if (!isValidDate(registry.updatedAt)) {
      addIssue(issues, "updatedAt", "must be a valid ISO date");
    }

    if (!Array.isArray(registry.sources)) {
      addIssue(issues, "sources", "must be an array");
    } else {
      registry.sources.forEach((source, index) => validateSource(source, index, issues));
    }

    if (!Array.isArray(registry.notices)) {
      addIssue(issues, "notices", "must be an array");
    } else {
      registry.notices.forEach((notice, index) => {
        const id = cleanString(notice?.id);
        if (id) {
          if (noticeIds.has(id)) addIssue(issues, `notices[${index}].id`, "must be unique");
          noticeIds.add(id);
        }
        validateNotice(notice, index, issues, now);
      });
    }
  }

  if (issues.length > 0) {
    console.error("Official critical notice registry validation failed:");
    issues.forEach((issue) => console.error(`- ${issue}`));
    process.exit(1);
  }

  const noticeCount = Array.isArray(registry.notices) ? registry.notices.length : 0;
  console.log(`Official critical notice registry OK (${noticeCount} notice${noticeCount === 1 ? "" : "s"}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
