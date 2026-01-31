import { useState, useEffect, useRef } from 'react';
import { EnvironmentalEvent, categoryColors } from '@/data/events';

interface Globe2DProps {
  events: EnvironmentalEvent[];
  onEventClick: (event: EnvironmentalEvent) => void;
}

export function Globe2D({ events, onEventClick }: Globe2DProps) {
  const [rotation, setRotation] = useState(0);
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const rotationRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-rotate globe
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDragging) {
        setRotation((prev) => (prev + 0.2) % 360);
        rotationRef.current = (rotationRef.current + 0.2) % 360;
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isDragging]);

  // Convert lat/long to 2D projection
  const latLongToPosition = (lat: number, long: number, rotation: number) => {
    // Adjust longitude by rotation
    const adjustedLong = ((long + rotation + 180) % 360) - 180;
    
    // Simple equirectangular projection
    const x = ((adjustedLong + 180) / 360) * 100;
    const y = ((90 - lat) / 180) * 100;
    
    // Check if point is on visible hemisphere (simple backface culling)
    const isVisible = Math.abs(adjustedLong) < 90;
    
    return { x, y, isVisible };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - dragStart.x;
      setRotation((prev) => prev - deltaX * 0.5);
      rotationRef.current = rotationRef.current - deltaX * 0.5;
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const severitySize = {
    low: 8,
    moderate: 12,
    high: 16,
    critical: 20,
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Background stars */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 200 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Globe container */}
      <div className="relative w-[600px] h-[600px] max-w-[80vh] max-h-[80vh]">
        {/* Globe sphere */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#0a1628] to-[#0a2540] border border-[#1a3a5c]/30 shadow-[0_0_80px_rgba(0,212,255,0.15)]">
          {/* Latitude lines */}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = ((90 - lat) / 180) * 100;
            return (
              <div
                key={lat}
                className="absolute left-0 right-0 h-px bg-[#1a3a5c]/20"
                style={{ top: `${y}%` }}
              />
            );
          })}
          
          {/* Longitude lines */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30);
            const visible = Math.abs(((angle + rotation) % 360) - 180) < 90;
            const opacity = visible ? 0.2 : 0.05;
            
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-[#1a3a5c]"
                style={{
                  left: '50%',
                  transform: `translateX(-50%) rotateY(${angle}deg)`,
                  opacity,
                  transition: 'opacity 0.3s',
                }}
              />
            );
          })}

          {/* Atmospheric glow */}
          <div className="absolute inset-[-5px] rounded-full bg-[#00d4ff]/5 blur-xl" />
          <div className="absolute inset-[-10px] rounded-full bg-[#00d4ff]/3 blur-2xl" />
        </div>

        {/* Data nodes */}
        {events.map((event) => {
          const pos = latLongToPosition(event.latitude, event.longitude, rotation);
          const size = severitySize[event.severity];
          const color = categoryColors[event.category];
          const isHovered = hoveredEvent === event.id;

          if (!pos.isVisible) return null;

          // Calculate distance from edge for fade effect
          const distFromCenter = Math.sqrt(
            Math.pow(pos.x - 50, 2) + Math.pow(pos.y - 50, 2)
          );
          const edgeFade = Math.max(0, 1 - (distFromCenter / 45));

          return (
            <div
              key={event.id}
              className="absolute group cursor-pointer"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
                opacity: edgeFade,
                pointerEvents: edgeFade > 0.3 ? 'auto' : 'none',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(event);
              }}
              onMouseEnter={() => setHoveredEvent(event.id)}
              onMouseLeave={() => setHoveredEvent(null)}
            >
              {/* Vertical beam */}
              <div
                className="absolute bottom-full left-1/2 w-px -translate-x-1/2 bg-gradient-to-t from-current to-transparent"
                style={{
                  height: `${size * 2}px`,
                  color: color,
                  opacity: 0.4,
                }}
              />

              {/* Outer glow ring */}
              <div
                className="absolute inset-0 rounded-full animate-pulse"
                style={{
                  width: `${size * 2}px`,
                  height: `${size * 2}px`,
                  margin: `-${size / 2}px`,
                  background: `radial-gradient(circle, ${color}40, transparent 70%)`,
                  animationDuration: '2s',
                }}
              />

              {/* Main node */}
              <div
                className="relative rounded-full transition-all duration-300"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  backgroundColor: color,
                  boxShadow: `0 0 ${size * 2}px ${color}80, 0 0 ${size}px ${color}`,
                  transform: isHovered ? 'scale(1.5)' : 'scale(1)',
                }}
              >
                {/* Inner glow */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, white, transparent 60%)`,
                    opacity: 0.5,
                  }}
                />
              </div>

              {/* Hover label */}
              {isHovered && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-sm border border-white/20 text-white text-sm whitespace-nowrap pointer-events-none z-10">
                  <div className="font-semibold">{event.title}</div>
                  <div className="text-xs text-white/70">{event.location}</div>
                </div>
              )}
            </div>
          );
        })}

        {/* Center info */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <div className="text-[#00d4ff]/20 text-6xl font-bold">EARTH</div>
          <div className="text-[#00d4ff]/10 text-sm mt-2">REAL-TIME MONITORING</div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-white/40 text-xs">
        Drag to rotate • Click nodes for details
      </div>
    </div>
  );
}
