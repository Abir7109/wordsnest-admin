import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import type { LucideIcon } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface LayoutProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onLogout?: () => void;
  children: ReactNode;
}

export function Layout({ tabs, activeTab, onTabChange, onLogout, children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-[#F5F0EB]">
      <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} onLogout={onLogout} />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
