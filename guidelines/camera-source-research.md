# BioPulse camera source research

Fecha de corte: 2026-07-25.

## Decision MVP

La seccion Camaras usa dos capas:

1. Registro curado en `public/cameraregistry.json`.
2. Descubrimiento dinamico de Windy alrededor del evento mediante `/api/windy-search`.

BioPulse no descarga, captura, rehostea ni reproduce frames de plataformas externas salvo que exista una API, URL de imagen, reproductor embebible o stream permitido. Si una plataforma publica camaras pero no autoriza reutilizacion de frames ni ofrece un modo tecnico compatible, se registra como `external_page` y se abre la fuente original.

Antes de degradar una camara a `external_page`, BioPulse debe verificar si existe video real recuperable: API oficial, iframe/reproductor oficial, HLS directo con CORS, o HLS sin CORS que pueda resolverse mediante relay allowlisted sin almacenar contenido. El caso Neuquen Capital queda como precedente: las camaras parecian disponibles solo como pagina externa o player colgado, pero los segmentos HLS eran validos; la solucion correcta fue relay HLS allowlisted + `hls.js`, prefiriendo `hls.js` sobre HLS nativo.

El reproductor HLS de BioPulse hace un preflight de playlist antes de inicializar `hls.js`. Si la fuente oficial o el relay devuelve 404/403/error, la UI debe mostrarlo como disponibilidad temporal del origen, no como fallo silencioso ni como razon automatica para degradar la camara a `external_page`.

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

## Herramienta de politica de fuentes

Para validar que el registro no incorpore credenciales, tokens, fuentes no publicas o formas de uso incompatibles con la politica de BioPulse, usar:

```bash
npm run cameras:policy
npm run cameras:policy -- --strict
```

El script `scripts/validate-camera-source-policy.mjs` revisa `public/cameraregistry.json` sin modificarlo. Bloquea errores duros como IDs duplicados, coordenadas invalidas, URLs con credenciales, parametros sensibles en query strings y entradas sin marca `usage.isPublic`. Tambien emite advertencias por proveedores sin politica explicita, falta de atribucion, falta de URL de terminos o combinaciones de proveedor/tipo de fetch que conviene revisar antes de promover una fuente. El modo `--strict` convierte advertencias en fallo para auditorias mas exigentes.

## Fuentes aplicadas

- Windy Webcams API: integrada como `provider_api`. La API requiere `x-windy-api-key` y sus URLs de imagen expiran, por eso BioPulse refresca snapshots mediante `/api/windy-camera` y descubre camaras cercanas mediante `/api/windy-search`.
  Fuente: https://api.windy.com/webcams/docs y https://api.windy.com/webcams/terms

- OpenCCTV como indice de descubrimiento Windy: usado solo para localizar camaras argentinas actualmente indexadas con metadatos publicos, coordenadas y preview. Cuando la camara pertenece a Windy, BioPulse no consume OpenCCTV como proveedor final: registra `provider_api` de Windy para respetar API, atribucion y enlaces del proveedor. Se aplicaron Chivilcoy, Alejandro Korn, Acassuso, Cordoba - Boulevard Poniente, Buta Ranquil / Volcan Tromen, Saladillo, Martinez - costa norte, Martinez - Rio de la Plata, Mar de Ajo, Volcan Domuyo / Varvarco, Villa La Angostura - Cumbre 1800, Cordoba - Emilio Olmos / Boulevard Guzman, Cordoba - Boulevard Guzman, Cordoba - Puente Sarmiento, Cordoba - Bv Poniente / Illia, Las Lenas Windy, Cordoba - Terminal de Omnibus, La Carmencita en 3 angulos, Monte Hermoso, Santa Teresita, Santa Clara del Mar, Mar de Ajo este, Mar de las Pampas, Mar Azul, Villa Gesell - Avenida Costanera, Pinamar - La Posta del Mar / Barbados, Coronel Pringles, 5 angulos costeros de Mar del Plata, Tandil en 2 angulos, Dock Sud este, San Cayetano, Pinamar Beach East, Cordoba - Avenida 24 de Septiembre, Cordoba - Ciudad Universitaria, Cordoba - Plaza Espana / Hipolito Yrigoyen, Cordoba - Plaza de las Americas, Villa Gesell - Mirador del Muelle, Villa Gesell - Plaza de las Americas, Malargue - Planchon-Peteroa, Caviahue - Volcan Copahue, Copahue oeste, Las Grutas sudeste y Rosario - El Aura. La ruta vigente de OpenCCTV es `https://opencctv.org/cameras/argentina`; las fichas individuales publican feeds firmados `/api/feed/windy-...` utiles para validar preview, pero BioPulse no debe depender de esos feeds como proveedor final. Si varias fichas OpenCCTV exponen el mismo `cameraKey` Windy, tratarlas como duplicado tecnico y registrar solo un punto hasta verificar que sean feeds realmente distintos.
  Fuentes: https://opencctv.org/cameras/argentina , https://opencctv.org/cameras/argentina/cordoba/cordoba/cordoba-avenida-24-de-septiembre-315191 , https://opencctv.org/cameras/argentina/cordoba/cordoba/cordoba-ciudad-universitaria-315954 , https://opencctv.org/cameras/argentina/cordoba/cordoba/cordoba-espana-square-avenida-hipolito-yrigoyen-312364 , https://opencctv.org/cameras/argentina/cordoba/cordoba/cordoba-plaza-de-las-americas-313257 , https://opencctv.org/cameras/argentina/buenos-aires/zona-sur-south-east-villa-gesell-pier-mirador-del-muelle-316929 , https://opencctv.org/cameras/argentina/buenos-aires/zona-sur-south-plaza-de-las-americas-317466 , https://opencctv.org/cameras/argentina/mendoza/departamento-malargue-west-planchon-peteroa-304558 , https://opencctv.org/cameras/argentina/neuquen-province/caviahue/caviahue-west-volcan-copahue-313161 , https://opencctv.org/cameras/argentina/neuquen-province/copahue/copahue-west-316816 , https://opencctv.org/cameras/argentina/rio-negro-province/the-caves/the-caves-south-east-314773 , https://opencctv.org/cameras/argentina/santa-fe/rosario/rosario-east-el-aura-318492

- Meteoblue como indice de descubrimiento Windy: usado solo para localizar camaras argentinas que publica con embed/imagen Windy y metadatos territoriales. Cuando la camara pertenece a Windy, BioPulse registra `provider_api` de Windy como proveedor final. En esta tanda se aplico Santiago del Estero - Plaza Libertad / Catedral con `cameraKey` Windy y coordenadas recuperadas desde la ficha de webcams.
  Fuente: https://www.meteoblue.com/es/tiempo/webcams/ciudad-de-santiago-del-estero_argentina_3835869

- Tiempo3 como indice de descubrimiento Windy/Lookr: usado solo cuando la pagina publica una imagen Windy o iframe Lookr con ID de camara verificable. BioPulse registra `provider_api` de Windy como proveedor final y no consume Tiempo3 como fuente de video. En esta tanda se aplico Parana, Entre Rios con `cameraKey` Windy; Gualeguaychu y Concepcion del Uruguay se revisaron pero no se aplicaron porque el HTML no expuso feed o imagen real de camara al momento de validacion.
  Fuentes: https://www.tiempo3.com/south-america/argentina/entre-rios/parana?page=webcam , https://www.tiempo3.com/south-america/argentina/entre-rios/gualeguaychu?page=webcam , https://www.tiempo3.com/south-america/argentina/entre-rios/concepcion-del-uruguay?page=webcam

- SkylineWebcams Argentina: aplicada como `external_page`. Sus terminos permiten ver y compartir mediante enlaces, pero restringen copiar, descargar o reproducir frames. Por eso BioPulse solo abre la pagina original.
  Fuentes: https://www.skylinewebcams.com/en/webcam/argentina.html y https://www.skylinewebcams.com/en/terms-of-use.html

- Webcamtaxi Argentina: aplicada como `html_embed` cuando la pagina publica expone un reproductor de YouTube ya embebido, y como `external_page` si no hay reproductor reutilizable. BioPulse usa el iframe oficial de YouTube con atribucion y enlace a la pagina original; no copia frames, no descarga imagenes y no rehostea video.
  Fuentes: https://www.webcamtaxi.com/en/argentina.html y https://www.webcamtaxi.com/en/terms.html

- Omnicam / Radio Ciudad de Merlo / YouTube: aplicada como `html_embed` para las camaras publicas "Camara en vivo de Villa de Merlo, San Luis" y "Camara en vivo de Los Molles, San Luis". Omnicam publica enlaces/reproductores de YouTube y YouTube oEmbed identifica los videos y autor como Radio Ciudad de Merlo. BioPulse no iframa Omnicam; usa el reproductor oficial de YouTube con atribucion y no copia ni rehostea video.
  Fuentes: https://omnicamapp.com/en/webcam/103786/ , https://www.youtube.com/watch?v=VUnPksjW7Co , https://omnicamapp.com/en/webcam/104238/ , https://www.youtube.com/watch?v=3faXDGNnZnE , https://losmolles.gob.ar/ubicacion/

- WorldCam Argentina: aplicada como `external_page` para ampliar cobertura territorial con paginas individuales de camaras publicas y coordenadas. Cuando la pagina de WorldCam referencia una fuente primaria de YouTube publica, especifica y embebible, BioPulse registra `html_embed` usando el reproductor oficial de YouTube con atribucion WorldCam / YouTube. Desde 2026-08-07, BioPulse tambien puede usar `/api/worldcam-camera` como `provider_api` para resolver snapshots publicos desde `liveview/{id}` cuando WorldCam expone una imagen actual `worldcam.pl` / `img2.worldcam.pl`. No embeber la pagina WorldCam completa porque responde `X-Frame-Options: SAMEORIGIN`; tampoco copiar ni rehostear frames. Conversion a snapshot dinamico por tandas verificadas: 50 camaras WorldCam convertidas hasta ahora.
  Fuentes: https://worldcam.eu/webcams/south-america/argentina y https://worldcam.eu/terms

- Tierra del Fuego Live / YouTube: aplicada como `html_embed` para camaras publicas de Ushuaia, Tolhuin y Rio Grande cuando los titulos de oEmbed/feed identifican la localidad especifica. BioPulse usa el iframe oficial de YouTube con atribucion y no copia ni rehostea video.
  Fuente: https://www.youtube.com/@UshuaiaLive

- Innovacion Cipolletti / YouTube: aplicada como `html_embed` para camaras urbanas y ambientales publicas de Cipolletti cuando el feed del canal y oEmbed identifican la ubicacion especifica. BioPulse usa el iframe oficial de YouTube con atribucion y conserva puntos visuales independientes, incluido Balneario Isla Jordan, cuando el video ID y la escena son distintos.
  Fuentes: https://www.youtube.com/@innovacioncipolletti , https://www.youtube.com/watch?v=JwczEilzRuI , https://opencctv.org/cameras/argentina/rio-negro/cipolletti/isla-jordan-cipolletti-409414

- Paseos y Turismo / YouTube: aplicada como `html_embed` solo para videos directos donde el feed, oEmbed o descripcion publica identifican la localidad. BioPulse registra Buenos Aires, Mendoza, Mendoza Andes y Mar de las Pampas con coordenadas aproximadas de ciudad/zona, y conserva como `external_page` las referencias WorldCam mas especificas cuando el video directo no prueba la misma escena. La senal federal rotativa `ARGENTINA LIVE 24/7` fue revisada y estaba activa, pero no se registra como camara puntual porque rota multiples destinos y no entrega coordenada estable.
  Fuentes: https://www.youtube.com/@paseosyturismo , https://www.youtube.com/watch?v=iqX6f4hGLWA , https://streamers.ar/events_api

- Municipalidad de la Ciudad de Mendoza / Restreamer: aplicada como `html_embed` para las camaras publicas Terraza Municipal y Plaza Independencia. La fuente publica reproductores oficiales HTTPS y oEmbed; el HLS directo existe en `memfs/*.m3u8`, pero no publica CORS para reproducirse desde BioPulse. Plaza funciona con el iframe directo; Terraza usa el wrapper oficial `playersite_*.html` porque el iframe directo quedo cargando en negro durante el chequeo visual.
  Fuente: https://camarasmunicapital.ciudaddemendoza.gov.ar/

- Municipalidad de Corrientes / SISE Argentina / YouTube: aplicada como `html_embed` para la pagina oficial Ciudad Segura cuando el sitio municipal publica un iframe de YouTube en vivo. Tambien se registra el stream directo de SISE Argentina para el Puente General Belgrano como senal primaria de infraestructura critica Chaco/Corrientes: YouTube oEmbed confirma el video y autor, y CAME documenta que el proyecto de camaras del puente funciona 24 hs y puede verse gratuitamente. BioPulse usa el reproductor oficial de YouTube con atribucion y conserva enlaces a la fuente.
  Fuentes: https://ciudaddecorrientes.gov.ar/ciudadsegura , https://www.youtube.com/watch?v=CA3S3av3C5A , https://www.youtube.com/@SISEArgentina/streams , https://www.redcame.org.ar/prensa/13842/index.php

- Eventos SISE Argentina / YouTube: aplicada como `html_embed` para tres senales publicas de camaras urbanas de Resistencia, Chaco, descubiertas por Omnicam y verificadas por YouTube oEmbed. Como las paginas no identifican esquina o punto exacto, BioPulse las registra con coordenada urbana de Resistencia y descripcion de senal de ciudad, no como camara puntual inventada. Conservar senales multiples de la misma localidad si el video ID es distinto.
  Fuentes: https://omnicamapp.com/en/webcam/77359/ , https://www.youtube.com/watch?v=-oNQejx98EQ , https://omnicamapp.com/en/webcam/110557/ , https://www.youtube.com/watch?v=SS8UHsUAT00 , https://omnicamapp.com/en/webcam/129268/ , https://www.youtube.com/watch?v=YcyfsY4kVIo

- El Litoral / YouTube: aplicada como `html_embed` para la senal publica "Camaras en vivo en Santa Fe". La fuente publica un canal rotativo 24/7 con camaras en Santa Fe Capital, Rafaela, Sauce Viejo, Monte Vera, Sunchales, San Guillermo, Suardi, Galvez, San Lorenzo y puente Rosario-Victoria. BioPulse registra una unica senal rotativa con coordenada de referencia en Santa Fe capital, no 10 camaras separadas, porque la fuente entrega un solo reproductor que rota automaticamente.
  Fuentes: https://www.ellitoral.com/camaras-vivo , https://www.youtube.com/watch?v=Mb8fb755onY

- Diario El Litoral Corrientes / YouTube: aplicada como `html_embed` para la senal publica 24 horas con camaras y noticias de Corrientes Capital. La nota publica carga el streaming mediante modulo dinamico y tambien expone `amp-youtube data-videoid`; BioPulse registra el video embebible verificado por YouTube oEmbed. No usar `/service/modulo-streaming` como dependencia directa si devuelve 404 fuera del contexto de pagina.
  Fuentes: https://www.ellitoral.com.ar/sociedad/2026-2-3-19-31-0-el-litoral-en-youtube-una-senal-de-streaming-24-horas-con-noticias-y-camaras-en-vivo , https://www.youtube.com/watch?v=FNqdUygsSfo

- Portal 5900 e IngenieroWhite.com / YouTube: aplicadas como `html_embed` para la camara meteorologica de Villa Maria y la camara publica de Ingeniero White cuando las paginas fuente publican enlaces o reproductores de YouTube en vivo. BioPulse usa `embed/live_stream` con el canal oficial, mantiene atribucion a la fuente primaria y no copia ni rehostea video.
  Fuentes: https://5900.com.ar/5900-tv/ , https://www.youtube.com/c/Portal5900VillaMar%C3%ADa/live , https://www.ingenierowhite.com/camara-en-vivo/ , https://www.ingenierowhite.com/2024/10/26/link-para-acceder-a-la-primera-camara-en-vivo-que-funciona-en-ingeniero-white/

- Canal 79 / StreamConex: aplicada como `stream_url` para senales publicas de Villa Maza, La Costa, Puan y Santa Clara del Mar cuando las paginas de Canal 79 publican el player Clappr con HLS propio. BioPulse reproduce el HLS directo con allowlist de host y CORS verificado, mantiene atribucion y conserva el enlace a la pagina original. La senal de Mar del Plata quedo degradada a `external_page` de WorldCam / Canal 79 porque el HLS directo registrado no quedo reproducible en la auditoria; no volver a promoverla a stream sin playlist y segmento verificados. La senal de San Juan fue revisada pero no aplicada porque el HLS publicado devolvio 404.
  Fuentes: https://canal79tv.com.ar/ , https://canal79tv.com.ar/media-kit/ , https://canal79tv.com.ar/villa-maza/ , https://canal79tv.com.ar/mardelplatas/ , https://canal79tv.com.ar/la-costa/ , https://canal79tv.com.ar/puan/ , https://canal79tv.com.ar/santa-clara-del-mar/

- Radio Cardinal / Canal 99 / Solumedia / YouTube: aplicada como `stream_url` para la camara HD publica 24 horas de Cordoba Capital orientada hacia Av. Olmos y Maipu. La pagina fuente publica el player `play99.html` con HLS `vivo.solumedia.com:19360/cardinal/cardinal.m3u8`; BioPulse reproduce el HLS directo con CORS verificado, segmento MPEG-TS real y allowlist estricta de host/ruta Solumedia. Tambien se aplico Canal 99 Miramar / Ansenuza como `html_embed` de YouTube para la senal publica "Sistema de Informacion Turistica"; al ser una senal de servicio turistico que puede rotar camaras, se registra como punto visual regional de Miramar y no como cada camara separada de Balnearia/Miramar hasta obtener feeds independientes.
  Fuentes: https://radiocardinal.com.ar/cordoba-en-vivo-en-el-canal-99/ , https://www.radiocardinal.com.ar/htm/play99.html , https://radiocardinal.com.ar/el-canal-99-ahora-en-youtube/ , https://www.youtube.com/watch?v=KHCdkIaHAJk

- InfoPico / Solumedia: aplicada como `stream_url` para la webcam urbana 24 horas de General Pico, La Pampa. La pagina `infopico.com/tv` publica un reproductor HTML5 con HLS `vivo.solumedia.com:19360/infopico/infopico.m3u8`; una nota propia identifica la camara como webcam del macrocentro de General Pico. BioPulse reproduce HLS directo con CORS verificado, segmento MPEG-TS real y allowlist estricta de host/ruta Solumedia.
  Fuentes: https://www.infopico.com/tv/ , https://www.infopico.com/2025/09/15/exclusivo-la-camara-en-vivo-de-infopico-com-registro-el-paso-del-bolido-sobre-el-cielo-piquense/

- Canal 12 Web / MistServer / RepublicaServers: aplicada como `stream_url` para la senal local 24/7 de Puerto Madryn y Chubut. La pagina fuente declara `og:video` y `ya:ovs:allow_embed=true`, publica el reproductor MistServer `nd106.republicaservers.com/c7827.html` y expone HLS `/hls/c7827/index.m3u8` con CORS y segmentos MPEG-TS reales. Registrar como senal local 24/7, no como camara fija garantizada, porque puede incluir noticias, programas y camaras locales.
  Fuentes: https://canal12web.com/canal-12-en-vivo/ , https://www.mercadomadryn.com/madrynonline , https://nd106.republicaservers.com/c7827.html

- Canal 7 Jujuy / Somos Jujuy / Arcast: aplicada como `stream_url` para la senal local de San Salvador de Jujuy cuando la pagina oficial publica iframe de Arcast y el player expone HLS `stream.arcast.live/canal7jujuy/ngrp:canal7jujuy_all/playlist.m3u8`. Registrar como senal local, no como camara fija garantizada, porque puede incluir noticieros, programas y camaras locales. Requiere allowlist estricta del host/ruta y CORS/segmento MPEG-TS verificado.
  Fuentes: https://www.somosjujuy.com.ar/canal7vivo , https://arcast.com.ar/canal7jujuy/

- Catamarca TV y Canal 3 La Pampa / Arcast: aplicadas como `stream_url` para senales locales provinciales cuando el player Arcast directo existe y el HLS HTTPS responde con CORS y segmentos MPEG-TS. Registrar como senales locales, no como camaras fijas garantizadas. Usar rutas allowlisteadas de `stream.arcast.com.ar` sin parametros.
  Fuentes: https://arcast.com.ar/canal7catamarca/ , https://stream.arcast.com.ar/canal7catamarca/ngrp:canal7catamarca_all/playlist.m3u8 , https://arcast.com.ar/c3lapampa/ , https://stream.arcast.com.ar/c3lapampa/ngrp:c3lapampa_all/playlist.m3u8

- Radio TV Valle Viejo / Arcast: aplicada como `stream_url` para la senal audiovisual local de Valle Viejo / Catamarca cuando la portada oficial publica iframe `arcast.ar/radiovalleviejo` y el player expone HLS `stream.arcast.ar/radiovalleviejo/ngrp:radiovalleviejo_all/playlist.m3u8`. Registrar como senal local con estudio/noticias/moviles, no como camara fija garantizada. Requiere allowlist exacta del host/ruta, CORS `*` y segmento MPEG-TS validado.
  Fuentes: https://radiovalleviejo.com/ , https://arcast.ar/radiovalleviejo , https://stream.arcast.ar/radiovalleviejo/ngrp:radiovalleviejo_all/playlist.m3u8

- Canal Parlamentario Catamarca / Camara de Diputados: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCZFcNG6O6VeHBAL3PaIwp0Q`. La pagina oficial `VIVO` publica videos/sesiones y el canal de YouTube responde con oEmbed y endpoint `live_stream`. Registrar como senal institucional disponible cuando hay sesiones o actividades, no como camara fija ni senal 24/7.
  Fuentes: https://tv.diputadoscatamarca.gob.ar/index.php/vivo/ , https://www.youtube.com/watch?v=5-uyqtASxoU

- Catamarca / UNCA TV / Universidad Nacional de Catamarca: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCytzYmegAHZaoV9CJbnCcxg`. La UNCA referencia su canal oficial `@UNCATV` y notas institucionales indican transmisiones en vivo por ese canal; el embed por canal respondio 200 aunque no habia emision activa durante la validacion. Registrar como senal institucional/local disponible cuando la fuente esta al aire, no como camara fija 24/7.
  Fuentes: https://www.unca.edu.ar/ , https://www.unca.edu.ar/noticia-23352401-esta-tarde-asumirn-las-autoridades-electas-de-la-unca.html , https://www.youtube.com/@UNCATV

- Formosa / Lapacho / Canal 11 / Livecastv: aplicada como `html_embed` desde la pagina oficial nueva de Lapacho, que publica un iframe `playerv.livecastv.com/video/oncestream/.../sim`. El player expone HLS `stmvideo6.livecastv.com/oncestream/oncestream/playlist.m3u8` y segmentos MPEG-TS validos, pero no publica CORS para reproducir el HLS directo desde BioPulse; usar el iframe oficial allowlisteado, no el HLS directo. El sitio viejo `www.lapachotv.com.ar` queda como referencia historica.
  Fuentes: https://lapachocanal11.com.ar/vivo/ , https://playerv.livecastv.com/video/oncestream/3/true/false/WXpOU2RHUnRiR3RhVnpneVRHMTRjR1J0Vm1wWldFNHdaR2sxYW1JeU1EMD0rMw==/16:9/WVVoU01HTklUVFpNZVRseldWaENhRmt5YUhaWk1rWjFXVmQzZUUxVE5XcGlNakIxV1ZoSmRtUXpRWFJaTWpsMVpFZFdkV1JET1RGalIzaDJXVmRTZWt4NlNYZE5hbEYyVFVSamRsUkZPVWhVZWtwdVkyMXNlazFwTlhGalIyTTkrMw==/sim , https://stmvideo6.livecastv.com/oncestream/oncestream/playlist.m3u8

- Formosa / Agenfor / Canal 3 / Livecastv: aplicada como `html_embed` desde la pagina oficial de Agenfor / Gobierno de Formosa. La portada declara "CANAL 3 FORMOSA" y publica iframe `playerv.livecastv.com/video/agenfor/.../nao`; el player descubre HLS `stmvideo6.livecastv.com/agenfor/agenfor/playlist.m3u8`, pero BioPulse usa el reproductor oficial porque el acceso directo no quedo promovido como stream con CORS/segmentos estables. Registrar como senal local/oficial, no como camara fija garantizada.
  Fuentes: https://agenfor.com.ar/ , https://agenfor.com.ar/canal-3-formosa/ , https://playerv.livecastv.com/video/agenfor/1/true/false/V1hwT1UyUkhVblJpUjNSaFZucG5lVlJITVRSalIxSjBWbTF3V2xkRk5IZGFSMnN4WVcxSmVVMUVNRDA9K1I=/16:9/aHR0cDovL3d3dy5hZ2VuZm9yLmNvbS5hcisx/nao

- Formosa / Quien TV / Twitch: aplicada como `html_embed` usando el reproductor oficial `player.twitch.tv/?channel=quientvformosa`. La fuente publica presencia local en YouTube y Twitch; BioPulse usa Twitch porque el embed por canal es estable y ya esta soportado con `parent` dinamico. Registrar como senal local de streaming, no como camara fija 24/7.
  Fuentes: https://www.twitch.tv/quientvformosa , https://www.youtube.com/@QUIENTVFORMOSA

- Ciudad TV Chaco y Canal Somos Uno: aplicadas como `stream_url` para senales locales/provinciales de Chaco cuando sus paginas oficiales publican HLS directo con CORS y segmentos MPEG-TS. Ciudad TV usa `617c5175c970b.streamlock.net:4444/chacodxdtv/livenew/playlist.m3u8`; Somos Uno usa `wowzasrv.chaco.gov.ar/Streamtv/chacotv/playlist.m3u8`. Registrar como senales de noticias/programas/moviles, no como camaras fijas garantizadas.
  Fuentes: https://ciudadtv.ar/ , https://ciudadtv.ar/institucional/ , https://617c5175c970b.streamlock.net:4444/chacodxdtv/livenew/playlist.m3u8 , https://canalsomosuno.tv/vivo , https://wowzasrv.chaco.gov.ar/Streamtv/chacotv/playlist.m3u8

- Multivision Federal / Shockmedia: aplicada como `stream_url` para la senal local/federal originada en Salta cuando la portada oficial publica HLS `videostream.shockmedia.com.ar/hls/multivisionfederal/multivisionfederal.m3u8`. Registrar como senal de noticias y moviles, no como camara fija garantizada. Requiere allowlist estricta de host/ruta, CORS `*` y segmento validado.
  Fuentes: https://multivision.tv/ , https://multivision.tv/programacion/ , https://videostream.shockmedia.com.ar/hls/multivisionfederal/multivisionfederal.m3u8

- Canal 7 Salta / Cooperativa del Pueblo / Solumedia: aplicada como `stream_url` cuando el sitio oficial `https://canal7salta.com/en-vivo/` y la portada publicaron players en vivo; el player Solumedia `https://vivo.solumedia.com:2020/VideoPlayer/canal7salta?autoplay=1` expuso HLS `https://vivo.solumedia.com:19360/canal7salta/canal7salta.m3u8`. BioPulse usa allowlist exacta de host/puerto/ruta con CORS y segmento MPEG-TS verificados. Las rutas viejas `streamingargentino.info/playerhtml5/canal7_pf.html`, `streamingargentino.info/playerhtml5/crespo3.html` y `streamlock.net/crespo3` devolvieron 404 o timeout durante la prueba, por eso no se usan.
  Fuentes: https://canal7salta.com/ , https://canal7salta.com/en-vivo/ , https://vivo.solumedia.com:2020/VideoPlayer/canal7salta?autoplay=1

- Salta / PUE! / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCdMP4zAisGQ7Dve0rjrsVAw`. La pagina oficial de PUE! enlaza su canal `@pueok`; la ruta `/live` de YouTube resolvio a un video actual en vivo con `playability=OK`, `isLiveNow` y oEmbed valido. Registrar como senal local con programas/coberturas/moviles, no como camara fija garantizada.
  Fuentes: https://pueinfo.com/ , https://www.youtube.com/@pueok/live , https://www.youtube.com/@pueok

- San Juan / Light FM / Canal 4 / Canal 8 / Reserva San Guillermo: Light FM queda como `stream_url` porque su HLS publico mantiene CORS y segmentos MPEG-TS validos. Canal 4 queda como `html_embed` usando el player oficial `www.alsolnet.com/stream/canal4sanjuan/player.htm`; el HLS directo `streamlov.alsolnet.com/canal4sanjuan/live/playlist.m3u8` fue removido del registro reproducible tras auditoria fallida. Canal 4 y Canal 8 son senales locales, no camaras fijas garantizadas. Canal 8 se aplica desde YouTube `embed/live_stream` tras validacion de vivo actual por Streamers.ar y pagina oficial San Juan 8. Reserva San Guillermo se aplica solo para Cuesta del Viento como `external_page`: la pagina oficial lista la camara 3 y el script Click2Stream responde, pero el iframe Angelcam no queda habilitado como embed seguro para BioPulse en produccion. Llano de los Leones y Sepultura siguen pendientes porque `sanguillermo.click2stream.com` y `sepultura.click2stream.com` devolvieron 404 al momento de validacion.
  Fuentes: https://www.lightfm.com.ar/camara/ , https://videostream.shockmedia.com.ar:19360/lightfm/lightfm.m3u8 , https://canal4sanjuan.com.ar/ , https://www.alsolnet.com/stream/canal4sanjuan/ , https://streamlov.alsolnet.com/canal4sanjuan/live/playlist.m3u8 , https://www.sanjuan8.com/canal8sanjuan , https://www.youtube.com/watch?v=SMVSr3RAyNg , https://www.reservasanguillermo.com/galeria-multimedia.php , https://www.reservasanguillermo.com/videos-en-vivo.php?camara=03

- Canal 13 La Rioja / Medios Provincia / Arcast: aplicada como `stream_url` con HLS HTTPS `stream.arcast.net:4443/mp/mp/playlist.m3u8`, CORS y segmento MPEG-TS verificados. La app oficial Medios Provincia confirma TV en vivo de Canal 13 La Rioja; el reproductor publico de TeleOnline expone la variante HTTPS. Mantener allowlist estricta de host, puerto y ruta.
  Fuentes: https://www.teleonline.tv/canal/canal-13-la-rioja/ , https://play.google.com/store/apps/details?id=ar.com.mediosprovincia.mediosprovincia

- Canal 9 La Rioja / Radio y Television Riojana / InliveServer: aplicada como `stream_url` desde el sitio oficial actual de Radio y Television Riojana, que enlaza `canal9` y publica el player `stream.inliveserver.com:2020/VideoPlayer/8030`. El player expone HLS HTTPS `stream.inliveserver.com:19360/8030/8030.m3u8` con CORS `*` y segmento MPEG-TS validado. Mantener allowlist estricta de host, puerto y ruta.
  Fuentes: https://radioytelevisionriojana.com.ar/ , https://radioytelevisionriojana.com.ar/canal9/ , https://stream.inliveserver.com:19360/8030/8030.m3u8

- Canal 5 TV Chepes / Alfa TV / Shockmedia: aplicada como `stream_url` cuando el sitio oficial `https://canal5tvchepes.com.ar/` publico iframe `https://videostream.shockmedia.com.ar:2000/VideoPlayer/canal5alfatvchepes` y el player expuso HLS `https://videostream.shockmedia.com.ar:19360/canal5alfatvchepes/canal5alfatvchepes.m3u8`. Validar playlist, CORS abierto y segmento MPEG-TS real. Registrar como senal local audiovisual de Chepes / sur riojano, no como camara fija garantizada.
  Fuentes: https://canal5tvchepes.com.ar/ , https://videostream.shockmedia.com.ar:2000/VideoPlayer/canal5alfatvchepes , https://videostream.shockmedia.com.ar:19360/canal5alfatvchepes/canal5alfatvchepes.m3u8

- Canal 10 Tucuman: aplicada como `html_embed` porque la portada oficial publica iframe YouTube `embed/live_stream?channel=UCRlakPhec4-k3vkBeyWBojg`. Usar el iframe oficial, no streams DASH/DRM de terceros.
  Fuente: https://canal10.com.ar/

- Canal 2 Misiones / MistServer: aplicada como `stream_url` para la senal local de Posadas cuando la portada oficial publica iframe `nd106.republicaservers.com:4433/canal2misioness.html` y el player expone HLS `/hls/canal2misioness/index.m3u8`. Registrar como senal local con noticias/programas/moviles, no como camara fija garantizada. Requiere allowlist estricta del host/puerto/ruta, CORS `*` y segmento MPEG-TS validado.
  Fuentes: https://www.canal2misiones.com.ar/ , https://nd106.republicaservers.com:4433/hls/canal2misioness/index.m3u8

- Fundacion Rewilding Argentina / CONICET / Explore.org / IPCamLive: aplicada como `html_embed` para la camara ambiental en vivo de Isla Tova publicada en YouTube y para las seis birdcams oficiales publicadas en `rewildingargentina.org/monitoreo/`: Tova 1, Tova 2, Gran Robredo 1, Gran Robredo 2, Tovita 1 y Tovita 2. El canal oficial de Rewilding Argentina publica una transmision en YouTube y oEmbed confirma el video embebible; la pagina oficial publica los iframes IPCamLive con alias `argentinacam1` a `argentinacam6`; Explore.org documenta ubicacion, objetivo de conservacion y soporte a investigacion no invasiva. Registrar como observaciones ambientales/costeras, no como camaras viales ni urbanas.
  Fuentes: https://www.rewildingargentina.org/monitoreo/#camaras , https://leptomar.org/divulgacion-rewilding/ , https://www.youtube.com/@rewildingargentina/streams , https://www.youtube.com/watch?v=QTUb7J4Htv8 , https://explore.org/livecams/rewilding-argentina/rewilding-penguin-nest

- Misiones Online / Dailymotion: aplicadas como `html_embed` para la camara / senal visual "Costanera de Posadas" y la senal "Misiones Online Television". El perfil publico de Dailymotion lista ambas como `Live`; las paginas de video y los embeds oficiales `www.dailymotion.com/embed/video/x9x6vqm` y `www.dailymotion.com/embed/video/x7zh5gd` responden con player HTML y referencias de streaming. Usar Dailymotion solo con allowlist exacta `/embed/video/<id>` y fuente de video publicada por la cuenta Misiones Online. Las paginas propias de Misiones Online devolvieron 403 al validador, por eso no depender de ellas hasta resolver el acceso.
  Fuentes: https://www.dailymotion.com/user/misionesonline , https://www.dailymotion.com/video/x9x6vqm , https://www.dailymotion.com/video/x7zh5gd

- El Ocho Tucuman: aplicada como `html_embed` porque la pagina oficial `el-ocho-en-vivo.html` publica iframe de YouTube para la transmision en vivo y el `oEmbed` de YouTube confirma el video `RCXfY3lEAoI`. Usar el iframe oficial de YouTube, no streams descargados ni mirrors de terceros.
  Fuente: https://www.elocho.tv/el-ocho-en-vivo.html

- Tucuman / LA GACETA Play: aplicada como `provider_api` con endpoint `/api/lagaceta-play`. La pagina estable publica el iframe de YouTube vigente para LG Play, pero el `videoId` rota por programa/dia y el sitio responde `X-Frame-Options: SAMEORIGIN`; no registrar el video ID actual como `html_embed` porque queda obsoleto. El endpoint propio lee la pagina estable, extrae el iframe YouTube actual, normaliza el player oficial y devuelve `playerUrl`; si no encuentra iframe, BioPulse conserva el enlace a la fuente.
  Fuentes: https://www.lagaceta.com.ar/lgplay , https://www.youtube.com/@lagacetadetucuman

- Tucuman / Mia Tucuman 101.1: aplicada como `external_page` porque la pagina oficial declara streaming audiovisual por YouTube/Twitch y enlaza el canal `@MiaTucumanHD`, pero el endpoint YouTube `embed/live_stream?channel=UClSXlqO2N4rnRPc6H01eRxw` devolvio reproductor no disponible durante validacion. No promover a `html_embed` hasta hallar un embed estable o canal Twitch verificable.
  Fuentes: https://miatucuman.com.ar/ , https://www.youtube.com/@MiaTucumanHD

- La Pampa / CPEtv / VMF: aplicada como `html_embed` para la senal local de CPEtv Santa Rosa cuando la pagina oficial `CpeTvVivo` publica iframe `vmf.edge-apps.net/embed/live.php?streamname=cpetv1-100187&autoplay=true`. El HLS interno del player se mantiene dentro del reproductor oficial porque el host interno informado por VMF no resolvio directamente durante la validacion. Mantener allowlist estricta de host, ruta y `streamname`.
  Fuentes: https://www.cpe.coop.ar/CpeTvVivo , https://vmf.edge-apps.net/embed/live.php?streamname=cpetv1-100187&autoplay=true

- La Pampa / TVCO / Corpico / Sensa: aplicada como `stream_url` para la senal local de TVCO General Pico cuando la pagina oficial de Corpico publica HLS `cdn.sensa.com.ar/output/ARR/TVCOh/playlist.m3u8`. Validar master playlist, variante, CORS `*` y segmento MPEG-TS; registrar como senal local, no como camara fija garantizada.
  Fuentes: https://www.corpico.com.ar/tvco , https://cdn.sensa.com.ar/output/ARR/TVCOh/playlist.m3u8

- Jujuy / TRIBUNOtv / FM Sol Jujuy: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCncHTTKVMR4Sw7dVqQhVf9A`. TRIBUNOtv publica un endpoint `/api/status` con canales dinamicos y FM Sol Jujuy figuraba activo/en vivo con `videoId` vigente; usar `live_stream?channel` para no depender del video ID rotativo. Registrar como radio con camara/senal audiovisual local, no como camara fija garantizada.
  Fuentes: https://tribunotv.ar/ , https://tribunotv.ar/api/status , https://www.youtube.com/@FMSolJujuy

- Jujuy / TRIBUNOtv / El Tribuno de Jujuy y Jujuy FM: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los channel IDs publicados por la API publica de TRIBUNOtv (`UCMywWPYWcnMqkgIOdyeYgyA` y `UCqA6wLDYdEwRm3Q3Yu-rFHQ`). La API confirma canales activos, grilla y descripcion, aunque no estaban emitiendo en el momento de validacion. Registrar como senales locales disponibles cuando la fuente esta al aire, no como camaras 24/7. No incorporar desde TRIBUNOtv los canales nacionales o no territoriales del hub salvo que haya criterio territorial/evento explicito.
  Fuentes: https://tribunotv.ar/ , https://tribunotv.ar/api/status , https://www.youtube.com/@eltribunojujuy , https://www.youtube.com/@jujuyfm4979

- Jujuy / Canal 6 Libertador / Teleaudio S.A.: aplicada como `html_embed` usando el reproductor oficial de Twitch `player.twitch.tv/?channel=canal6libertador` publicado por `https://canalseis.com.ar/`. La pagina fuente declara programacion local, noticieros y programas en vivo para Libertador General San Martin / Ledesma, y muestra el iframe del canal; el embed y el canal Twitch responden 200. La preview publica de Twitch devolvio la imagen offline al momento de validacion, por eso registrarla como senal local disponible segun horario de la fuente, no como camara fija 24/7.
  Fuentes: https://canalseis.com.ar/ , https://www.twitch.tv/canal6libertador , https://dev.twitch.tv/docs/embed/

- Jujuy / Canal 13 Jujuy / Genex: aplicada como `stream_url` cuando la pagina oficial `https://www.canal13jujuy.com/` publico un reproductor Video.js con `https://genexservicios.com:19360/canal13jujuy/canal13jujuy.m3u8` y declaro transmision 24 hs via internet y aire. Validar HLS master, segmento MPEG-TS y CORS abierto; registrar como senal local, no como camara fija garantizada.
  Fuentes: https://www.canal13jujuy.com/ , https://genexservicios.com:19360/canal13jujuy/canal13jujuy.m3u8

- San Luis / San Luis+ / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UC2TE19Vc_rDQRMO5hnhqsQw`. El sitio oficial San Luis+ publica seccion `#vivo`, canal `@SanLuisMas` y enlaces a videos/live; Agencia San Luis documenta la multiplataforma y sus programas en vivo. La ruta `/live` no estaba emitiendo en el momento de validacion, por lo que debe tratarse como senal disponible cuando la fuente esta al aire, no como camara 24/7.
  Fuentes: https://sanluismas.com/#vivo , https://www.youtube.com/@SanLuisMas/live , https://agenciasanluis.com/2024/03/12/926364-san-luis-estrena-multiplataforma/

- Streamers.ar como radar de senales argentinas en vivo: usado solo como indice de descubrimiento y chequeo de `isLiveNow`, no como proveedor final. Cuando el endpoint publico `events_api` detecta una senal territorial actualmente viva, BioPulse registra la fuente primaria/YouTube correspondiente. En esta tanda se aplicaron Canal 8 San Juan, ELONCE Parana y El Siete TV Mendoza como `html_embed` de YouTube, etiquetadas como senales locales y no como camaras fijas garantizadas.
  Fuentes: https://streamers.ar/ , https://streamers.ar/events_api , https://www.sanjuan8.com/canal8sanjuan , https://www.elonce.com/envivo , https://www.elsietetv.com.ar/

- Las Lenas / StreamCastHD: aplicada como `html_embed` para la camara oficial de Las Lenas cuando la pagina publica expone el iframe de StreamCastHD. BioPulse usa el reproductor oficial con allowlist estricta de host/ruta, mantiene atribucion y conserva el enlace a la pagina oficial. No usar el HLS directo como fuente primaria si la playlist publica existe pero los segmentos actuales devuelven 404.
  Fuente: https://laslenas.com/camara-en-vivo/

- LU24 / Shockmedia: aplicada como `html_embed` para la camara publica del estudio de LU24 en Tres Arroyos cuando la pagina oficial publica el iframe `VideoPlayer/lu24am`. BioPulse usa el reproductor oficial, con allowlist estricta de host/ruta, sin copiar ni rehostear video.
  Fuentes: https://www.lu24.com.ar/camara-en-vivo/ , https://worldcam.eu/webcams/south-america/argentina/33660-tres-arroyos-radio-lu24

- El Diario de Pringles / RELTID / Montevision: aplicada como `stream_url` para senales territoriales publicas de Coronel Pringles, Monte Hermoso, Monte Hermoso Peatonal, Sierra de la Ventana y Necochea cuando la portada publica la seccion "Camaras exclusivas de Multimedios" con HLS. BioPulse reproduce HLS directo con allowlist de host/ruta y CORS verificado. La senal "Multimedios" se reviso pero no se aplico porque no identifica una camara territorial especifica.
  Fuente: https://eldiariodepringles.com.ar/

- Centros de montana y nieve con webcams oficiales: aplicados como `html_embed` cuando publican un reproductor oficial, como `image_url` cuando exponen una imagen directa estable, como `provider_api` cuando hace falta resolver dinamicamente la imagen publica mas reciente, o como `external_page` cuando solo corresponde abrir la fuente original. Aportan observacion visual de cielo, visibilidad, nieve, viento visible y condiciones de montana cercanas a zonas de bosque/interfase.
  Cerro Bayo queda aplicado como `html_embed` para 6 camaras oficiales porque la pagina publica iframes IPCamLive con alias estables y sin bloqueo de frame; no usar el JPG legacy porque apuntaba a una imagen vieja, no a una senal viva confiable. Cerro Castor debe seguir los iframes actuales publicados en su pagina `live.html`, porque los IDs de YouTube pueden rotar aunque mantengan los mismos puntos visuales.
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

- Windy fronterizo para cobertura argentina: cuando una camara Windy esta del otro lado de una frontera pero muestra infraestructura o condiciones visuales directamente vinculadas a una ciudad argentina, puede registrarse como cobertura territorial argentina si la descripcion deja claro el caracter fronterizo. Aplicado a Posadas / Encarnacion - Puente Internacional para Misiones, con coordenadas de la camara y `coverage.admin1` de Misiones para que aparezca en eventos cercanos a Posadas.
  Fuentes: https://www.windy.com/webcams/1736465230 , https://www.meteoblue.com/es/tiempo/webcams/posadas_argentina_3429886 , https://www.outdooractive.com/mobile/en/webcam/encarnacion-international-bridge-posadas-encarnacion/809290900/

- Misiones / Monitor Hidrologico Rio Uruguay: aplicada como `html_embed` para la camara en vivo Goio-En / Rio Uruguay publicada dentro del monitor oficial provincial de cuenca alta. Aunque el punto visual esta en Brasil, BioPulse la registra como senal fronteriza de contexto para Misiones porque la propia fuente oficial de Misiones la usa para monitoreo hidrologico regional. Se usa el iframe oficial de YouTube, con enlace al monitor como fuente primaria.
  Fuentes: https://sig.misiones.gob.ar/mapas/monitor/rio-uruguay/ , https://www.youtube.com/watch?v=2TOg3dXpMmE

- Circuito Online / Primera Edicion / YouTube: aplicada como `html_embed` para la camara publica en vivo del circuito comercial de Encarnacion y el Puente Internacional San Roque Gonzalez de Santa Cruz. Primera Edicion documenta que el sitio muestra varias camaras en tiempo real sobre Encarnacion y el puente; YouTube oEmbed confirma el video y autor `Circuito Online`. BioPulse la registra como senal fronteriza de contexto para Posadas y Misiones usando el reproductor oficial de YouTube, sin copiar ni rehostear video.
  Fuentes: https://www.primeraedicion.com.ar/nota/100722969/en-tiempo-real-la-cola-en-la-zona-comercial-de-encarnacion-y-el-puente/ , https://www.youtube.com/watch?v=5Edrx4xlx-Y

- Fenix Multiplataforma / Radio Fenix La Rioja: aplicada como `stream_url` para la senal local publicada en la portada oficial de Fenix951. La portada enlaza `https://hostingystreaming.net/fenixlarioja/`, que a su vez carga `https://hostradios.com.ar/fenixplayerchat/`; ese reproductor publica HLS `https://stmvideo3.livecastv.com/fenixrioja/fenixrioja/playlist.m3u8`. BioPulse usa allowlist exacta del host/ruta, con playlist maestra, variante y segmento MPEG-TS verificados con CORS abierto. Es una senal local de video, no una camara meteorologica dedicada.
  Fuentes: https://www.fenix951.com.ar/ , https://hostingystreaming.net/fenixlarioja/ , https://hostradios.com.ar/fenixplayerchat/

- Fuentes oficiales nacionales y municipales argentinas: aplicadas como `stream_url`, `html_embed` o `external_page` segun lo que la fuente publique. Incluye AGP / Argentina.gob.ar para Via Navegable Troncal, Municipalidad de Neuquen Capital, Municipalidad de Las Heras Santa Cruz, Municipalidad de Tandil y Comodoro Turismo. Las estaciones AGP de Bella Vista, San Lorenzo, Rosario, Del Guazu - Brazo Largo y Braga quedaron conectadas por HLS oficial con CORS verificado; su auditoria requiere certificados del sistema y soporte LL-HLS porque publican fragmentos `.m4s` en atributos `URI`. El 2026-08-08 se agregaron los angulos adicionales verificados de Bella Vista, Rosario, Del Guazu - Brazo Largo y Braga como camaras independientes, sin `groupKey` compartido, para que BioPulse no oculte vistas reales de una misma estacion; los dos angulos adicionales de San Lorenzo quedaron fuera porque las playlists publicadas respondieron 404 en la prueba. Neuquen Capital usa un relay HLS allowlisted de BioPulse porque sus playlists y segmentos responden, pero no publican CORS para reproducirlos desde otro dominio; BioPulse no almacena contenido y mantiene enlace/atribucion a la fuente oficial. Cuando una pagina agrupa varias camaras, BioPulse registra cada punto visual con URL hash para evitar deduplicacion tecnica y conservar distancia aproximada por punto.
  Fuentes: https://www.argentina.gob.ar/administracion-general-de-puertos-se/navegable-troncal/camaras-de-vigilancia , https://www.argentina.gob.ar/administracion-general-de-puertos-se/via-navegable-troncal/mapa-de-estaciones-meteorologicas-camaras , https://camaras.neuquencapital.gov.ar/ , https://municipiolasherassantacruz.gob.ar/camara-en-vivo/ , https://tandil.gov.ar/camara-vivo , https://comodoroturismo.gob.ar/en-vivo-comodoro-rivadavia/

- Caza y Pesca del Neuquen / Red de Camaras en vivo Fauna: aplicada como `stream_url` para 7 senales oficiales de Operativo Nieve en Ingreso Cerro Chapelco, Correntoso - Villa La Angostura, Primeros Pinos, Villa Pehuenia, Junin de los Andes, Lago Lolog y Rahue. La pagina oficial publica HLS `imoulife`; BioPulse valida playlist con CORS y segmentos MPEG-TS mediante GET. En esta fuente `HEAD` sobre segmentos puede devolver 404 falso-negativo, por lo que la validacion correcta debe probar descarga GET corta del segmento y byte inicial MPEG-TS `0x47`.
  Fuente: https://cazaypesca.neuquen.gob.ar/red_camara_fauna/

- Administracion General de Vialidad Provincial de Santa Cruz / monitoreo meteorologico: aplicada como `provider_api` para las 25 estaciones oficiales EM01-EM25. BioPulse resuelve la pagina oficial `https://www.agvp.gob.ar/estaciones/EMxx/EMxx.html`, detecta la hora publicada y muestra el JPG horario `Fotos/EMxx-AAAAMMDDHH.jpg` cuando esta disponible, con enlace y atribucion a AGVP. EM01, EM06, EM10, EM12, EM13, EM17 y EM23 fueron verificadas con snapshot JPEG real el 2026-07-24; el resto queda registrado desde la lista oficial y el provider falla de forma segura si una estacion no tiene imagen reciente.
  Fuente: https://www.agvp.gob.ar/servicios/monitoreo-meteorologico/

- Gesell.com.ar: aplicada como `stream_url` para 15 camaras publicas oficiales de Villa Gesell cuando la pagina de cada camara publica un reproductor Clappr con `/playlist.m3u8`. BioPulse reproduce HLS directo con allowlist de subdominios `cam*.gesell.com.ar`, mantiene atribucion y conserva el enlace a la pagina original. La camara "112 y Playa" habia sido revisada el 2026-07-17 y quedo fuera por 404, pero el 2026-08-08 volvio a responder con playlist, segmento MPEG-TS y CORS abierto, por eso se aplico. La camara `cam104.gesell.com.ar` queda titulada como "104 y Playa" segun metadatos actuales de OpenCCTV y el feed final de Gesell, sin duplicar el mismo HLS.
  Fuentes: https://gesell.com.ar/ , https://cam104.gesell.com.ar/ , https://cam104y3.gesell.com.ar/ , https://cam107norte.gesell.com.ar/ , https://cam107sur.gesell.com.ar/ , https://camaeropuerto.gesell.com.ar/ , https://camarco.gesell.com.ar/ , https://camarco2.gesell.com.ar/ , https://cambosque.gesell.com.ar/ , https://cambsasyplaya.gesell.com.ar/ , https://camfaro.gesell.com.ar/ , https://cammuelle.gesell.com.ar/ , https://cammuelle2.gesell.com.ar/ , https://camparroquia.gesell.com.ar/ , https://camplaza111.gesell.com.ar/ , https://cam112yplaya.gesell.com.ar/

- Telpin Comunidad: aplicada como `stream_url` para 9 camaras publicas de Pinamar, Ostende y Carilo cuando la pagina oficial publica la camara en su listado y las playlists HLS en Wowza/MistServer responden con CORS abierto, playlist maestra/media valida y segmento MPEG-TS real. BioPulse usa allowlist exacta de host/ruta, mantiene atribucion y conserva el enlace a la pagina fuente. La camara Hemingway / Carilo quedo promovida el 2026-08-10 porque Telpin la lista como camara en vivo y el HLS `camara-hemingway` respondio con playlist, variante y segmento reales; conservar tambien la entrada Estado del Mar como referencia externa independiente.
  Fuentes: https://telpin.com.ar/comunidad/ y https://telpin.com.ar/terminos-y-condiciones/

- I-Net Servicios de Red / YouTube: aplicada como `html_embed` para 3 camaras publicas en vivo de Santa Fe Capital descubiertas via GeoWebcams y verificadas contra YouTube. BioPulse registra Aristobulo del Valle 6726, Barrio Belgrano / Boneo 3050 y Barrio Los Troncos / Gorriti 6700 como puntos visuales independientes; YouTube oEmbed respondio 200 y las paginas `watch` mostraron `isLiveNow` / `isLiveContent` el 2026-08-08. GeoWebcams queda documentado como indice de descubrimiento, no como fuente a rehostear.
  Fuentes: https://www.youtube.com/watch?v=xnd182MFJ8s , https://www.youtube.com/watch?v=5qJkQ9yrnWo , https://www.youtube.com/watch?v=12sdQvZsavg , https://www.geowebcams.com/es/webcams/pais/argentina/categoria/ciudades-y-vida-urbana/

- GeoWebcams Argentina / YouTube discovery: aplicado como fuente de descubrimiento para 3 camaras publicas en vivo adicionales que no estaban cubiertas como feed exacto en BioPulse: Las Cuevas - Mendoza (Diario UNO), Claromeco - Playa La Bajada (Radio Claromeco) y Necochea CAM 2 (Nahuel Valentini). Se registran con fuente primaria YouTube, no con rehost de GeoWebcams; oEmbed respondio 200 y las paginas `watch` mostraron `isLiveNow` / `isLiveContent` el 2026-08-08. Claromeco y Necochea conviven con camaras previas porque aportan feed/angulo independiente.
  Fuentes: https://www.youtube.com/watch?v=Vox_qgF8TUQ , https://www.youtube.com/watch?v=SzveEm5Y4oc , https://www.youtube.com/watch?v=FqgTC1hW2TE , https://www.geowebcams.com/es/webcams/pais/argentina/

- Estacion Meteorologica Daireaux / Deroweb: aplicada como `html_embed` para la camara meteorologica publica de Daireaux. La pagina oficial publica un iframe de YouTube `live_stream?channel=UCEqH1DHacLT-p5hyTZgi9XA`, coordenadas `-36.59756, -61.74675`, historial de timelapses y advertencia de uso. BioPulse usa el embed oficial del canal para resistir reinicios del vivo, mantiene atribucion y no copia ni rehostea video.
  Fuentes: https://meteo.deroweb.com.ar/camara_vivo_daireaux.php , https://www.youtube.com/channel/UCEqH1DHacLT-p5hyTZgi9XA/live

- MeteoTandil / Twitch: aplicada como `html_embed` para la camara meteorologica publica de Tandil publicada en la pagina de MeteoTandil. La fuente usa `player.twitch.tv` con el canal `camaraenvivotandil`; BioPulse conserva el canal y reescribe el parametro `parent` en runtime mediante el helper de Twitch para que funcione en local y en produccion. La pagina, el embed y el preview live de Twitch respondieron 200 el 2026-08-08.
  Fuentes: https://meteotandil.com.ar/index.htm , https://www.twitch.tv/camaraenvivotandil

- Estado del Mar: aplicada como `external_page` para ampliar cobertura costera y meteorologica con camaras publicas en vivo de Mar del Plata, Costa Atlantica bonaerense, Caleta Olivia, Caleta Cordova y Las Grutas. Aunque varias paginas publican iframes de video, sus terminos vigentes indican que los datos/servicios no se pueden usar en software propio, apps o paginas propias salvo aceptacion expresa. BioPulse mantiene enlace a la pagina original y atribucion hasta conseguir permiso formal; el auditor marca estos casos como `external_visual_permission_required` en vez de promoverlos a `html_embed`.
  Fuentes: https://estadodelmar.com.ar/ y https://estadodelmar.com.ar/terminos-y-condiciones/

## Fuentes alternativas

Cuando varias camaras muestran una misma esquina, zona o paisaje desde angulos cercanos, BioPulse debe conservarlas como observaciones independientes: esos angulos multiples ayudan a interpretar humo, visibilidad, viento, transito y contexto territorial. `groupKey` queda reservado para duplicados tecnicos o el mismo feed exacto servido por mas de una fuente, no para escenas parecidas.

## Fuentes revisadas, no aplicadas aun

- ALERTCalifornia / ALERTWildfire / HPWREN: modelo muy relevante para incendios y camaras PTZ, pero centrado en California/EE.UU. No cubre Argentina para el MVP actual. Puede inspirar una futura capa de redes oficiales de incendio.
  Fuentes: https://alertcalifornia.org/ , https://www.alertwildfire.org/ , https://www.hpwren.ucsd.edu/

- FAA WeatherCams y National Park Service: fuentes oficiales utiles como patron para camaras meteorologicas/parques, pero sin cobertura argentina para este MVP.
  Fuentes: https://weathercams.faa.gov/ y https://www.nps.gov/subjects/developer/api-documentation.htm

- Vialidad Nacional / estado de rutas y SIG Vial: revisados como fuente vial oficial argentina. Aportan estado de rutas, mapas y referencias a sensores/camaras en obras o corredores, pero no se encontro una red publica nacional de feeds visuales enlazable para el registro de Camaras. Rechequeado el 2026-08-08 contra Argentina.gob.ar / Vialidad Nacional, SIG Vial, ANSV y Corredores Viales; no usar directorios privados como fuente final sin confirmar operador y permisos.
  Fuentes: https://www.argentina.gob.ar/transporte/vialidad-nacional/estado-de-rutas y https://www.argentina.gob.ar/transporte/vialidad-nacional/sig-vial

- Mar del Sud / YouTube: revisado como candidato costero municipal/cooperativo por nota publica sobre stream de camaras. El canal `UCBeVyugrRCdu9TYwQlf1aLQ` no mostro `isLiveNow` activo al momento de validacion, por eso no se aplico como `html_embed` todavia.
  Fuentes: https://eldiariodemiramar.com.ar/2026/04/mar-del-sud-inauguro-su-centro-de-monitoreo-y-habilito-un-stream-con-imagenes-de-la-ciudad/ , https://www.youtube.com/@MarDelSud-2026

- Santiago del Estero / Gobierno provincial: aplicada solo como `external_page` porque la pagina oficial `sde.gob.ar/en-vivo/` existe y lista transmisiones/videos del canal de YouTube del Gobierno, pero la ruta `/live` del canal y los videos revisados no mostraron un vivo actual continuo al momento de validacion. No promover a `html_embed` hasta detectar una emision activa o una ruta estable que no deje el panel en negro.
  Fuentes: https://sde.gob.ar/en-vivo/ , https://www.youtube.com/@gobiernodesantiagodelestero/live

- Canal 7 Santiago del Estero / Diario Panorama / Arcast: aplicada como `stream_url` cuando la pagina publica de Diario Panorama `https://www.diariopanorama.com/contenidos/noticiero7envivo-38.html` expuso iframe `https://arcast.com.ar/castv` y el player publico expuso HLS `https://stream.arcast.com.ar/envivo/castv/playlist.m3u8`. BioPulse usa allowlist exacta de host/ruta, con playlist maestra, variante y segmento MPEG-TS verificados con CORS abierto. Registrar como senal local audiovisual, no como camara fija garantizada, porque puede alternar estudio, noticias, moviles y camaras locales.
  Fuentes: https://www.diariopanorama.com/contenidos/noticiero7envivo-38.html , https://arcast.com.ar/castv

- RDM TV Santiago del Estero / Shockmedia: revisado como candidato local adicional el 2026-08-08. La pagina `https://rdmsantiago.com.ar/tv/` publica iframe `https://videostream.shockmedia.com.ar:2000/VideoPlayer/rdmtv`, pero ese player respondio `Service ID not provided` aun con `Referer` oficial, y las rutas HLS candidatas de `rdmtv` devolvieron 404. No aplicar hasta que el player oficial vuelva a exponer HLS o embed reproducible.
  Fuentes: https://rdmsantiago.com.ar/tv/ , https://videostream.shockmedia.com.ar:2000/VideoPlayer/rdmtv

- Santiago del Estero / Radio Panorama y Canal 7: revisados como candidatos locales. El indice publico describe "En Vivo por Youtube" y Noticiero 7, pero la pagina `radiopanorama.com.ar` entrego una verificacion anti-bot al validador, sin HTML de player comprobable; Canal 7 Santiago del Estero no mostro `/live` activo durante la prueba. No aplicar como embed hasta obtener una URL verificable.
  Fuentes: https://radiopanorama.com.ar/ , https://www.youtube.com/@canal7santiagodelestero/live

- Canal 8 Catamarca / Arcast: revisado como candidato adicional. La pagina `https://arcast.net/c8/` se identifica como "Catamarca Canal 8" y expone `https://stream.arcast.com.ar/c8/c8/playlist.m3u8`, pero la playlist devolvio 404 durante la prueba. No aplicar hasta que el HLS responda con playlist y segmento reales.
  Fuentes: https://arcast.net/c8/ , https://stream.arcast.com.ar/c8/c8/playlist.m3u8

- Canal 4 Jujuy / El Cuatro: revisado como candidato local adicional para San Salvador de Jujuy. La pagina oficial existe y la ficha de Google Play declara transmision en vivo 24 hs, pero el endpoint web `https://canal4jujuy.elcuatro.com/player/status?device=web` respondio `{"status":"disabled"}` el 2026-07-29 y otra vez el 2026-08-08. La ruta `/player` expuso `https://5cd577a3dd8ec.streamlock.net/CAMARAS/live/playlist.m3u8`, con playlist, variante y segmento MPEG-TS validos, pero no aplicar mientras el endpoint oficial de publicacion siga deshabilitado para web.
  Fuentes: https://canal4jujuy.elcuatro.com/ , https://play.google.com/store/apps/details?id=com.elcuatro.canal4jujuy

- Canal 2 Jujuy / Fiberway: revisado como candidato local el 2026-08-08. El sitio oficial `https://canal2jujuy.com/canal2/vivo/` publica un evento de Livestream/Vimeo y un iframe de YouTube, pero el player Livestream redirigio a una pagina comercial de Vimeo y los IDs de YouTube publicados no respondieron por oEmbed. No aplicar hasta encontrar un embed actual verificable o un canal YouTube live estable.
  Fuentes: https://canal2jujuy.com/canal2/vivo/ , https://livestream.com/accounts/679322/events/3782013

- APN / Centro de Formacion y Capacitacion en Areas Protegidas / Estacion 6: revisada como posible fuente de Parques Nacionales. La pagina `https://www.capacitacionapn.gob.ar/estacion6/` publica un iframe de YouTube `tH753dA2dvE` y una imagen historica del Cerro Pistarini, pero no es una webcam operativa ni un vivo verificable. No registrar en Camaras salvo que APN publique una senal visual actual.
  Fuentes: https://www.capacitacionapn.gob.ar/estacion6/

- Lateplay / Canal 9 La Rioja historico: revisado como candidato desde `lateplay.larioja.gob.ar/canal-9/`; la pagina publica un widget Elementor apuntando a YouTube `zGDFohQyZgk`, pero YouTube respondio `playabilityStatus=ERROR` porque la cuenta asociada fue cerrada. No aplicar ese embed; usar en cambio el sitio actual `radioytelevisionriojana.com.ar/canal9/` y su HLS vigente.
  Fuentes: https://lateplay.larioja.gob.ar/canal-9/ , https://radioytelevisionriojana.com.ar/canal9/

- San Luis / SDN y San Luis TV legado: SDN fue revisado desde la nota "en vivo 24 horas", pero el video `jBjG37tMtiM` devolvio oEmbed 404 y `playabilityStatus=ERROR`; no aplicar hasta hallar el canal/ruta vigente. El dominio historico `sanluistv.com` no se debe usar como fuente del canal provincial sin verificacion adicional porque hoy no presenta el sitio oficial historico esperado; usar San Luis+ / San LuisMas como fuente provincial actual.
  Fuentes: https://serviciodenoticias.net/servicio-de-noticias-en-vivo-24-horas/ , https://sanluismas.com/#vivo

- CECARA / CONICET / Aguila Coronada La Pampa: revisado como camara ambiental de conservacion. YouTube oEmbed confirma videos embebibles de CECARA, pero el proyecto Yupanqui no estaba `isLiveNow` y las fuentes publicas indican que el ciclo del streaming cientifico se cumplio despues del primer vuelo del pichon. No registrar como camara viva hasta que CECARA abra una transmision actual.
  Fuentes: https://www.cecara.com.ar/ , https://opcionrural.com.ar/2026/03/12/cientificos-argentinos-transmiten-en-vivo-la-intimidad-de-las-aguilas/ , https://www.infobae.com/sociedad/2026/03/17/el-primer-vuelo-de-yupanqui-el-stream-del-conicet-transmitio-en-vivo-el-crecimiento-de-un-pichon-de-aguila-en-la-pampa/ , https://www.youtube.com/watch?v=jddLOlK1cAk

- Playas Doradas / YouTube: revisado como fuente costera oficial de Rio Negro. La pagina declara camara web 24/7 por YouTube y advierte posibles interrupciones por periodo de prueba, pero los streams publicados en `@PlayasDoradasAR` no estaban `isLiveNow` durante la validacion del 2026-08-08. No registrar hasta detectar un vivo activo para evitar reproductores negros.
  Fuentes: https://playasdoradas.com.ar/vivo/ , https://www.youtube.com/@PlayasDoradasAR/streams

- UNLaR TV / Universidad Nacional de La Rioja / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UC3ofHPSRXllhyYuTISRkeAw`. La pagina oficial de la universidad identifica UNLaR TV, enlaza el canal oficial, playlists y "Transmisiones en Vivo". Registrar como senal institucional/local disponible cuando la fuente emite, no como camara fija 24/7.
  Fuentes: https://www.unlar.edu.ar/index.php/medios/unlar-tv , https://www.youtube.com/channel/UC3ofHPSRXllhyYuTISRkeAw

- UNSL TV / Universidad Nacional de San Luis / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCZZWwoQL1ZpRU-8hdsrUpew`. La app oficial `tv.unsl.edu.ar` publica la identidad UNSL TV y referencia el canal de YouTube; BioPulse usa solo el embed oficial por canal y no copia la API usada internamente por la app.
  Fuentes: http://tv.unsl.edu.ar/ , https://www.youtube.com/channel/UCZZWwoQL1ZpRU-8hdsrUpew

- Formosa / Canal 23 Formosa / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCLhBOPrfgpb4N00DZB5GI4A`. El canal publico `@canal23formosa` fue identificado desde busqueda de YouTube, oEmbed confirmo autor "Canal 23 Formosa" y el endpoint live_stream respondio 200. Registrar como senal local, no como camara fija 24/7. El dominio historico `canal23formosa.com.ar` no resolvio DNS durante la validacion.
  Fuentes: https://www.youtube.com/@canal23formosa , https://www.youtube.com/embed/live_stream?channel=UCLhBOPrfgpb4N00DZB5GI4A

- Formosa / Canal 7 Formosa / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCgVnImiV94StEjm-NHll0KA`. La busqueda publica de YouTube mostro transmisiones recientes/en vivo de "Canal 7 Formosa", oEmbed confirmo autor `Canal 7 Formosa` y el endpoint live_stream respondio 200. No confundir con Canal 7 Ibarreta: ese sitio oficial fue revisado y en portada publica principalmente audio FM, por lo que queda fuera de este lote.
  Fuentes: https://www.youtube.com/@canal7formosa105 , https://www.youtube.com/embed/live_stream?channel=UCgVnImiV94StEjm-NHll0KA

- CPA UNLPam / Universidad Nacional de La Pampa / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCPPX4q7rCLL9gj7MI5Uscdg`. La plataforma oficial `tv.unlpam.edu.ar` publica el canal de YouTube del CPA UNLPam y una seccion "En Vivo"; el canal `@CPAUNLPam` y el endpoint live_stream respondieron 200. Registrar como senal institucional/local disponible cuando la fuente emite, no como camara fija 24/7.
  Fuentes: https://tv.unlpam.edu.ar/ , https://www.youtube.com/@CPAUNLPam

- Medios UNT / Universidad Nacional de Tucuman / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCzE2-vSVDB9lOXrhVfEdhTQ`. La portada oficial de la UNT enlaza `@mediosuntoficial`; el canal de YouTube resolvio a ID `UCzE2-vSVDB9lOXrhVfEdhTQ` y el endpoint live_stream respondio 200. Registrar como senal institucional/local disponible cuando la fuente emite, no como camara fija 24/7.
  Fuentes: https://www.unt.edu.ar/ , https://www.youtube.com/@mediosuntoficial

- Santiago del Estero / Radio Panorama 100.1 / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCCIr6Ilt39hLsXgjmvPueaw`. El canal publico `@RadioPanorama100.1` resolvio a ese ID; Diario Panorama documenta coberturas en vivo de Radio Panorama y el endpoint live_stream respondio 200. Registrar como senal local independiente de Canal 7 / Diario Panorama HLS.
  Fuentes: https://www.youtube.com/@RadioPanorama100.1 , https://www.diariopanorama.com/noticia/523976/celebra-472-anos-santiago-vivo-segui-vigilia-desfile-festival-diario-panorama

- Santiago del Estero / Panorama Play / Diario Panorama / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCg1eZDppU-NZ5zISl4xIe0w`. La referencia publica de Diario Panorama apunta a `youtube.com/user/diariopanoramacom`, que resolvio como canal `Panorama Play`; el endpoint live_stream respondio 200. Mantenerlo como senal local distinta de Canal 7 HLS y Radio Panorama.
  Fuentes: https://www.youtube.com/user/diariopanoramacom , https://www.diariopanorama.com/noticia/523976/celebra-472-anos-santiago-vivo-segui-vigilia-desfile-festival-diario-panorama

- Salta / Gobierno de Salta / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCjdyNlQZo44LzlRwMmGzpig`. La web oficial del Gobierno de Salta enlaza `GobiernodeSaltaOficial`, una nota oficial publica transmisiones en vivo por YouTube y el canal resolvio a `@GobiernodeSaltaOficial`; el endpoint live_stream respondio 200. Registrar como senal institucional disponible cuando la fuente emite.
  Fuentes: https://www.salta.gob.ar/prensa/noticias/dialogosgob-cristina-fiore-viniuales-sera-entrevistada-sobre-la-gestion-en-educacion-cultura-ciencia-y-tecnologia-102723 , https://www.youtube.com/@GobiernodeSaltaOficial

- Salta / Concejo Deliberante / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UC7DOA9nw77PPQgNHOyz-Iww`. El sitio oficial del Concejo enlaza `@ConcejoSalta`, una nota oficial indica seguimiento de sesiones por su canal de YouTube y el endpoint live_stream respondio 200. Registrar como senal institucional disponible cuando la fuente emite.
  Fuentes: https://cdsalta.gob.ar/index.php/2026/04/01/se-realiza-esta-tarde-una-nueva-sesion-ordinaria-del-presente-periodo-legislativo-del-cd-23/ , https://www.youtube.com/@ConcejoSalta

- Catamarca / Poder Judicial / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCotB-rJ-SnmSgTKTEAln4SA`. El sitio oficial del Poder Judicial enlaza `@PoderJudicialCatamarca` y documenta transmisiones en vivo por el canal oficial de YouTube; el endpoint live_stream respondio 200. Registrar como senal institucional disponible cuando la fuente emite.
  Fuentes: https://juscatamarca.gob.ar/event/inicia-un-nuevo-juicio-por-jurados-en-la-oficina-de-gestion-de-audiencias/ , https://www.youtube.com/@PoderJudicialCatamarca

- Catamarca / Cultura Catamarca / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UClvQGfbj1T_ofautTOYAaEg`. El canal `@culturacatamarca` se identifica como Ministerio de Cultura, Turismo y Deporte Catamarca; distintas referencias publicas sobre Poncho/Ponchito indican transmisiones en vivo por ese canal y el endpoint live_stream respondio 200. Registrar como senal institucional/cultural disponible cuando la fuente emite.
  Fuentes: https://www.youtube.com/@culturacatamarca , https://inforama.com.ar/actualidad/2026/07/17/el-poncho-se-transmitira-en-vivo-se-podran-ver-los-shows-de-los-artistas-nacionales/ , https://www.youtube.com/@culturacatamarca/streams

- San Juan / Xama TV / Universidad Nacional de San Juan: aplicada como `html_embed` usando la pagina oficial `https://xama.tv/`, que publica seccion `EN VIVO`, stream propio y datos de contacto del canal UNSJ. El sitio respondio 200 sin `X-Frame-Options` ni CSP que bloquee iframe; BioPulse allowlistea solo `https://xama.tv/` y no reproduce el FLV directo. Registrar como senal publica universitaria/local, no como camara fija 24/7.
  Fuentes: https://xama.tv/ , https://www.unsj.edu.ar/home/noticias_detalles/5426/2 , https://www.unsj.edu.ar/en/home/noticias_detalles/6069/2

- La Rioja / Independiente TV / Medios El Independiente: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UC4o_yFUklFwv6zz9Peh0fMA`. La pagina de El Independiente documenta Radio Independiente 99.1, streaming, AAP y el canal de YouTube Independiente TV; busqueda publica de YouTube resolvio el canal `Independiente TV` con ese ID y el endpoint live_stream respondio 200. Registrar como senal local disponible cuando la fuente emite.
  Fuentes: https://www.elindependiente.com.ar/pagina.php?id=344116 , https://www.youtube.com/@independientetv772

- Salta / El Tribuno Salta / YouTube: aplicada como `html_embed` usando YouTube `embed/live_stream?channel=UCTYpmn1630BfqLH2jmVYzAg`. El canal publico `@eltribunodigital` corresponde a El Tribuno Salta y el endpoint live_stream respondio 200. Registrar como senal local disponible cuando la fuente emite, independiente de Gobierno de Salta, Concejo Salta, Canal 7 y PUE!.
  Fuentes: https://www.youtube.com/@eltribunodigital , https://www.eltribuno.com/ttag/el-tribuno

- Formosa / Gobierno, Camara de Diputados y Poder Judicial / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@GobiernodeFormosaOficial`, `@camaradediputadosdeformosa7836` y `@PoderJudicialFormosaOficial`. La web oficial de Legislatura publica iframe de YouTube y el sitio del Poder Judicial enlaza su canal; los tres endpoints live_stream respondieron 200. Registrar como senales institucionales disponibles cuando la fuente emite, no como camaras fijas 24/7.
  Fuentes: https://www.youtube.com/@GobiernodeFormosaOficial , https://www.legislaturaformosa.gob.ar/ , https://www.jusformosa.gob.ar/index.php/index.php

- La Pampa / Gobierno, Legislatura y Poder Judicial / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@gobiernodelapampa2831`, `@legislaturalapampa` y `@poderjudicialdelapampa`. La web oficial provincial lista Gobierno, Poder Legislativo y Poder Judicial como sitios institucionales, y los endpoints live_stream respondieron 200. No duplicar TVPP/Canal 3 porque BioPulse ya tiene esa senal por HLS.
  Fuentes: https://www.lapampa.gob.ar/ , https://camaradediputados.lapampa.gob.ar/ , https://justicia.lapampa.gob.ar/ , https://www.youtube.com/@gobiernodelapampa2831 , https://www.youtube.com/@legislaturalapampa , https://www.youtube.com/@poderjudicialdelapampa

- San Luis / Poder Judicial, Camara de Diputados, Municipalidad de San Luis y Agencia San Luis / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@PoderJudicialSanLuis`, `@dipusanluis`, `@MunicipalidaddeSanLuisoficial` y `@agencia.sanluis`. Los cuatro endpoints live_stream respondieron 200 y se registran como senales locales/institucionales disponibles cuando la fuente emite.
  Fuentes: https://www.youtube.com/@PoderJudicialSanLuis , https://www.youtube.com/@dipusanluis , https://www.youtube.com/@MunicipalidaddeSanLuisoficial , https://www.youtube.com/@agencia.sanluis

- Tucuman / Legislatura, Poder Judicial, Gobierno y Canal 5 / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@legislaturatucuman951`, `@ComunicacionPublicaCSJT`, `@prensatucuman` y `@canal5tucuman`. La pagina oficial de Sesiones Online de la Legislatura publica transmision en directo, el Poder Judicial documenta su canal de Comunicacion Publica, y referencias publicas del Gobierno provincial indican transmision por `@prensatucuman`; los cuatro endpoints live_stream respondieron 200. Registrar como senales disponibles cuando la fuente emite.
  Fuentes: https://www.legislaturadetucuman.gob.ar/sesionOnline , https://www.justucuman.gov.ar/direccion-comunicacion/quienes-somos , https://www.youtube.com/@prensatucuman , https://www.youtube.com/@canal5tucuman

- Corrientes / Gobierno, Poder Judicial y Diputados / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@GobiernodeCorrientess`, `@canaloficial-poderjudicial8777` y `@c.diputadosdecorrientes`. Los tres endpoints live_stream respondieron 200. Registrar como senales institucionales disponibles cuando la fuente emite.
  Fuentes: https://www.youtube.com/@GobiernodeCorrientess , https://www.youtube.com/@canaloficial-poderjudicial8777 , https://www.youtube.com/@c.diputadosdecorrientes

- Entre Rios / Gobierno, Diputados, Senado y Poder Judicial / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@GobiernoER`, `@C%C3%A1maradeDiputadosEntreRios`, `@senadoerntrerios` y `@prensajuser`. Los cuatro endpoints live_stream respondieron 200. Registrar como senales institucionales disponibles cuando la fuente emite.
  Fuentes: https://www.youtube.com/@GobiernoER , https://www.youtube.com/@C%C3%A1maradeDiputadosEntreRios , https://www.youtube.com/@senadoerntrerios , https://www.youtube.com/@prensajuser

- Misiones / Gobierno y Camara de Representantes Digital / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@GobiernodeMisiones-z8y` y `@camaraderepresentantesdigi6763`. Los dos endpoints live_stream respondieron 200. Se descartaron resultados homonimos de Paraguay o nacionales. Registrar como senales institucionales disponibles cuando la fuente emite.
  Fuentes: https://www.youtube.com/@GobiernodeMisiones-z8y , https://www.youtube.com/@camaraderepresentantesdigi6763

- San Juan / Servicio Informativo del Gobierno, Camara de Diputados y Poder Judicial / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@sisanjuanok`, `@camaradediputadosdesanjuan660` y `@poderjudicialdesanjuan1880`. Los tres endpoints live_stream respondieron 200. Registrar como senales institucionales disponibles cuando la fuente emite.
  Fuentes: https://www.youtube.com/@sisanjuanok , https://www.youtube.com/@camaradediputadosdesanjuan660 , https://www.youtube.com/@poderjudicialdesanjuan1880

- Catamarca / Gobierno, Senado y Catamarca Capital / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@GobiernodeCatamarca`, `@senadodecatamarca` y `@CatamarcaCapital`. Los tres endpoints live_stream respondieron 200. No duplicar Camara de Diputados porque BioPulse ya tiene Canal Parlamentario Catamarca con ese canal.
  Fuentes: https://www.youtube.com/@GobiernodeCatamarca , https://www.youtube.com/@senadodecatamarca , https://www.youtube.com/@CatamarcaCapital

- Jujuy / Gobierno, Legislatura y Poder Judicial / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@GobiernodeJujuyOK`, `@legislaturadejujuy7305` y `@PrensaJusticiaJujuy`. Los tres endpoints live_stream respondieron 200. Registrar como senales institucionales disponibles cuando la fuente emite.
  Fuentes: https://www.youtube.com/@GobiernodeJujuyOK , https://www.youtube.com/@legislaturadejujuy7305 , https://www.youtube.com/@PrensaJusticiaJujuy

- La Rioja / Gobierno, Legislatura y Funcion Judicial / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@gobiernodelariojaargentina`, `@legislaturalr` y `@funcionjudiciallarioja5851`. Los tres endpoints live_stream respondieron 200. Registrar como senales institucionales disponibles cuando la fuente emite.
  Fuentes: https://www.youtube.com/@gobiernodelariojaargentina , https://www.youtube.com/@legislaturalr , https://www.youtube.com/@funcionjudiciallarioja5851

- Santiago del Estero / Poder Judicial y Santiago Ciudad / YouTube: aplicadas como `html_embed` usando YouTube `embed/live_stream` con los canales `@oficinadeprensapoderjudici5280` y `@santiagociudad7009`. El canal Santiago Ciudad fue referenciado publicamente como canal del municipio capitalino de Santiago del Estero; ambos endpoints live_stream respondieron 200. La busqueda "Legislatura Tv" fue descartada porque el canal canonico era `@LegislaturaTVMendoza`, no Santiago del Estero.
  Fuentes: https://www.youtube.com/@oficinadeprensapoderjudici5280 , https://www.youtube.com/@santiagociudad7009 , https://www.lv12.com.ar/dia/rinden-homenaje-jorge-veliz-el-dia-la-guaracha-santiaguena-n176722

- EarthCam, Surfline, WeatherBug, Pano AI y redes privadas/comerciales: no usar sin API, permiso explicito o terminos compatibles.

## Regla de implementacion

- `provider_api`: cuando hay API documentada y permiso de uso.
- `html_embed`: cuando la fuente primaria publica un reproductor oficial embebible compatible con sus terminos.
- `image_url`: cuando existe una imagen publica directa y el uso esta permitido.
- `stream_url`: cuando el HLS directo es publico, estable y reproducible desde BioPulse. Validar master playlist, media playlist, al menos un segmento real y CORS.
- Relay HLS allowlisted: cuando una fuente oficial o publica permite ver el stream y expone playlists/segmentos reales, pero no publica CORS para otros dominios. El relay debe aceptar solo hosts/rutas/camaras conocidas, reescribir playlists y segmentos, no almacenar contenido, mantener atribucion y enlace a la fuente, y reproducirse con `hls.js` antes que con HLS nativo.
- `external_page`: cuando la camara es publica para observar, pero no se deben copiar frames ni embeber contenido.
- `pending`: cuando falta revisar terminos, estabilidad tecnica o cobertura territorial.
