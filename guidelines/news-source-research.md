# BioPulse news source research

Fecha de corte: 2026-07-07.

## Decision MVP

La seccion Noticias queda como una capa de contexto informativo, no como confirmacion oficial del evento.

BioPulse consulta el News Worker actual, basado en GDELT, y aplica una busqueda escalonada:

1. Local: lugar resuelto del evento y terminos cercanos.
2. Regional: provincia, estado o region cuando la busqueda local no deja resultados utiles.
3. Nacional: pais como respaldo final.

Cada intento mantiene filtro de relevancia por lugar, peligro y senales oficiales/emergencia. Si un resultado no supera ese filtro, se descarta antes de entrar al ledger de observaciones.

## Fuentes aplicadas

- GDELT DOC API / News Worker: fuente de noticias globales y translinguales. GDELT permite listar articulos con consultas booleanas, rangos temporales y salida JSON/RSS; BioPulse lo usa como recuperacion informativa, no como fuente oficial.
  Fuente: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/

- Servicio Meteorologico Nacional via Alert-Hub: fuente oficial conectada para alertas meteorologicas. BioPulse la mantiene separada de Noticias porque una alerta CAP estructurada tiene distinta autoridad que una nota periodistica.
  Fuente: https://www.alert-hub.org/fah

## Fuentes futuras

- Feeds RSS o paginas oficiales de Defensa Civil, Bomberos, municipios, provincias y Parques Nacionales.
- Comunicados oficiales con CAP, RSS, Atom, JSON o APIs estables.
- Archivos periodisticos historicos por region para antecedentes, siempre marcados como contexto historico y no como causalidad del evento actual.

## Regla de implementacion

- `official_alert`: fuente oficial estructurada, con procedencia, vigencia y area.
- `official_reference`: noticia o comunicado detectado como posible fuente oficial, pero sin estructura CAP/API.
- `news_report`: cobertura periodistica regional o nacional relacionada.
- Las noticias nunca deben mezclarse con satelite, camaras o clima como si fueran evidencia directa.
