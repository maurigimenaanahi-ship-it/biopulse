import { useState, useEffect } from 'react';

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
}) {
  const date = props.date ?? new Date();
  const ymd = toGibsDate(date);
  const zoom = props.zoom ?? 5; // Lower zoom for static image
  const height = props.height ?? 260;

  // NASA GIBS True Color layer (VIIRS)
  const layer = 'VIIRS_SNPP_CorrectedReflectance_TrueColor';

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
          const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${ymd}/GoogleMapsCompatible_Level9/${tile.z}/${tile.y}/${tile.x}.jpg`;
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
