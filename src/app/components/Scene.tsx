import { Globe2D } from './Globe2D';
import { EnvironmentalEvent, EventCategory } from '@/data/events';

interface SceneProps {
  events: EnvironmentalEvent[];
  activeCategories: Set<EventCategory>;
  onEventClick: (event: EnvironmentalEvent) => void;
}

export function Scene({ events, activeCategories, onEventClick }: SceneProps) {
  // Filter events by active categories
  const filteredEvents = events.filter((event) =>
    activeCategories.has(event.category)
  );

  return (
    <div className="w-full h-full">
      <Globe2D events={filteredEvents} onEventClick={onEventClick} />
    </div>
  );
}