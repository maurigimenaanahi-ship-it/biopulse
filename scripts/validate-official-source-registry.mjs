#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REGISTRY_PATH = path.resolve("public", "official-source-registry.json");
const EXPECTED_SCHEMA = "biopulse.official-source-registry.v1";

const ALLOWED_ACCESS_AUTOMATION = new Set([
  "connected",
  "candidate",
  "manual_verification",
  "blocked",
]);
const ALLOWED_ACCESS_TYPES = new Set([
  "api",
  "rss",
  "web",
  "social",
  "phone",
  "email",
  "pdf",
  "geo",
  "app",
]);
const ALLOWED_AUTHORITIES = new Set([
  "national",
  "provincial",
  "municipal",
  "interjurisdictional",
]);
const ALLOWED_CRITICAL_NOTICE_USE = new Set([
  "auto_feed",
  "candidate_feed",
  "manual_verification",
  "context_only",
]);
const ALLOWED_STATUSES = new Set([
  "connected",
  "planned",
  "manual",
  "watchlist",
  "partial",
]);

const REQUIRED_SOURCE_STRINGS = [
  "id",
  "name",
  "authority",
  "status",
  "criticalNoticeUse",
  "currentUse",
  "nextStep",
];
const URL_ACCESS_TYPES = new Set(["api", "rss", "web", "social", "pdf", "geo", "app"]);

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

function isValidUrl(value) {
  try {
    const url = new URL(cleanString(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function addIssue(issues, pathName, message) {
  issues.push(`${pathName}: ${message}`);
}

function validateStringArray(value, base, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, base, "must be a non-empty array");
    return;
  }

  value.forEach((item, index) => {
    if (!cleanString(item)) addIssue(issues, `${base}[${index}]`, "must be a non-empty string");
  });
}

function validateJurisdiction(jurisdiction, base, issues) {
  if (!isObject(jurisdiction)) {
    addIssue(issues, `${base}.jurisdiction`, "is required");
    return;
  }

  if (!cleanString(jurisdiction.country)) {
    addIssue(issues, `${base}.jurisdiction.country`, "is required");
  }
}

function validateAccessItem(access, base, issues) {
  if (!isObject(access)) {
    addIssue(issues, base, "must be an object");
    return;
  }

  const type = cleanString(access.type);
  const automation = cleanString(access.automation);

  if (!type) {
    addIssue(issues, `${base}.type`, "is required");
  } else if (!ALLOWED_ACCESS_TYPES.has(type)) {
    addIssue(issues, `${base}.type`, `must be one of: ${Array.from(ALLOWED_ACCESS_TYPES).join(", ")}`);
  }

  if (!automation) {
    addIssue(issues, `${base}.automation`, "is required");
  } else if (!ALLOWED_ACCESS_AUTOMATION.has(automation)) {
    addIssue(issues, `${base}.automation`, `must be one of: ${Array.from(ALLOWED_ACCESS_AUTOMATION).join(", ")}`);
  }

  if (URL_ACCESS_TYPES.has(type)) {
    if (!cleanString(access.url)) {
      addIssue(issues, `${base}.url`, "is required");
    } else if (!isValidUrl(access.url)) {
      addIssue(issues, `${base}.url`, "must be an http(s) URL");
    }
  }

  if ((type === "phone" || type === "email") && !cleanString(access.value)) {
    addIssue(issues, `${base}.value`, "is required");
  }
}

function validateAccess(access, base, issues) {
  if (!Array.isArray(access) || access.length === 0) {
    addIssue(issues, `${base}.access`, "must be a non-empty array");
    return;
  }

  access.forEach((item, index) => validateAccessItem(item, `${base}.access[${index}]`, issues));
}

function validateSource(source, index, issues, sourceIds) {
  const base = `sources[${index}]`;
  if (!isObject(source)) {
    addIssue(issues, base, "must be an object");
    return;
  }

  REQUIRED_SOURCE_STRINGS.forEach((field) => {
    if (!cleanString(source[field])) addIssue(issues, `${base}.${field}`, "is required");
  });

  const id = cleanString(source.id);
  if (id) {
    if (sourceIds.has(id)) addIssue(issues, `${base}.id`, "must be unique");
    sourceIds.add(id);
  }

  const authority = cleanString(source.authority);
  if (authority && !ALLOWED_AUTHORITIES.has(authority)) {
    addIssue(issues, `${base}.authority`, `must be one of: ${Array.from(ALLOWED_AUTHORITIES).join(", ")}`);
  }

  const status = cleanString(source.status);
  if (status && !ALLOWED_STATUSES.has(status)) {
    addIssue(issues, `${base}.status`, `must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`);
  }

  const criticalNoticeUse = cleanString(source.criticalNoticeUse);
  if (criticalNoticeUse && !ALLOWED_CRITICAL_NOTICE_USE.has(criticalNoticeUse)) {
    addIssue(
      issues,
      `${base}.criticalNoticeUse`,
      `must be one of: ${Array.from(ALLOWED_CRITICAL_NOTICE_USE).join(", ")}`,
    );
  }

  if (typeof source.canAutoPromote !== "boolean") {
    addIssue(issues, `${base}.canAutoPromote`, "must be a boolean");
  }

  validateJurisdiction(source.jurisdiction, base, issues);
  validateStringArray(source.topics, `${base}.topics`, issues);
  validateStringArray(source.provides, `${base}.provides`, issues);
  validateStringArray(source.doesNotProvide, `${base}.doesNotProvide`, issues);
  validateAccess(source.access, base, issues);

  const hasConnectedMachineAccess = Array.isArray(source.access)
    && source.access.some((access) => {
      const type = cleanString(access?.type);
      return access?.automation === "connected" && (type === "api" || type === "rss");
    });

  if (source.canAutoPromote && !hasConnectedMachineAccess) {
    addIssue(issues, `${base}.access`, "auto-promoted sources need connected api or rss access");
  }

  if (criticalNoticeUse === "auto_feed" && source.canAutoPromote !== true) {
    addIssue(issues, `${base}.canAutoPromote`, "auto_feed sources must set canAutoPromote to true");
  }

  if (status === "watchlist" && source.canAutoPromote) {
    addIssue(issues, `${base}.canAutoPromote`, "watchlist sources cannot auto-promote");
  }
}

async function main() {
  const raw = await readFile(REGISTRY_PATH, "utf8");
  const registry = JSON.parse(raw);
  const issues = [];
  const sourceIds = new Set();

  if (!isObject(registry)) {
    addIssue(issues, "registry", "must be an object");
  } else {
    if (registry.schema !== EXPECTED_SCHEMA) {
      addIssue(issues, "schema", `must be ${EXPECTED_SCHEMA}`);
    }

    if (!isValidDate(registry.updatedAt)) {
      addIssue(issues, "updatedAt", "must be a valid ISO date");
    }

    if (!isObject(registry.scope)) {
      addIssue(issues, "scope", "must be an object");
    } else {
      ["country", "province", "priorityArea"].forEach((field) => {
        if (!cleanString(registry.scope[field])) addIssue(issues, `scope.${field}`, "is required");
      });
    }

    if (!Array.isArray(registry.sources)) {
      addIssue(issues, "sources", "must be an array");
    } else {
      registry.sources.forEach((source, index) => validateSource(source, index, issues, sourceIds));
    }
  }

  if (issues.length > 0) {
    console.error("Official source registry validation failed:");
    issues.forEach((issue) => console.error(`- ${issue}`));
    process.exit(1);
  }

  const sourceCount = Array.isArray(registry.sources) ? registry.sources.length : 0;
  const connectedCount = registry.sources.filter((source) => source.status === "connected").length;
  const candidateCount = registry.sources.filter((source) => source.criticalNoticeUse === "candidate_feed").length;
  console.log(
    `Official source registry OK (${sourceCount} sources, ${connectedCount} connected, ${candidateCount} candidate feeds).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
