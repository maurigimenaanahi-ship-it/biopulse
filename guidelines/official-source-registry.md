# Official Source Registry

BioPulse uses `public/official-source-registry.json` to track official sources that can support critical wildfire analysis, especially evacuation, road, weather and field-context signals for Neuquen/Anelo.

This file is the operating map for the next integrations. It is different from `public/official-critical-notices.json`: the source registry lists authorities and feeds; the notice registry lists verified active or draft critical notices.

## Status Model

- `connected`: BioPulse already has machine-readable access in use or ready to use.
- `planned`: the source is official and useful, but still needs endpoint/parser work.
- `manual`: the source is useful for human verification or contact, not for automatic ingestion.
- `watchlist`: the source is probably useful, but needs direct verification before operational use.
- `partial`: some access is connected, but another required path is still manual or blocked.

## Critical Notice Use

- `auto_feed`: can feed the official priority layer automatically after strict filtering.
- `candidate_feed`: can be connected next, but should not auto-promote until filters are tested.
- `manual_verification`: should appear as a verification/source option, not as an automated alert.
- `context_only`: useful for analysis, but not authority for evacuation notices.

## Current Neuquen/Anelo Priority

1. Keep SMN CAP, Ministerio de Seguridad Neuquen, Neuquen Informa RSS and Municipalidad de Anelo WordPress as `auto_feed` sources with strict filters.
2. Monitor Neuquen Informa and Municipalidad de Anelo false positives before adding more sections.
3. Keep DPV Neuquen connected as road-status context, not as evacuation authority.
4. Keep Secretaria de Emergencias y Riesgos as manual verification until an explicit public alert endpoint or authorization exists.
5. Verify Municipalidad de Anelo official social channels before adding them.
6. Keep SNMF connected as national fire context and find a stable daily-report/feed index before parsing active incidents.
7. Keep AIC connected as regional hydrometeorological context and find a stable API/feed for station readings or warnings.
8. Add APN Lanin for protected-area fire/access notices in Neuquen.
9. Expand official camera and source registries province by province.

## Promotion Rules

Before changing any source to `auto_feed`:

- It must belong to an official authority or official relaying channel.
- It must expose stable RSS/API/CAP access, or a parser we can validate.
- It must be filtered by geography and critical language.
- It must not auto-promote general news or generic weather context as evacuation.
- It must preserve the original source link in the UI.
- It must have a fallback behavior when the source is down or ambiguous.

When unsure, keep the source as `candidate_feed` or `manual_verification`.

## Validate

Run this before committing source registry changes:

```bash
npm run sources:validate
```
