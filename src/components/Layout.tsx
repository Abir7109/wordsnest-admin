import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface LayoutProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
}

export function Layout({ tabs, activeTab, onTabChange, children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-[#F5F0EB]">
      <Sidebar tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
