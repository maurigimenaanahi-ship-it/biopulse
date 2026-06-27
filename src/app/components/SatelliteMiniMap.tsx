import { useState, useEffect } from 'react';

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
  format: 'jpg' | 'png';
  maxZoom: number;
};

export const SATELLITE_RASTER_LAYERS: SatelliteRasterLayer[] = [
  {
    id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    label: 'Color real',
    plainLabel: 'Vista parecida al ojo humano',
    description: 'Vista visible aproximada. Puede quedar cubierta por nubes o humo.',
    whatYouSee: 'Una imagen similar a una fotografía tomada desde el satélite.',
    whyItMatters: 'Ayuda a ubicar nubes, humo visible, ríos, vegetación, ciudades y cambios grandes en el terreno.',
    limitations: 'No muestra focos térmicos invisibles ni confirma daño en superficie. Las nubes pueden tapar la zona.',
    guardianHint: 'Usala para orientarte visualmente y comparar si la zona del evento coincide con señales visibles.',
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    maxZoom: 9,
  },
  {
    id: 'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1',
    label: 'Falso color',
    plainLabel: 'Colores para revelar diferencias',
    description: 'Combinación útil para distinguir humo, agua, vegetación y zonas quemadas.',
    whatYouSee: 'Una imagen con colores no naturales que resalta diferencias entre agua, vegetación, suelo, humo y áreas quemadas.',
    whyItMatters: 'Puede revelar detalles que en color real pasan desapercibidos, especialmente cicatrices de fuego o contrastes de humedad.',
    limitations: 'Los colores no son reales. Requiere comparación con otras capas para evitar interpretar de más.',
    guardianHint: 'Buscá cambios de textura o contraste cerca del foco, pero registralos como indicios, no como confirmación.',
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'jpg',
    maxZoom: 9,
  },
  {
    id: 'VIIRS_SNPP_Brightness_Temp_BandI5_Day',
    label: 'Temperatura brillo',
    plainLabel: 'Señal térmica del satélite',
    description: 'Señal térmica diurna de banda I5. No equivale a temperatura ambiente.',
    whatYouSee: 'Una lectura térmica captada por el sensor satelital en una banda infrarroja.',
    whyItMatters: 'Ayuda a interpretar zonas relativamente calientes y a complementar las detecciones FIRMS.',
    limitations: 'No es temperatura del aire, no mide oxígeno y no confirma por sí sola que haya fuego activo.',
    guardianHint: 'Comparala con FRP, hora de observación y detecciones FIRMS antes de sacar conclusiones.',
    matrixSet: 'GoogleMapsCompatible_Level9',
    format: 'png',
    maxZoom: 9,
  },
  {
    id: 'VIIRS_SNPP_AOD_Dark_Target_Land_Ocean',
    label: 'Aerosoles',
    plainLabel: 'Partículas en el aire',
    description: 'Espesor óptico de aerosoles. Puede ayudar a leer humo o partículas, con cobertura parcial.',
    whatYouSee: 'Una estimación de partículas suspendidas en la atmósfera, como humo, polvo o contaminación.',
    whyItMatters: 'En incendios puede ayudar a seguir plumas de humo o aire cargado de partículas.',
    limitations: 'No distingue automáticamente humo de polvo o contaminación. Puede faltar cobertura por nubes o condiciones del sensor.',
    guardianHint: 'Usala junto con viento, cámaras, noticias y focos térmicos para documentar una posible pluma de humo.',
    matrixSet: 'GoogleMapsCompatible_Level6',
    format: 'png',
    maxZoom: 6,
  },
];

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toGibsDate(d: Date) {
  // Using UTC for consistency with timestamp
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// Convert lat/lon to tile coordinates at a given zoom level
function latLonToTile(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z: zoom };
}

export function SatelliteMiniMap(props: {
  lat: number;
  lon: number;
  date?: Date;
  zoom?: number;
  height?: number;
  layer?: SatelliteRasterLayer;
}) {
  const date = props.date ?? new Date();
  const ymd = toGibsDate(date);
  const layer = props.layer ?? SATELLITE_RASTER_LAYERS[0];
  const zoom = Math.min(props.zoom ?? 5, layer.maxZoom); // Lower zoom for static image
  const height = props.height ?? 260;

  // Calculate center tile
  const centerTile = latLonToTile(props.lat, props.lon, zoom);

  // Create a grid of tiles around the center
  const [tiles, setTiles] = useState<Array<{ x: number; y: number; z: number }>>([]);

  useEffect(() => {
    const tileGrid = [];
    // Create a 3x3 grid of tiles centered on the location
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        tileGrid.push({
          x: centerTile.x + dx,
          y: centerTile.y + dy,
          z: centerTile.z,
        });
      }
    }
    setTiles(tileGrid);
  }, [centerTile.x, centerTile.y, centerTile.z]);

  const tileSize = 256;
  const gridSize = 3;
  const containerWidth = tileSize * gridSize;
  const containerHeight = tileSize * gridSize;

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
        height: height,
        backgroundColor: '#0a1628',
      }}
    >
      {/* Tile Grid Container */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: containerWidth,
          height: containerHeight,
          display: 'grid',
          gridTemplateColumns: `repeat(${gridSize}, ${tileSize}px)`,
          gridTemplateRows: `repeat(${gridSize}, ${tileSize}px)`,
        }}
      >
        {tiles.map((tile, index) => {
          const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/${ymd}/${layer.matrixSet}/${tile.z}/${tile.y}/${tile.x}.${layer.format}`;
          return (
            <img
              key={index}
              src={url}
              alt=""
              style={{
                width: tileSize,
                height: tileSize,
                display: 'block',
                objectFit: 'cover',
              }}
              onError={(e) => {
                // Fallback to a dark tile if NASA tile fails
                e.currentTarget.style.backgroundColor = '#0a1628';
                e.currentTarget.style.opacity = '0.3';
              }}
            />
          );
        })}
      </div>

      {/* BioPulse-style location marker */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        {/* Inner pulse */}
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: '#00d4ff',
            boxShadow: '0 0 20px #00d4ff',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
        {/* Outer ring */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '2px solid #00d4ff',
            opacity: 0.6,
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
        {/* Outer pulse ring */}
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: '1px solid #00d4ff',
            opacity: 0.3,
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'pulse-ring 2s ease-in-out infinite',
          }}
        />
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
            50% {
              opacity: 0.7;
              transform: translate(-50%, -50%) scale(1.1);
            }
          }
          
          @keyframes pulse-ring {
            0% {
              opacity: 0.3;
              transform: translate(-50%, -50%) scale(1);
            }
            50% {
              opacity: 0.1;
              transform: translate(-50%, -50%) scale(1.2);
            }
            100% {
              opacity: 0.3;
              transform: translate(-50%, -50%) scale(1);
            }
          }
        `}
      </style>
    </div>
  );
}
