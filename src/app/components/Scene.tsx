import { MapScene } from "./MapScene";
import { EnvironmentalEvent, EventCategory } from "@/data/events";

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
    <MapScene
      events={filteredEvents}
      bbox={bbox ?? null}
      onEventClick={onEventClick}
    />
  );
}
