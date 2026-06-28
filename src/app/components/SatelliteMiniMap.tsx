import { useEffect, useMemo, useRef } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import { Crosshair, LocateFixed, Minus, Plus } from "lucide-react";

export type SatelliteRasterLayer = {
  id: string;
  label: string;
  plainLabel: string;
  description: string;
  whatYouSee: string;
  whyItMatters: string;
  limitations: string;
  guardianHint: string;
  matrixSet: string;
  format: "jpg" | "png";
  maxZoom: number;
};

export const SATELLITE_RASTER_LAYERS: SatelliteRasterLayer[] = [
  {
    id: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    label: "Color real",
    plainLabel: "Vista parecida al ojo humano",
    description: "Vista visible aproximada. Puede quedar cubierta por nubes o humo.",
    whatYouSee: "Una imagen similar a una fotografía tomada desde el satélite.",
    whyItMatters: "Ayuda a ubicar nubes, humo visible, ríos, vegetación, ciudades y cambios grandes en el terreno.",
    limitations: "No muestra focos térmicos invisibles ni confirma daño en superficie. Las nubes pueden tapar la zona.",
    guardianHint: "Usala para orientarte visualmente y comparar si la zona del evento coincide con señales visibles.",
    matrixSet: "GoogleMapsCompatible_Level9",
    format: "jpg",
    maxZoom: 9,
  },
  {
    id: "VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1",
    label: "Falso color",
    plainLabel: "Colores para revelar diferencias",
    description: "Combinación útil para distinguir humo, agua, vegetación y zonas quemadas.",
    whatYouSee: "Una imagen con colores no naturales que resalta diferencias entre agua, vegetación, suelo, humo y áreas quemadas.",
    whyItMatters: "Puede revelar detalles que en color real pasan desapercibidos, especialmente cicatrices de fuego o contrastes de humedad.",
    limitations: "Los colores no son reales. Requiere comparación con otras capas para evitar interpretar de más.",
    guardianHint: "Buscá cambios de textura o contraste cerca del foco, pero registralos como indicios, no como confirmación.",
    matrixSet: "GoogleMapsCompatible_Level9",
    format: "jpg",
    maxZoom: 9,
  },
  {
    id: "VIIRS_SNPP_Brightness_Temp_BandI5_Day",
    label: "Temperatura brillo",
    plainLabel: "Señal térmica del satélite",
    description: "Señal térmica diurna de banda I5. No equivale a temperatura ambiente.",
    whatYouSee: "Una lectura térmica captada por el sensor satelital en una banda infrarroja.",
    whyItMatters: "Ayuda a interpretar zonas relativamente calientes y a complementar las detecciones FIRMS.",
    limitations: "No es temperatura del aire, no mide oxígeno y no confirma por sí sola que haya fuego activo.",
    guardianHint: "Comparala con FRP, hora de observación y detecciones FIRMS antes de sacar conclusiones.",
    matrixSet: "GoogleMapsCompatible_Level9",
    format: "png",
    maxZoom: 9,
  },
  {
    id: "VIIRS_SNPP_AOD_Dark_Target_Land_Ocean",
    label: "Aerosoles",
    plainLabel: "Partículas en el aire",
    description: "Espesor óptico de aerosoles. Puede ayudar a leer humo o partículas, con cobertura parcial.",
    whatYouSee: "Una estimación de partículas suspendidas en la atmósfera, como humo, polvo o contaminación.",
    whyItMatters: "En incendios puede ayudar a seguir plumas de humo o aire cargado de partículas.",
    limitations: "No distingue automáticamente humo de polvo o contaminación. Puede faltar cobertura por nubes o condiciones del sensor.",
    guardianHint: "Usala junto con viento, cámaras, noticias y focos térmicos para documentar una posible pluma de humo.",
    matrixSet: "GoogleMapsCompatible_Level6",
    format: "png",
    maxZoom: 6,
  },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toGibsDate(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#07111f" },
    },
  ],
};

export function SatelliteMiniMap(props: {
  lat: number;
  lon: number;
  date?: Date;
  zoom?: number;
  height?: number;
  layer?: SatelliteRasterLayer;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const date = props.date ?? new Date();
  const ymd = toGibsDate(date);
  const layer = props.layer ?? SATELLITE_RASTER_LAYERS[0];
  const zoom = clamp(props.zoom ?? 7, 1, layer.maxZoom);
  const height = props.height ?? 260;
  const tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/${ymd}/${layer.matrixSet}/{z}/{y}/{x}.${layer.format}`;

  const rasterLayer = useMemo(
    () => ({
      id: "nasa-gibs-raster-layer",
      type: "raster" as const,
      source: "nasa-gibs-raster",
      paint: {
        "raster-opacity": 0.95,
        "raster-fade-duration": 120,
      },
    }),
    []
  );

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.setMaxZoom(layer.maxZoom);
    if (map.getZoom() > layer.maxZoom) {
      map.easeTo({ zoom: layer.maxZoom, duration: 350 });
    }
  }, [layer.maxZoom]);

  useEffect(() => {
    mapRef.current?.getMap().easeTo({
      center: [props.lon, props.lat],
      zoom,
      duration: 450,
    });
  }, [props.lat, props.lon, zoom]);

  const recenter = () => {
    mapRef.current?.getMap().easeTo({
      center: [props.lon, props.lat],
      zoom,
      duration: 650,
    });
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-[#07111f]"
      style={{ height }}
    >
      <Map
        ref={(ref) => {
          mapRef.current = ref;
        }}
        initialViewState={{
          longitude: props.lon,
          latitude: props.lat,
          zoom,
        }}
        mapStyle={EMPTY_STYLE as any}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        minZoom={1}
        maxZoom={layer.maxZoom}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        doubleClickZoom
        scrollZoom
      >
        <Source
          key={`${layer.id}-${ymd}`}
          id="nasa-gibs-raster"
          type="raster"
          tiles={[tileUrl]}
          tileSize={256}
          minzoom={1}
          maxzoom={layer.maxZoom}
          attribution="NASA GIBS"
        >
          <Layer {...(rasterLayer as any)} />
        </Source>

        <Marker longitude={props.lon} latitude={props.lat} anchor="center">
          <div className="pointer-events-none relative h-14 w-14">
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_22px_rgba(103,232,249,0.95)]" />
            <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200/70" />
            <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/30 animate-ping" />
          </div>
        </Marker>
      </Map>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] font-semibold text-white/70 backdrop-blur">
          NASA GIBS - {ymd}
        </div>
        <div className="rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100/75 backdrop-blur">
          Interactivo
        </div>
      </div>

      <div className="absolute right-3 top-12 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-black/45 backdrop-blur">
        <button
          type="button"
          onClick={() => mapRef.current?.getMap().zoomIn({ duration: 220 })}
          className="flex h-9 w-9 items-center justify-center text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Acercar vista satelital"
          title="Acercar"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.getMap().zoomOut({ duration: 220 })}
          className="flex h-9 w-9 items-center justify-center border-t border-white/10 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Alejar vista satelital"
          title="Alejar"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={recenter}
          className="flex h-9 w-9 items-center justify-center border-t border-white/10 text-cyan-100/75 transition-colors hover:bg-cyan-400/10 hover:text-cyan-50"
          aria-label="Centrar vista en el evento"
          title="Centrar evento"
        >
          <LocateFixed className="h-4 w-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/45 px-2.5 py-1.5 text-[11px] text-white/60 backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <Crosshair className="h-3.5 w-3.5 text-cyan-200/80" />
          {props.lat.toFixed(4)}, {props.lon.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
