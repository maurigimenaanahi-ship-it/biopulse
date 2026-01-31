import { motion } from 'motion/react';
import { TrendingUp, AlertCircle, MapPin } from 'lucide-react';

interface StatsPanelProps {
  totalEvents: number;
  criticalEvents: number;
  affectedRegions: number;
}

export function StatsPanel({
  totalEvents,
  criticalEvents,
  affectedRegions,
}: StatsPanelProps) {
  const stats = [
    {
      label: 'Active Events',
      value: totalEvents,
      icon: TrendingUp,
      color: '#00d4ff',
    },
    {
      label: 'Critical Alerts',
      value: criticalEvents,
      icon: AlertCircle,
      color: '#ff0044',
    },
    {
      label: 'Affected Regions',
      value: affectedRegions,
      icon: MapPin,
      color: '#ffaa00',
    },
  ];

  return (
    <div className="absolute top-6 right-6 z-10 space-y-3">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          className="px-5 py-4 rounded-lg bg-black/50 border border-white/10 backdrop-blur-lg min-w-[200px]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 text-xs uppercase tracking-wider">
              {stat.label}
            </span>
            <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
          </div>
          <div
            className="text-3xl font-light"
            style={{ color: stat.color }}
          >
            {stat.value}
          </div>
        </motion.div>
      ))}

      {/* Data Update Indicator */}
      <motion.div
        className="px-5 py-3 rounded-lg bg-black/50 border border-white/10 backdrop-blur-lg"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white/60 text-xs">
            Live data • Updates every 30s
          </span>
        </div>
      </motion.div>
    </div>
  );
}
