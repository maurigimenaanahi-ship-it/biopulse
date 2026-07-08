# BioPulse camera source research

Fecha de corte: 2026-07-07.

## Decision MVP

La seccion Camaras usa dos capas:

1. Registro curado en `public/cameraregistry.json`.
2. Descubrimiento dinamico de Windy alrededor del evento mediante `/api/windy-search`.

BioPulse no descarga, captura, rehostea ni reproduce frames de plataformas externas salvo que exista una API o URL de imagen permitida. Si una plataforma publica camaras pero no autoriza reutilizacion de frames, se registra como `external_page` y se abre la fuente original.

## Fuentes aplicadas

- Windy Webcams API: integrada como `provider_api`. La API requiere `x-windy-api-key` y sus URLs de imagen expiran, por eso BioPulse refresca snapshots mediante `/api/windy-camera` y descubre camaras cercanas mediante `/api/windy-search`.
  Fuente: https://api.windy.com/webcams/docs

- SkylineWebcams Argentina: aplicada como `external_page`. Sus terminos permiten ver y compartir mediante enlaces, pero restringen copiar, descargar o reproducir frames. Por eso BioPulse solo abre la pagina original.
  Fuentes: https://www.skylinewebcams.com/en/webcam/argentina.html y https://www.skylinewebcams.com/en/terms-of-use.html

- Webcamtaxi Argentina: aplicada como `external_page` para paginas que agregan cobertura nueva o una fuente alternativa de una escena ya registrada. BioPulse solo abre la fuente original; no copia frames, no descarga imagenes y no rehostea video.
  Fuentes: https://www.webcamtaxi.com/en/argentina.html y https://www.webcamtaxi.com/en/terms.html

## Fuentes alternativas

Cuando dos proveedores muestran la misma escena o un punto visual equivalente, BioPulse conserva ambas fuentes pero comparte un `groupKey`. La interfaz muestra una tarjeta principal y enlaces alternativos, para aumentar cobertura sin duplicar falsamente la cantidad de camaras cercanas.

## Fuentes revisadas, no aplicadas aun

- ALERTCalifornia / ALERTWildfire / HPWREN: modelo muy relevante para incendios y camaras PTZ, pero centrado en California/EE.UU. No cubre Argentina para el MVP actual. Puede inspirar una futura capa de redes oficiales de incendio.
  Fuentes: https://alertcalifornia.org/ , https://www.alertwildfire.org/ , https://www.hpwren.ucsd.edu/

- FAA WeatherCams y National Park Service: fuentes oficiales utiles como patron para camaras meteorologicas/parques, pero sin cobertura argentina para este MVP.
  Fuentes: https://weathercams.faa.gov/ y https://www.nps.gov/subjects/developer/api-documentation.htm

- EarthCam, Surfline, WeatherBug, Pano AI y redes privadas/comerciales: no usar sin API, permiso explicito o terminos compatibles.

## Regla de implementacion

- `provider_api`: cuando hay API documentada y permiso de uso.
- `image_url`: cuando existe una imagen publica directa y el uso esta permitido.
- `external_page`: cuando la camara es publica para observar, pero no se deben copiar frames ni embeber contenido.
- `pending`: cuando falta revisar terminos, estabilidad tecnica o cobertura territorial.
