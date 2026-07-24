# BioPulse camera source research

Fecha de corte: 2026-07-18.

## Decision MVP

La seccion Camaras usa dos capas:

1. Registro curado en `public/cameraregistry.json`.
2. Descubrimiento dinamico de Windy alrededor del evento mediante `/api/windy-search`.

BioPulse no descarga, captura, rehostea ni reproduce frames de plataformas externas salvo que exista una API o URL de imagen permitida. Si una plataforma publica camaras pero no autoriza reutilizacion de frames, se registra como `external_page` y se abre la fuente original.

## Herramienta de descubrimiento

Para acelerar la captura de camaras Windy indexadas en OpenCCTV, usar:

```bash
npm run cameras:discover
```

El script `scripts/discover-windy-cameras.mjs` recorre raices de OpenCCTV Argentina, detecta `cameraKey` Windy, compara contra `public/cameraregistry.json`, valida que la preview sea una imagen real por tipo y tamano minimo, y escribe reportes ignorados por git en `.camera-reports/`: `windy-candidates.json` con `ready`, `existing` y `rejected`; `windy-ready-registry-snippets.json` con solo los bloques listos para copiar al registry; y `windy-review-checklist.md` para revision visual. No modifica el registry automaticamente: las camaras deben revisarse visualmente antes de agregarse.

## Fuentes aplicadas

- Windy Webcams API: integrada como `provider_api`. La API requiere `x-windy-api-key` y sus URLs de imagen expiran, por eso BioPulse refresca snapshots mediante `/api/windy-camera` y descubre camaras cercanas mediante `/api/windy-search`.
  Fuente: https://api.windy.com/webcams/docs y https://api.windy.com/webcams/terms

- OpenCCTV como indice de descubrimiento Windy: usado solo para localizar camaras argentinas actualmente indexadas con metadatos publicos (`data-camera-id="windy-..."`, coordenadas y preview). Cuando la camara pertenece a Windy, BioPulse no consume OpenCCTV como proveedor final: registra `provider_api` de Windy para respetar API, atribucion y enlaces del proveedor. Se aplicaron Chivilcoy, Alejandro Korn, Acassuso, Cordoba - Boulevard Poniente, Buta Ranquil / Volcan Tromen, Saladillo, Martinez - costa norte, Martinez - Rio de la Plata, Mar de Ajo, Volcan Domuyo / Varvarco, Villa La Angostura - Cumbre 1800, Cordoba - Emilio Olmos / Boulevard Guzman, Cordoba - Boulevard Guzman, Cordoba - Puente Sarmiento, Cordoba - Bv Poniente / Illia, Las Lenas Windy, Cordoba - Terminal de Omnibus, La Carmencita en 3 angulos, Monte Hermoso, Santa Teresita, Santa Clara del Mar, Mar de Ajo este, Mar de las Pampas, Mar Azul, Villa Gesell - Avenida Costanera, Pinamar - La Posta del Mar / Barbados, Coronel Pringles y 5 angulos costeros de Mar del Plata. Dock Sud se reviso pero no se aplico porque devolvio placeholder o imagen no usable al momento de validacion.
  Fuente: https://opencctv.org/es/cameras/argentina

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

- Centros de montana y nieve con webcams oficiales: aplicados como `html_embed` cuando publican un reproductor oficial, como `image_url` cuando exponen una imagen directa estable, como `provider_api` cuando hace falta resolver dinamicamente la imagen publica mas reciente, o como `external_page` cuando solo corresponde abrir la fuente original. Aportan observacion visual de cielo, visibilidad, nieve, viento visible y condiciones de montana cercanas a zonas de bosque/interfase.
  Fuentes: https://catedralaltapatagonia.com/webcams/ , https://chapelco.com.ar/camaras/ , https://cerrobayo.com.ar/montana/camara/ , https://skilahoya.com/webcams/ , https://www.cerrocastor.com/es_ar/live.html

- Chapelco / Varitech: aplicada como `provider_api` para las camaras publicas Rancho Grande, Pradera del Puma y Lift del Puente. La pagina oficial publica imagenes JPEG fechadas en `camaras.ar`; BioPulse consulta la pagina fuente para resolver la URL mas reciente y evitar dejar snapshots congelados. Se conserva atribucion Chapelco / Varitech y enlace al origen.
  Fuentes: https://chapelco.com.ar/camaras/ , https://camaras.ar/

- Varitech imagenes para medios: aplicada como `image_url` para sumar camaras faltantes de Cerro Catedral y La Hoya mediante URLs `latest.jpg` publicadas para embeber con actualizacion automatica cada 5 minutos. En esta tanda se agregaron Punta Princesa como respaldo snapshot del live existente, Cable carril inferior en Catedral y Plateau en La Hoya. La URL `catedral-vivo/latest.jpg` fue revisada pero no aplicada porque devolvio 404.
  Fuentes: https://varitech.ar/prensa , https://varitech.ar/terminos , https://varitech.ar/camara/cam001 , https://varitech.ar/camara/cam004 , https://varitech.ar/camara/cam032

- ESA Ground Stations Live: aplicada como `image_url` para la webcam oficial exterior de la estacion MLG1 / DSA-3 de Malargue. La pagina oficial indica imagenes outdoor actualizadas frecuentemente y la URL directa respondio `image/jpeg` con cache corto. BioPulse muestra la imagen con credito ESA y enlace a la fuente, bajo terminos de uso informativo/editorial de imagenes.
  Fuentes: https://www.esa.int/Enabling_Support/Operations/ESA_Ground_Stations/ESA_Ground_Stations_Live , https://download.esa.int/webcam/mlg/mlg.jpg , https://www.esa.int/ESA_Multimedia/Terms_and_conditions_of_use_of_images_and_videos_available_on_the_esa_website

- Nautica News / Twitch: aplicada como `html_embed` para 5 camaras publicas del Rio de la Plata en Olivos, San Isidro y Buenos Aires - YCA Darsena Norte. La pagina fuente publica iframes de `player.twitch.tv`; BioPulse reconstruye el embed con allowlist de host/canal y `parent` dinamico, como exige Twitch, sin copiar ni rehostear video. Las previews publicas de los 5 canales respondieron `image/jpeg` al momento de validacion.
  Fuentes: https://nautica.news/es/camaras-en-vivo-del-rio-de-la-plata/ , https://dev.twitch.tv/docs/embed/ , https://dev.twitch.tv/docs/embed/video-and-clips/

- Fuentes oficiales nacionales y municipales argentinas: aplicadas como `stream_url`, `html_embed` o `external_page` segun lo que la fuente publique. Incluye AGP / Argentina.gob.ar para Via Navegable Troncal, Municipalidad de Neuquen Capital, Municipalidad de Las Heras Santa Cruz, Municipalidad de Tandil y Comodoro Turismo. Las estaciones AGP de Bella Vista, San Lorenzo, Rosario, Del Guazu - Brazo Largo y Braga quedaron conectadas por HLS oficial con CORS verificado. Neuquen Capital se muestra mediante pagina/player oficial embebido porque sus HLS responden, pero no publican CORS para reproducirlos desde otro dominio. Cuando una pagina agrupa varias camaras, BioPulse registra cada punto visual con URL hash para evitar deduplicacion tecnica y conservar distancia aproximada por punto.
  Fuentes: https://www.argentina.gob.ar/administracion-general-de-puertos-se/navegable-troncal/camaras-de-vigilancia , https://www.argentina.gob.ar/administracion-general-de-puertos-se/via-navegable-troncal/mapa-de-estaciones-meteorologicas-camaras , https://camaras.neuquencapital.gov.ar/ , https://municipiolasherassantacruz.gob.ar/camara-en-vivo/ , https://tandil.gov.ar/camara-vivo , https://comodoroturismo.gob.ar/en-vivo-comodoro-rivadavia/

- Administracion General de Vialidad Provincial de Santa Cruz / monitoreo meteorologico: aplicada como `provider_api` para las 25 estaciones oficiales EM01-EM25. BioPulse resuelve la pagina oficial `https://www.agvp.gob.ar/estaciones/EMxx/EMxx.html`, detecta la hora publicada y muestra el JPG horario `Fotos/EMxx-AAAAMMDDHH.jpg` cuando esta disponible, con enlace y atribucion a AGVP. EM01, EM06, EM10, EM12, EM13, EM17 y EM23 fueron verificadas con snapshot JPEG real el 2026-07-24; el resto queda registrado desde la lista oficial y el provider falla de forma segura si una estacion no tiene imagen reciente.
  Fuente: https://www.agvp.gob.ar/servicios/monitoreo-meteorologico/

- Gesell.com.ar: aplicada como `stream_url` para 14 camaras publicas oficiales de Villa Gesell cuando la pagina de cada camara publica un reproductor Clappr con `/playlist.m3u8`. BioPulse reproduce HLS directo con allowlist de subdominios `cam*.gesell.com.ar`, mantiene atribucion y conserva el enlace a la pagina original. La camara "112 y Playa" fue revisada el 2026-07-17 pero no se aplico porque su playlist devolvio 404 al momento de validacion.
  Fuentes: https://gesell.com.ar/ , https://cam104.gesell.com.ar/ , https://cam104y3.gesell.com.ar/ , https://cam107norte.gesell.com.ar/ , https://cam107sur.gesell.com.ar/ , https://camaeropuerto.gesell.com.ar/ , https://camarco.gesell.com.ar/ , https://camarco2.gesell.com.ar/ , https://cambosque.gesell.com.ar/ , https://cambsasyplaya.gesell.com.ar/ , https://camfaro.gesell.com.ar/ , https://cammuelle.gesell.com.ar/ , https://cammuelle2.gesell.com.ar/ , https://camparroquia.gesell.com.ar/ , https://camplaza111.gesell.com.ar/ , https://cam112yplaya.gesell.com.ar/

- Estado del Mar: aplicada como `external_page` para ampliar cobertura costera y meteorologica con camaras publicas en vivo de Mar del Plata, Costa Atlantica bonaerense, Caleta Olivia, Caleta Cordova y Las Grutas. BioPulse registra cada pagina original y agrupa los equivalentes ya existentes en WorldCam con `groupKey`, sin copiar frames, descargar imagenes ni rehostear video.
  Fuentes: https://estadodelmar.com.ar/ y https://estadodelmar.com.ar/terminos-y-condiciones/

## Fuentes alternativas

Cuando varias camaras muestran una misma esquina, zona o paisaje desde angulos cercanos, BioPulse debe conservarlas como observaciones independientes: esos angulos multiples ayudan a interpretar humo, visibilidad, viento, transito y contexto territorial. `groupKey` queda reservado para duplicados tecnicos o el mismo feed exacto servido por mas de una fuente, no para escenas parecidas.

## Fuentes revisadas, no aplicadas aun

- ALERTCalifornia / ALERTWildfire / HPWREN: modelo muy relevante para incendios y camaras PTZ, pero centrado en California/EE.UU. No cubre Argentina para el MVP actual. Puede inspirar una futura capa de redes oficiales de incendio.
  Fuentes: https://alertcalifornia.org/ , https://www.alertwildfire.org/ , https://www.hpwren.ucsd.edu/

- FAA WeatherCams y National Park Service: fuentes oficiales utiles como patron para camaras meteorologicas/parques, pero sin cobertura argentina para este MVP.
  Fuentes: https://weathercams.faa.gov/ y https://www.nps.gov/subjects/developer/api-documentation.htm

- Vialidad Nacional / estado de rutas y SIG Vial: revisados como fuente vial oficial argentina. Aportan estado de rutas y mapas, pero no se encontro una red publica nacional de camaras visuales enlazable para el registro de Camaras.
  Fuentes: https://www.argentina.gob.ar/transporte/vialidad-nacional/estado-de-rutas y https://www.argentina.gob.ar/transporte/vialidad-nacional/sig-vial

- Mar del Sud / YouTube: revisado como candidato costero municipal/cooperativo por nota publica sobre stream de camaras. El canal `UCBeVyugrRCdu9TYwQlf1aLQ` no mostro `isLiveNow` activo al momento de validacion, por eso no se aplico como `html_embed` todavia.
  Fuentes: https://eldiariodemiramar.com.ar/2026/04/mar-del-sud-inauguro-su-centro-de-monitoreo-y-habilito-un-stream-con-imagenes-de-la-ciudad/ , https://www.youtube.com/@MarDelSud-2026

- EarthCam, Surfline, WeatherBug, Pano AI y redes privadas/comerciales: no usar sin API, permiso explicito o terminos compatibles.

## Regla de implementacion

- `provider_api`: cuando hay API documentada y permiso de uso.
- `html_embed`: cuando la fuente primaria publica un reproductor oficial embebible compatible con sus terminos.
- `image_url`: cuando existe una imagen publica directa y el uso esta permitido.
- `external_page`: cuando la camara es publica para observar, pero no se deben copiar frames ni embeber contenido.
- `pending`: cuando falta revisar terminos, estabilidad tecnica o cobertura territorial.
