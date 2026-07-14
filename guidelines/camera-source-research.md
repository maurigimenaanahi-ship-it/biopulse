# BioPulse camera source research

Fecha de corte: 2026-07-14.

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

- Webcamtaxi Argentina: aplicada como `html_embed` cuando la pagina publica expone un reproductor de YouTube ya embebido, y como `external_page` si no hay reproductor reutilizable. BioPulse usa el iframe oficial de YouTube con atribucion y enlace a la pagina original; no copia frames, no descarga imagenes y no rehostea video.
  Fuentes: https://www.webcamtaxi.com/en/argentina.html y https://www.webcamtaxi.com/en/terms.html

- WorldCam Argentina: aplicada como `external_page` para ampliar cobertura territorial con paginas individuales de camaras publicas y coordenadas. Cuando la pagina de WorldCam referencia una fuente primaria de YouTube publica, especifica y embebible, BioPulse registra `html_embed` usando el reproductor oficial de YouTube con atribucion WorldCam / YouTube. En el resto de los casos solo abre la pagina original; no copia frames, no descarga imagenes y no rehostea video.
  Fuentes: https://worldcam.eu/webcams/south-america/argentina y https://worldcam.eu/terms

- Tierra del Fuego Live / YouTube: aplicada como `html_embed` para camaras publicas de Ushuaia, Tolhuin y Rio Grande cuando los titulos de oEmbed/feed identifican la localidad especifica. BioPulse usa el iframe oficial de YouTube con atribucion y no copia ni rehostea video.
  Fuente: https://www.youtube.com/@UshuaiaLive

- Innovacion Cipolletti / YouTube: aplicada como `html_embed` para camaras urbanas publicas de Cipolletti cuando el feed del canal y oEmbed identifican la ubicacion especifica. BioPulse usa el iframe oficial de YouTube con atribucion y agrupa escenas equivalentes con Webcamtaxi/Skyline/WorldCam cuando corresponde.
  Fuente: https://www.youtube.com/@innovacioncipolletti

- Centros de montana y nieve con webcams oficiales: aplicados como `html_embed` cuando publican un reproductor oficial, como `image_url` cuando exponen una imagen directa estable, o como `external_page` cuando solo corresponde abrir la fuente original. Aportan observacion visual de cielo, visibilidad, nieve, viento visible y condiciones de montana cercanas a zonas de bosque/interfase.
  Fuentes: https://catedralaltapatagonia.com/webcams/ , https://cerrobayo.com.ar/montana/camara/ , https://skilahoya.com/webcams/ , https://www.cerrocastor.com/es_ar/live.html

- Fuentes oficiales nacionales y municipales argentinas: aplicadas como `stream_url`, `html_embed` o `external_page` segun lo que la fuente publique. Incluye AGP / Argentina.gob.ar para Via Navegable Troncal, Municipalidad de Neuquen Capital, Municipalidad de Las Heras Santa Cruz, Municipalidad de Tandil y Comodoro Turismo. Cuando una pagina agrupa varias camaras, BioPulse registra cada punto visual con URL hash para evitar deduplicacion tecnica y conservar distancia aproximada por punto.
  Fuentes: https://www.argentina.gob.ar/administracion-general-de-puertos-se/navegable-troncal/camaras-de-vigilancia , https://www.argentina.gob.ar/administracion-general-de-puertos-se/via-navegable-troncal/mapa-de-estaciones-meteorologicas-camaras , https://camaras.neuquencapital.gov.ar/ , https://municipiolasherassantacruz.gob.ar/camara-en-vivo/ , https://tandil.gov.ar/camara-vivo , https://comodoroturismo.gob.ar/en-vivo-comodoro-rivadavia/

- Estado del Mar: aplicada como `external_page` para ampliar cobertura costera y meteorologica con camaras publicas en vivo de Mar del Plata, Costa Atlantica bonaerense, Caleta Olivia, Caleta Cordova y Las Grutas. BioPulse registra cada pagina original y agrupa los equivalentes ya existentes en WorldCam con `groupKey`, sin copiar frames, descargar imagenes ni rehostear video.
  Fuentes: https://estadodelmar.com.ar/ y https://estadodelmar.com.ar/terminos-y-condiciones/

## Fuentes alternativas

Cuando dos proveedores muestran la misma escena o un punto visual equivalente, BioPulse conserva ambas fuentes pero comparte un `groupKey`. La interfaz muestra una tarjeta principal y enlaces alternativos, para aumentar cobertura sin duplicar falsamente la cantidad de camaras cercanas.

## Fuentes revisadas, no aplicadas aun

- ALERTCalifornia / ALERTWildfire / HPWREN: modelo muy relevante para incendios y camaras PTZ, pero centrado en California/EE.UU. No cubre Argentina para el MVP actual. Puede inspirar una futura capa de redes oficiales de incendio.
  Fuentes: https://alertcalifornia.org/ , https://www.alertwildfire.org/ , https://www.hpwren.ucsd.edu/

- FAA WeatherCams y National Park Service: fuentes oficiales utiles como patron para camaras meteorologicas/parques, pero sin cobertura argentina para este MVP.
  Fuentes: https://weathercams.faa.gov/ y https://www.nps.gov/subjects/developer/api-documentation.htm

- Vialidad Nacional / estado de rutas y SIG Vial: revisados como fuente vial oficial argentina. Aportan estado de rutas y mapas, pero no se encontro una red publica nacional de camaras visuales enlazable para el registro de Camaras.
  Fuentes: https://www.argentina.gob.ar/transporte/vialidad-nacional/estado-de-rutas y https://www.argentina.gob.ar/transporte/vialidad-nacional/sig-vial

- Municipalidad de Corrientes: revisada como posible fuente primaria para camaras de transito por referencias indirectas, pero la pagina oficial disponible no expone una pagina publica de camaras visuales; se mantiene la cobertura visual mediante WorldCam/Webcamtaxi hasta encontrar una fuente primaria estable.
  Fuente: https://ciudaddecorrientes.gov.ar/

- EarthCam, Surfline, WeatherBug, Pano AI y redes privadas/comerciales: no usar sin API, permiso explicito o terminos compatibles.

## Regla de implementacion

- `provider_api`: cuando hay API documentada y permiso de uso.
- `html_embed`: cuando la fuente primaria publica un reproductor oficial embebible compatible con sus terminos.
- `image_url`: cuando existe una imagen publica directa y el uso esta permitido.
- `external_page`: cuando la camara es publica para observar, pero no se deben copiar frames ni embeber contenido.
- `pending`: cuando falta revisar terminos, estabilidad tecnica o cobertura territorial.
