import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function Sidebar({ tabs, activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-64 bg-[#FFFBF5] border-r border-[#E8DDD0] flex flex-col shrink-0">
      <div className="p-5 border-b border-[#E8DDD0]">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🪺</span>
          <div>
            <h1 className="text-lg font-bold text-[#2A170F] tracking-tight">Words Nest</h1>
            <p className="text-xs text-[#897365]">Admin Panel v2.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { onTabChange(tab.id); window.location.hash = tab.id; }}
            className={`sidebar-link w-full text-left ${activeTab === tab.id ? 'active' : 'text-[#2A170F]'}`}
          >
            <tab.icon className="w-5 h-5" />
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="ml-auto w-1.5 h-1.5 rounded-full bg-[#AA7137]"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-[#E8DDD0]">
        <p className="text-xs text-[#BFA090] text-center">Words Nest © 2026</p>
      </div>
    </aside>
  );
}
