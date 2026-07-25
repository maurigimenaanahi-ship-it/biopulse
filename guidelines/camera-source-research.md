# BioPulse camera source research

Fecha de corte: 2026-07-25.

## Decision MVP

La seccion Camaras usa dos capas:

1. Registro curado en `public/cameraregistry.json`.
2. Descubrimiento dinamico de Windy alrededor del evento mediante `/api/windy-search`.

BioPulse no descarga, captura, rehostea ni reproduce frames de plataformas externas salvo que exista una API, URL de imagen, reproductor embebible o stream permitido. Si una plataforma publica camaras pero no autoriza reutilizacion de frames ni ofrece un modo tecnico compatible, se registra como `external_page` y se abre la fuente original.

Antes de degradar una camara a `external_page`, BioPulse debe verificar si existe video real recuperable: API oficial, iframe/reproductor oficial, HLS directo con CORS, o HLS sin CORS que pueda resolverse mediante relay allowlisted sin almacenar contenido. El caso Neuquen Capital queda como precedente: las camaras parecian disponibles solo como pagina externa o player colgado, pero los segmentos HLS eran validos; la solucion correcta fue relay HLS allowlisted + `hls.js`, prefiriendo `hls.js` sobre HLS nativo.

## Herramienta de descubrimiento

Para acelerar la captura de camaras Windy indexadas en OpenCCTV, usar:

```bash
npm run cameras:discover
```

El script `scripts/discover-windy-cameras.mjs` recorre raices de OpenCCTV Argentina, detecta `cameraKey` Windy, compara contra `public/cameraregistry.json`, valida que la preview sea una imagen real por tipo y tamano minimo, y escribe reportes ignorados por git en `.camera-reports/`: `windy-candidates.json` con `ready`, `existing` y `rejected`; `windy-ready-registry-snippets.json` con solo los bloques listos para copiar al registry; y `windy-review-checklist.md` para revision visual. No modifica el registry automaticamente: las camaras deben revisarse visualmente antes de agregarse.

## Herramienta de auditoria visual

Para detectar camaras registradas como `external_page` o `stream_url` que esconden video recuperable, usar:

```bash
npm run cameras:audit -- --scope=patagonia
npm run cameras:audit -- --scope=neuquen
```

El script `scripts/audit-camera-visuals.mjs` valida HLS con master playlist, media playlist, segmento real y CORS; tambien inspecciona paginas externas para encontrar HLS o iframes candidatos correlacionados por slug/hash de la camara. Corre con `node --use-system-ca` para respetar el almacen de certificados del sistema en fuentes oficiales como AGP, y reconoce playlists LL-HLS con fragmentos en atributos `URI` probando segmentos recientes en vez de asumir que el primer segmento live sigue disponible. Escribe reportes ignorados por git en `.camera-reports/` y no modifica el registry automaticamente. Si detecta HLS sin CORS pero con segmentos validos, revisar terminos y crear relay allowlisted antes de resignar la camara a link externo.

## Fuentes aplicadas

- Windy Webcams API: integrada como `provider_api`. La API requiere `x-windy-api-key` y sus URLs de imagen expiran, por eso BioPulse refresca snapshots mediante `/api/windy-camera` y descubre camaras cercanas mediante `/api/windy-search`.
  Fuente: https://api.windy.com/webcams/docs y https://api.windy.com/webcams/terms

- OpenCCTV como indice de descubrimiento Windy: usado solo para localizar camaras argentinas actualmente indexadas con metadatos publicos (`data-camera-id="windy-..."`, coordenadas y preview). Cuando la camara pertenece a Windy, BioPulse no consume OpenCCTV como proveedor final: registra `provider_api` de Windy para respetar API, atribucion y enlaces del proveedor. Se aplicaron Chivilcoy, Alejandro Korn, Acassuso, Cordoba - Boulevard Poniente, Buta Ranquil / Volcan Tromen, Saladillo, Martinez - costa norte, Martinez - Rio de la Plata, Mar de Ajo, Volcan Domuyo / Varvarco, Villa La Angostura - Cumbre 1800, Cordoba - Emilio Olmos / Boulevard Guzman, Cordoba - Boulevard Guzman, Cordoba - Puente Sarmiento, Cordoba - Bv Poniente / Illia, Las Lenas Windy, Cordoba - Terminal de Omnibus, La Carmencita en 3 angulos, Monte Hermoso, Santa Teresita, Santa Clara del Mar, Mar de Ajo este, Mar de las Pampas, Mar Azul, Villa Gesell - Avenida Costanera, Pinamar - La Posta del Mar / Barbados, Coronel Pringles, 5 angulos costeros de Mar del Plata, Tandil en 2 angulos, Dock Sud este, San Cayetano y Pinamar Beach East. Si OpenCCTV devuelve `429`, reintentar con baja frecuencia y paginas individuales antes de descartar: el indice puede limitar scraping aunque las fichas publicas sigan respondiendo.
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

- Municipalidad de la Ciudad de Mendoza / Restreamer: aplicada como `html_embed` para las camaras publicas Terraza Municipal y Plaza Independencia. La fuente publica reproductores oficiales HTTPS y oEmbed; el HLS directo existe en `memfs/*.m3u8`, pero no publica CORS para reproducirse desde BioPulse. Plaza funciona con el iframe directo; Terraza usa el wrapper oficial `playersite_*.html` porque el iframe directo quedo cargando en negro durante el chequeo visual.
  Fuente: https://camarasmunicapital.ciudaddemendoza.gov.ar/

- Municipalidad de Corrientes / SISE Argentina / YouTube: aplicada como `html_embed` para la pagina oficial Ciudad Segura cuando el sitio municipal publica un iframe de YouTube en vivo. BioPulse usa el reproductor oficial de YouTube con atribucion y conserva el enlace a la pagina municipal.
  Fuente: https://ciudaddecorrientes.gov.ar/ciudadsegura

- El Litoral / YouTube: aplicada como `html_embed` para la senal publica "Camaras en vivo en Santa Fe". La fuente publica un canal rotativo 24/7 con camaras en Santa Fe Capital, Rafaela, Sauce Viejo, Monte Vera, Sunchales, San Guillermo, Suardi, Galvez, San Lorenzo y puente Rosario-Victoria. BioPulse registra una unica senal rotativa con coordenada de referencia en Santa Fe capital, no 10 camaras separadas, porque la fuente entrega un solo reproductor que rota automaticamente.
  Fuentes: https://www.ellitoral.com/camaras-vivo , https://www.youtube.com/watch?v=Mb8fb755onY

- Diario El Litoral Corrientes / YouTube: aplicada como `html_embed` para la senal publica 24 horas con camaras y noticias de Corrientes Capital. La nota publica carga el streaming mediante modulo dinamico y tambien expone `amp-youtube data-videoid`; BioPulse registra el video embebible verificado por YouTube oEmbed. No usar `/service/modulo-streaming` como dependencia directa si devuelve 404 fuera del contexto de pagina.
  Fuentes: https://www.ellitoral.com.ar/sociedad/2026-2-3-19-31-0-el-litoral-en-youtube-una-senal-de-streaming-24-horas-con-noticias-y-camaras-en-vivo , https://www.youtube.com/watch?v=FNqdUygsSfo

- Portal 5900 e IngenieroWhite.com / YouTube: aplicadas como `html_embed` para la camara meteorologica de Villa Maria y la camara publica de Ingeniero White cuando las paginas fuente publican enlaces o reproductores de YouTube en vivo. BioPulse usa `embed/live_stream` con el canal oficial, mantiene atribucion a la fuente primaria y no copia ni rehostea video.
  Fuentes: https://5900.com.ar/5900-tv/ , https://www.youtube.com/c/Portal5900VillaMar%C3%ADa/live , https://www.ingenierowhite.com/camara-en-vivo/ , https://www.ingenierowhite.com/2024/10/26/link-para-acceder-a-la-primera-camara-en-vivo-que-funciona-en-ingeniero-white/

- Canal 79 / StreamConex: aplicada como `stream_url` para senales publicas de Villa Maza, Mar del Plata, La Costa, Puan y Santa Clara del Mar cuando las paginas de Canal 79 publican el player Clappr con HLS propio. BioPulse reproduce el HLS directo con allowlist de host y CORS verificado, mantiene atribucion y conserva el enlace a la pagina original. La senal de San Juan fue revisada pero no aplicada porque el HLS publicado devolvio 404.
  Fuentes: https://canal79tv.com.ar/ , https://canal79tv.com.ar/media-kit/ , https://canal79tv.com.ar/villa-maza/ , https://canal79tv.com.ar/mardelplatas/ , https://canal79tv.com.ar/la-costa/ , https://canal79tv.com.ar/puan/ , https://canal79tv.com.ar/santa-clara-del-mar/

- Radio Cardinal / Canal 99 / Solumedia: aplicada como `stream_url` para la camara HD publica 24 horas de Cordoba Capital orientada hacia Av. Olmos y Maipu. La pagina fuente publica el player `play99.html` con HLS `vivo.solumedia.com:19360/cardinal/cardinal.m3u8`; BioPulse reproduce el HLS directo con CORS verificado, segmento MPEG-TS real y allowlist estricta de host/ruta Solumedia.
  Fuentes: https://radiocardinal.com.ar/cordoba-en-vivo-en-el-canal-99/ , https://www.radiocardinal.com.ar/htm/play99.html

- Las Lenas / StreamCastHD: aplicada como `html_embed` para la camara oficial de Las Lenas cuando la pagina publica expone el iframe de StreamCastHD. BioPulse usa el reproductor oficial con allowlist estricta de host/ruta, mantiene atribucion y conserva el enlace a la pagina oficial. No usar el HLS directo como fuente primaria si la playlist publica existe pero los segmentos actuales devuelven 404.
  Fuente: https://laslenas.com/camara-en-vivo/

- LU24 / Shockmedia: aplicada como `html_embed` para la camara publica del estudio de LU24 en Tres Arroyos cuando la pagina oficial publica el iframe `VideoPlayer/lu24am`. BioPulse usa el reproductor oficial, con allowlist estricta de host/ruta, sin copiar ni rehostear video.
  Fuentes: https://www.lu24.com.ar/camara-en-vivo/ , https://worldcam.eu/webcams/south-america/argentina/33660-tres-arroyos-radio-lu24

- El Diario de Pringles / RELTID / Montevision: aplicada como `stream_url` para senales territoriales publicas de Coronel Pringles, Monte Hermoso, Monte Hermoso Peatonal, Sierra de la Ventana y Necochea cuando la portada publica la seccion "Camaras exclusivas de Multimedios" con HLS. BioPulse reproduce HLS directo con allowlist de host/ruta y CORS verificado. La senal "Multimedios" se reviso pero no se aplico porque no identifica una camara territorial especifica.
  Fuente: https://eldiariodepringles.com.ar/

- Centros de montana y nieve con webcams oficiales: aplicados como `html_embed` cuando publican un reproductor oficial, como `image_url` cuando exponen una imagen directa estable, como `provider_api` cuando hace falta resolver dinamicamente la imagen publica mas reciente, o como `external_page` cuando solo corresponde abrir la fuente original. Aportan observacion visual de cielo, visibilidad, nieve, viento visible y condiciones de montana cercanas a zonas de bosque/interfase.
  Cerro Bayo queda como 6 paginas externas oficiales porque el JPG legacy registrado apuntaba a una imagen vieja, no a una senal viva confiable. Cerro Castor debe seguir los iframes actuales publicados en su pagina `live.html`, porque los IDs de YouTube pueden rotar aunque mantengan los mismos puntos visuales.
  Fuentes: https://catedralaltapatagonia.com/webcams/ , https://chapelco.com.ar/camaras/ , https://www.cerrobayo.com/montana/camara/ , https://skilahoya.com/webcams/ , https://www.cerrocastor.com/es_ar/live.html

- Chapelco / Varitech: aplicada como `provider_api` para las camaras publicas Rancho Grande, Pradera del Puma y Lift del Puente. La pagina oficial publica imagenes JPEG fechadas en `camaras.ar`; BioPulse consulta la pagina fuente para resolver la URL mas reciente y evitar dejar snapshots congelados. Se conserva atribucion Chapelco / Varitech y enlace al origen.
  Fuentes: https://chapelco.com.ar/camaras/ , https://camaras.ar/

- Varitech imagenes para medios: aplicada como `image_url` para sumar camaras faltantes de Cerro Catedral y La Hoya mediante URLs `latest.jpg` publicadas para embeber con actualizacion automatica cada 5 minutos. En esta tanda se agregaron Punta Princesa como respaldo snapshot del live existente, Cable carril inferior en Catedral y Plateau en La Hoya. La URL `catedral-vivo/latest.jpg` fue revisada pero no aplicada porque devolvio 404.
  Fuentes: https://varitech.ar/prensa , https://varitech.ar/terminos , https://varitech.ar/camara/cam001 , https://varitech.ar/camara/cam004 , https://varitech.ar/camara/cam032

- Cabanas Liwen Catedral: aplicada como `image_url` para una webcam publica HTTPS en Villa Catedral. BioPulse la usa como snapshot de visibilidad/nieve y conserva enlace/atribucion a la fuente.
  Fuente: https://www.liwencatedral.com.ar/

- ESA Ground Stations Live: aplicada como `image_url` para la webcam oficial exterior de la estacion MLG1 / DSA-3 de Malargue. La pagina oficial indica imagenes outdoor actualizadas frecuentemente y la URL directa respondio `image/jpeg` con cache corto. BioPulse muestra la imagen con credito ESA y enlace a la fuente, bajo terminos de uso informativo/editorial de imagenes.
  Fuentes: https://www.esa.int/Enabling_Support/Operations/ESA_Ground_Stations/ESA_Ground_Stations_Live , https://download.esa.int/webcam/mlg/mlg.jpg , https://www.esa.int/ESA_Multimedia/Terms_and_conditions_of_use_of_images_and_videos_available_on_the_esa_website

- Nautica News / Twitch: aplicada como `html_embed` para 5 camaras publicas del Rio de la Plata en Olivos, San Isidro y Buenos Aires - YCA Darsena Norte. La pagina fuente publica iframes de `player.twitch.tv`; BioPulse reconstruye el embed con allowlist de host/canal y `parent` dinamico, como exige Twitch, sin copiar ni rehostear video. Las previews publicas de los 5 canales respondieron `image/jpeg` al momento de validacion.
  Fuentes: https://nautica.news/es/camaras-en-vivo-del-rio-de-la-plata/ , https://dev.twitch.tv/docs/embed/ , https://dev.twitch.tv/docs/embed/video-and-clips/

- Kite Bariloche: aplicada como `external_page` para las camaras publicas "Camara 1 N" y "Camara 2 ONO" en San Carlos de Bariloche. La pagina publica HLS (`/hls/cam1.m3u8` y `/hls/cam2.m3u8`) pero el acceso directo respondio 403 fuera del origen, por eso BioPulse no lo registra como `stream_url`; conserva dos puntos externos independientes con atribucion.
  Fuente: https://kitebariloche.com/

- Fuentes oficiales nacionales y municipales argentinas: aplicadas como `stream_url`, `html_embed` o `external_page` segun lo que la fuente publique. Incluye AGP / Argentina.gob.ar para Via Navegable Troncal, Municipalidad de Neuquen Capital, Municipalidad de Las Heras Santa Cruz, Municipalidad de Tandil y Comodoro Turismo. Las estaciones AGP de Bella Vista, San Lorenzo, Rosario, Del Guazu - Brazo Largo y Braga quedaron conectadas por HLS oficial con CORS verificado; su auditoria requiere certificados del sistema y soporte LL-HLS porque publican fragmentos `.m4s` en atributos `URI`. Neuquen Capital usa un relay HLS allowlisted de BioPulse porque sus playlists y segmentos responden, pero no publican CORS para reproducirlos desde otro dominio; BioPulse no almacena contenido y mantiene enlace/atribucion a la fuente oficial. Cuando una pagina agrupa varias camaras, BioPulse registra cada punto visual con URL hash para evitar deduplicacion tecnica y conservar distancia aproximada por punto.
  Fuentes: https://www.argentina.gob.ar/administracion-general-de-puertos-se/navegable-troncal/camaras-de-vigilancia , https://www.argentina.gob.ar/administracion-general-de-puertos-se/via-navegable-troncal/mapa-de-estaciones-meteorologicas-camaras , https://camaras.neuquencapital.gov.ar/ , https://municipiolasherassantacruz.gob.ar/camara-en-vivo/ , https://tandil.gov.ar/camara-vivo , https://comodoroturismo.gob.ar/en-vivo-comodoro-rivadavia/

- Caza y Pesca del Neuquen / Red de Camaras en vivo Fauna: aplicada como `stream_url` para 7 senales oficiales de Operativo Nieve en Ingreso Cerro Chapelco, Correntoso - Villa La Angostura, Primeros Pinos, Villa Pehuenia, Junin de los Andes, Lago Lolog y Rahue. La pagina oficial publica HLS `imoulife`; BioPulse valida playlist con CORS y segmentos MPEG-TS mediante GET. En esta fuente `HEAD` sobre segmentos puede devolver 404 falso-negativo, por lo que la validacion correcta debe probar descarga GET corta del segmento y byte inicial MPEG-TS `0x47`.
  Fuente: https://cazaypesca.neuquen.gob.ar/red_camara_fauna/

- Administracion General de Vialidad Provincial de Santa Cruz / monitoreo meteorologico: aplicada como `provider_api` para las 25 estaciones oficiales EM01-EM25. BioPulse resuelve la pagina oficial `https://www.agvp.gob.ar/estaciones/EMxx/EMxx.html`, detecta la hora publicada y muestra el JPG horario `Fotos/EMxx-AAAAMMDDHH.jpg` cuando esta disponible, con enlace y atribucion a AGVP. EM01, EM06, EM10, EM12, EM13, EM17 y EM23 fueron verificadas con snapshot JPEG real el 2026-07-24; el resto queda registrado desde la lista oficial y el provider falla de forma segura si una estacion no tiene imagen reciente.
  Fuente: https://www.agvp.gob.ar/servicios/monitoreo-meteorologico/

- Gesell.com.ar: aplicada como `stream_url` para 14 camaras publicas oficiales de Villa Gesell cuando la pagina de cada camara publica un reproductor Clappr con `/playlist.m3u8`. BioPulse reproduce HLS directo con allowlist de subdominios `cam*.gesell.com.ar`, mantiene atribucion y conserva el enlace a la pagina original. La camara "112 y Playa" fue revisada el 2026-07-17 pero no se aplico porque su playlist devolvio 404 al momento de validacion.
  Fuentes: https://gesell.com.ar/ , https://cam104.gesell.com.ar/ , https://cam104y3.gesell.com.ar/ , https://cam107norte.gesell.com.ar/ , https://cam107sur.gesell.com.ar/ , https://camaeropuerto.gesell.com.ar/ , https://camarco.gesell.com.ar/ , https://camarco2.gesell.com.ar/ , https://cambosque.gesell.com.ar/ , https://cambsasyplaya.gesell.com.ar/ , https://camfaro.gesell.com.ar/ , https://cammuelle.gesell.com.ar/ , https://cammuelle2.gesell.com.ar/ , https://camparroquia.gesell.com.ar/ , https://camplaza111.gesell.com.ar/ , https://cam112yplaya.gesell.com.ar/

- Estado del Mar: aplicada como `external_page` para ampliar cobertura costera y meteorologica con camaras publicas en vivo de Mar del Plata, Costa Atlantica bonaerense, Caleta Olivia, Caleta Cordova y Las Grutas. Aunque varias paginas publican iframes de video, sus terminos vigentes indican que los datos/servicios no se pueden usar en software propio, apps o paginas propias salvo aceptacion expresa. BioPulse mantiene enlace a la pagina original y atribucion hasta conseguir permiso formal; el auditor marca estos casos como `external_visual_permission_required` en vez de promoverlos a `html_embed`.
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
- `stream_url`: cuando el HLS directo es publico, estable y reproducible desde BioPulse. Validar master playlist, media playlist, al menos un segmento real y CORS.
- Relay HLS allowlisted: cuando una fuente oficial o publica permite ver el stream y expone playlists/segmentos reales, pero no publica CORS para otros dominios. El relay debe aceptar solo hosts/rutas/camaras conocidas, reescribir playlists y segmentos, no almacenar contenido, mantener atribucion y enlace a la fuente, y reproducirse con `hls.js` antes que con HLS nativo.
- `external_page`: cuando la camara es publica para observar, pero no se deben copiar frames ni embeber contenido.
- `pending`: cuando falta revisar terminos, estabilidad tecnica o cobertura territorial.
