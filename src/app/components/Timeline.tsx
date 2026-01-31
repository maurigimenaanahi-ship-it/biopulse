import { motion } from 'motion/react';
import { Clock, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useState } from 'react';

interface TimelineProps {
  currentTime: Date;
  onTimeChange: (date: Date) => void;
}

export function Timeline({ currentTime, onTimeChange }: TimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const timeRanges = [
    { label: 'Last Hour', value: -1 },
    { label: 'Last 6 Hours', value: -6 },
    { label: 'Last 24 Hours', value: -24 },
    { label: 'Last 7 Days', value: -168 },
  ];

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Time Display */}
        <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-black/50 border border-white/10 backdrop-blur-lg">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="text-white text-sm">
            {currentTime.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="text-white/40 text-xs ml-2">UTC</span>
        </div>

        {/* Timeline Controls */}
        <div className="flex items-center gap-2 px-4 py-3 rounded-full bg-black/50 border border-white/10 backdrop-blur-lg">
          {/* Skip Back */}
          <motion.button
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <SkipBack className="w-4 h-4 text-white/70" />
          </motion.button>

          {/* Play/Pause */}
          <motion.button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-3 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg border border-cyan-400/30 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-cyan-400" />
            ) : (
              <Play className="w-5 h-5 text-cyan-400" />
            )}
          </motion.button>

          {/* Skip Forward */}
          <motion.button
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <SkipForward className="w-4 h-4 text-white/70" />
          </motion.button>

          <div className="w-px h-8 bg-white/10 mx-2" />

          {/* Quick Time Ranges */}
          <div className="flex items-center gap-1">
            {timeRanges.map((range) => (
              <motion.button
                key={range.label}
                className="px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {range.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Playback Speed */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 border border-white/10 backdrop-blur-lg">
          <span className="text-white/40 text-xs">Speed:</span>
          {['1x', '2x', '5x', '10x'].map((speed) => (
            <button
              key={speed}
              className="px-2 py-1 text-xs text-white/70 hover:text-cyan-400 hover:bg-white/5 rounded transition-colors"
            >
              {speed}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
