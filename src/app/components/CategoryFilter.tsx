import { EventCategory, categoryColors, categoryLabels } from '@/data/events';
import { motion } from 'motion/react';

interface CategoryFilterProps {
  activeCategories: Set<EventCategory>;
  onToggleCategory: (category: EventCategory) => void;
  eventCounts: Record<EventCategory, number>;
}

export function CategoryFilter({
  activeCategories,
  onToggleCategory,
  eventCounts,
}: CategoryFilterProps) {
  const categories: EventCategory[] = [
    'flood',
    'fire',
    'storm',
    'heatwave',
    'air-pollution',
    'ocean-anomaly',
  ];

  return (
    <div className="absolute top-6 left-6 z-10 space-y-3">
      <div className="text-white/60 text-sm uppercase tracking-wider mb-4">
        Event Categories
      </div>
      {categories.map((category) => {
        const isActive = activeCategories.has(category);
        const color = categoryColors[category];
        const count = eventCounts[category] || 0;

        return (
          <motion.button
            key={category}
            onClick={() => onToggleCategory(category)}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all group w-64"
            style={{
              backgroundColor: isActive
                ? `${color}15`
                : 'rgba(0, 0, 0, 0.5)',
              borderColor: isActive ? color : 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Color indicator */}
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: isActive ? `0 0 12px ${color}` : 'none',
              }}
            />

            {/* Label */}
            <span className="flex-1 text-left text-white text-sm">
              {categoryLabels[category]}
            </span>

            {/* Count badge */}
            <span
              className="px-2 py-0.5 rounded-full text-xs"
              style={{
                backgroundColor: isActive ? color : 'rgba(255, 255, 255, 0.1)',
                color: isActive ? '#000' : '#fff',
              }}
            >
              {count}
            </span>
          </motion.button>
        );
      })}

      {/* Stats */}
      <div className="mt-4 px-4 py-3 rounded-lg bg-black/50 border border-white/10 backdrop-blur-sm">
        <div className="text-white/40 text-xs uppercase tracking-wider mb-1">
          Active Events
        </div>
        <div className="text-white text-2xl font-light">
          {Array.from(activeCategories).reduce(
            (sum, cat) => sum + (eventCounts[cat] || 0),
            0
          )}
        </div>
      </div>
    </div>
  );
}
