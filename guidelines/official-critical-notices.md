# Official Critical Notices

BioPulse uses `public/official-critical-notices.json` for official critical notices that do not have a stable API/feed yet.

This registry is only for official, verified, time-sensitive notices. Do not add general news, rumors, screenshots without an official link, or entries without coordinates.

## Validate

Run this before committing or deploying:

```bash
npm run notices:validate
```

The validator rejects:

- missing official source link
- missing latitude/longitude
- invalid dates
- duplicated notice ids
- active notices with expired `expiresAt`
- entries without explicit validity window
- entries without `verification.status: "verified"`

## Load Template

Copy one object into `notices`, then replace every placeholder. Keep `status: "draft"` until the source link, coordinates, and validity window are checked.

```json
{
  "id": "neuquen-anelo-evacuation-YYYYMMDD-HHMM",
  "kind": "official_evacuation",
  "status": "draft",
  "provider": "Nombre del organismo oficial",
  "source": "Municipio / Defensa Civil / Provincia",
  "title": "Comunicado oficial de evacuacion",
  "detail": "Resumen corto y factual del comunicado oficial.",
  "country": "AR",
  "lat": -38.354,
  "lon": -68.789,
  "observedAt": "2026-07-20T18:00:00.000Z",
  "expiresAt": "2099-01-01T00:00:00.000Z",
  "reportUrl": "https://example.gob.ar/comunicado-oficial",
  "detailsUrl": "https://example.gob.ar/comunicado-oficial",
  "areaDesc": "Anelo, Neuquen",
  "alertLevel": "Official evacuation",
  "urgency": "Immediate",
  "certainty": "Observed",
  "verification": {
    "status": "verified",
    "verifiedAt": "2026-07-20T18:10:00.000Z",
    "verifiedBy": "BioPulse operator",
    "notes": "Link belongs to the official issuing authority."
  }
}
```

## Activation Checklist

Before changing `status` from `draft` to `active`:

- The link opens a public official source.
- The source is the authority issuing or relaying the order.
- The notice explicitly mentions evacuation, evacuation center, evacuees, or an evacuation order.
- The coordinates point to the affected area, not to a newsroom or generic province center.
- `observedAt` is when BioPulse observed/verified the notice.
- `expiresAt` is the expected end of validity. Use a conservative short window when the official source does not state one.
- `updatedAt` at the root of the registry is updated.

If any point is uncertain, keep it as `draft` and do not publish it as an active evacuation priority.
