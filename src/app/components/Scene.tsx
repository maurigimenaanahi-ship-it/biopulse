import type { EnvironmentalEvent, EventCategory } from "@/data/events";
import { MapScene } from "./MapScene";

interface SceneProps {
  events: EnvironmentalEvent[];
  activeCategories: Set<EventCategory>;
  onEventClick: (event: EnvironmentalEvent) => void;
  bbox?: string | null;
}

export function Scene({ events, activeCategories, onEventClick, bbox }: SceneProps) {
  const filteredEvents = events.filter((event) =>
    activeCategories.has(event.category)
  );

  return (
    <div className="w-full h-full">
      <MapScene events={filteredEvents} bbox={bbox ?? null} onEventClick={onEventClick} />
    </div>
  );
}
