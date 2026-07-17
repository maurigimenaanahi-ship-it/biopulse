# BioPulse camera source research

Fecha de corte: 2026-07-17.

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

- Paseos y Turismo / YouTube: aplicada como `html_embed` solo para videos directos donde el feed, oEmbed o descripcion publica identifican la localidad. BioPulse registra Buenos Aires, Mendoza y Mar de las Pampas con coordenadas aproximadas de ciudad/zona, y conserva como `external_page` las referencias WorldCam mas especificas cuando el video directo no prueba la misma escena.
  Fuente: https://www.youtube.com/@paseosyturismo

- Municipalidad de Corrientes / SISE Argentina / YouTube: aplicada como `html_embed` para la pagina oficial Ciudad Segura cuando el sitio municipal publica un iframe de YouTube en vivo. BioPulse usa el reproductor oficial de YouTube con atribucion y conserva el enlace a la pagina municipal.
  Fuente: https://ciudaddecorrientes.gov.ar/ciudadsegura

- Portal 5900 e IngenieroWhite.com / YouTube: aplicadas como `html_embed` para la camara meteorologica de Villa Maria y la camara publica de Ingeniero White cuando las paginas fuente publican enlaces o reproductores de YouTube en vivo. BioPulse usa `embed/live_stream` con el canal oficial, mantiene atribucion a la fuente primaria y no copia ni rehostea video.
  Fuentes: https://5900.com.ar/5900-tv/ , https://www.youtube.com/c/Portal5900VillaMar%C3%ADa/live , https://www.ingenierowhite.com/camara-en-vivo/ , https://www.ingenierowhite.com/2024/10/26/link-para-acceder-a-la-primera-camara-en-vivo-que-funciona-en-ingeniero-white/

- Canal 79 / StreamConex: aplicada como `stream_url` para senales publicas de Villa Maza, Mar del Plata, La Costa, Puan y Santa Clara del Mar cuando las paginas de Canal 79 publican el player Clappr con HLS propio. BioPulse reproduce el HLS directo con allowlist de host y CORS verificado, mantiene atribucion y conserva el enlace a la pagina original. La senal de San Juan fue revisada pero no aplicada porque el HLS publicado devolvio 404.
  Fuentes: https://canal79tv.com.ar/ , https://canal79tv.com.ar/media-kit/ , https://canal79tv.com.ar/villa-maza/ , https://canal79tv.com.ar/mardelplatas/ , https://canal79tv.com.ar/la-costa/ , https://canal79tv.com.ar/puan/ , https://canal79tv.com.ar/santa-clara-del-mar/

- Las Lenas / StreamCastHD: aplicada como `stream_url` para la camara oficial de Las Lenas cuando la pagina publica expone el iframe de StreamCastHD con HLS verificable. BioPulse reproduce el HLS directo con allowlist de host y CORS verificado, mantiene atribucion y conserva el enlace a la pagina oficial.
  Fuente: https://laslenas.com/camara-en-vivo/

- LU24 / Shockmedia: aplicada como `html_embed` para la camara publica del estudio de LU24 en Tres Arroyos cuando la pagina oficial publica el iframe `VideoPlayer/lu24am`. BioPulse usa el reproductor oficial, con allowlist estricta de host/ruta, sin copiar ni rehostear video.
  Fuentes: https://www.lu24.com.ar/camara-en-vivo/ , https://worldcam.eu/webcams/south-america/argentina/33660-tres-arroyos-radio-lu24

- El Diario de Pringles / RELTID / Montevision: aplicada como `stream_url` para senales territoriales publicas de Coronel Pringles, Monte Hermoso, Monte Hermoso Peatonal, Sierra de la Ventana y Necochea cuando la portada publica la seccion "Camaras exclusivas de Multimedios" con HLS. BioPulse reproduce HLS directo con allowlist de host/ruta y CORS verificado. La senal "Multimedios" se reviso pero no se aplico porque no identifica una camara territorial especifica.
  Fuente: https://eldiariodepringles.com.ar/

- Centros de montana y nieve con webcams oficiales: aplicados como `html_embed` cuando publican un reproductor oficial, como `image_url` cuando exponen una imagen directa estable, o como `external_page` cuando solo corresponde abrir la fuente original. Aportan observacion visual de cielo, visibilidad, nieve, viento visible y condiciones de montana cercanas a zonas de bosque/interfase.
  Fuentes: https://catedralaltapatagonia.com/webcams/ , https://cerrobayo.com.ar/montana/camara/ , https://skilahoya.com/webcams/ , https://www.cerrocastor.com/es_ar/live.html

- Fuentes oficiales nacionales y municipales argentinas: aplicadas como `stream_url`, `html_embed` o `external_page` segun lo que la fuente publique. Incluye AGP / Argentina.gob.ar para Via Navegable Troncal, Municipalidad de Neuquen Capital, Municipalidad de Las Heras Santa Cruz, Municipalidad de Tandil y Comodoro Turismo. Las estaciones AGP de Bella Vista, San Lorenzo, Rosario, Del Guazu - Brazo Largo y Braga quedaron conectadas por HLS oficial con CORS verificado. Cuando una pagina agrupa varias camaras, BioPulse registra cada punto visual con URL hash para evitar deduplicacion tecnica y conservar distancia aproximada por punto.
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

- EarthCam, Surfline, WeatherBug, Pano AI y redes privadas/comerciales: no usar sin API, permiso explicito o terminos compatibles.

## Regla de implementacion

- `provider_api`: cuando hay API documentada y permiso de uso.
- `html_embed`: cuando la fuente primaria publica un reproductor oficial embebible compatible con sus terminos.
- `image_url`: cuando existe una imagen publica directa y el uso esta permitido.
- `external_page`: cuando la camara es publica para observar, pero no se deben copiar frames ni embeber contenido.
- `pending`: cuando falta revisar terminos, estabilidad tecnica o cobertura territorial.
