import type { VercelRequest, VercelResponse } from "@vercel/node";

const MEM_CACHE = new Map<string, { label: string; ts: number }>();
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

function pickLabel(data: any): string | null {
  const a = data?.address ?? {};
  const locality =
    a.city ||
    a.town ||
    a.village ||
    a.hamlet ||
    a.municipality ||
    a.county ||
    a.state_district;

  const state = a.state;
  const country = a.country;

  const parts = [locality, state, country].filter(Boolean);
  const label = parts.length ? parts.join(", ") : (data?.display_name ?? null);

  return typeof label === "string" && label.trim().length ? label.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ ok: false, error: "Invalid lat/lon" });
    return;
  }

  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const now = Date.now();

  const hit = MEM_CACHE.get(key);
  if (hit && now - hit.ts < TTL_MS) {
    res.json({ ok: true, label: hit.label, cached: true });
    return;
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lon)}&zoom=10&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "BioPulse/0.1 (reverse-geocode)",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      res.status(502).json({ ok: false, error: "Nominatim failed" });
      return;
    }

    const data = await response.json();
    const label = pickLabel(data);

    if (!label) {
      res.status(404).json({ ok: false, error: "No label" });
      return;
    }

    MEM_CACHE.set(key, { label, ts: now });
    res.json({ ok: true, label, cached: false });
  } catch {
    res.status(500).json({ ok: false, error: "Reverse geocode failed" });
  }
}
