# BioPulse Fire MVP Correction Plan

## Orden de prioridad

1. Alertas de evacuacion
   - Una alerta oficial de evacuacion para el lugar tiene prioridad maxima aunque el evento abierto sea de otra categoria o tenga severidad baja.
   - No activar sirena por textos genericos como "emergencia", "alerta naranja", "refugio", "crecida" o recomendaciones de mochila.
   - Exigir lenguaje explicito: evacuacion, evacuar, orden de evacuacion, desalojo preventivo, centro de evacuados o equivalentes.
   - Mantener separadas fuente oficial, evidencia satelital e interpretacion BioPulse.
   - Paso fijado antes de avanzar a Noticias/Radios: conectar un feed normalizado de evacuaciones oficiales criticas que alimente el mapa sin abrir eventos uno por uno.
   - Alcance minimo de ese feed:
     - Alert-Hub / SMN CAP Argentina como base ya conectada.
     - Fuentes provinciales/municipales de Defensa Civil o gobiernos locales cuando tengan RSS, API, HTML estable o comunicados parseables.
     - Parques Nacionales, Vialidad Nacional/Provincial y municipios solo cuando emitan evacuacion, cortes por emergencia o centros de evacuados.
     - Dedupe por fuente, id, vigencia, zona y texto para no duplicar una misma orden.
     - Salida unica: marcadores `official_evacuation` en el mapa, contador OFFICIAL EVAC, enlace a fuente, vigencia y limitaciones.
   - Criterio de avance: no considerar completa la seccion de alertas oficiales hasta que BioPulse pueda mostrar esas senales criticas antes de que el usuario encuentre cada evento manualmente.

2. Camaras en vivo
   - Priorizar video o visual util por sobre cercania pura.
   - Orden sugerido: stream HLS, embed oficial/YouTube, snapshot/API, imagen fija, link externo.
   - Si el radio inicial no encuentra camaras, mostrar la referencia regional mas cercana y sugerir el radio minimo que la incluye.
   - No descartar camaras por solapamiento territorial; cada angulo suma.

3. Noticias y comunicados
   - Separar tres carriles: comunicados oficiales locales, noticias regionales, antecedentes historicos.
   - No mezclar alertas meteorologicas, satelites ni camaras dentro de Noticias.
   - Relacionar por lugar, fecha, tipo de evento y lenguaje de emergencia; descartar resultados inmobiliarios, empleo, obras o ruido tematico.
   - Mostrar siempre fuente, fecha, distancia/contexto y motivo de vinculacion.

4. Radios y frecuencias
   - Estudiar fuentes posibles: radios locales online, Defensa Civil, bomberos, VHF/AM/FM publicas cuando su uso sea legal y abierto.
   - Registrar emisora, cobertura, URL/stream, jurisdiccion, horario, tipo de contenido y limitaciones.
   - Usarlas como triangulacion contextual, no como orden oficial salvo que la propia autoridad emita el mensaje por ese canal.

5. Validacion por escena
   - Probar cada cambio con Anelo/Neuquen.
   - Preguntas obligatorias: que ve el usuario, que fuente lo respalda, que no sabemos, que camara se puede ver, que accion segura sugiere BioPulse.
