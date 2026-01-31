import { Activity } from 'lucide-react';
import { motion } from 'motion/react';

interface HeaderProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function Header({ activeView, onViewChange }: HeaderProps) {
  const navItems = [
    { id: 'home', label: 'Live Planet' },
    { id: 'events', label: 'Events' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'data-layers', label: 'Data Layers' },
    { id: 'learn', label: 'Learn' },
    { id: 'dashboard', label: 'Dashboard' },
  ];

  return (
    <header className="absolute top-0 left-0 right-0 z-20">
      <div className="flex items-center justify-between px-8 py-6">
        {/* Logo */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="relative">
            <Activity className="w-8 h-8 text-cyan-400" />
            <div className="absolute inset-0 blur-xl bg-cyan-400 opacity-50" />
          </div>
          <div>
            <h1 className="text-2xl text-white tracking-tight">BioPulse</h1>
            <p className="text-xs text-white/40 tracking-wider">
              Planetary Monitoring System
            </p>
          </div>
        </motion.div>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map((item, index) => (
            <motion.button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className="relative px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              {item.label}
              {activeView === item.id && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                  layoutId="activeTab"
                  style={{
                    boxShadow: '0 0 10px #00d4ff',
                  }}
                />
              )}
            </motion.button>
          ))}
        </nav>

        {/* Status indicator */}
        <motion.div
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/30 border border-white/10 backdrop-blur-sm"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/70">System Online</span>
        </motion.div>
      </div>
    </header>
  );
}
