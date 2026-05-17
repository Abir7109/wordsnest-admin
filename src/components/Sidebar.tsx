import { LayoutDashboard, Users, Clock, BrainCircuit, Bell, BarChart3, LogOut, X, Smartphone } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'requests', label: 'Requests', icon: Clock },
  { id: 'aiconfig', label: 'AI Config', icon: BrainCircuit },
  { id: 'appcontrol', label: 'App Control', icon: Smartphone },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
];

export default function Sidebar({ activeTab, setActiveTab, isOpen, onClose, onLogout }: SidebarProps) {
  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/60 z-[60] lg:hidden transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <nav className={cn(
        "fixed left-0 top-0 h-full w-[280px] bg-background border-r border-outline-variant flex flex-col py-xl z-[70] transition-transform duration-300 lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-lg mb-xl flex justify-between items-center">
          <div className="flex items-center gap-md">
            <div className="w-10 h-10 rounded bg-primary flex items-center justify-center text-on-primary font-display text-[24px] font-bold shadow-sm">W</div>
            <div>
              <h1 className="font-display text-2xl font-bold text-primary leading-tight">Words Nest</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Admin Terminal</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-on-surface-variant hover:text-primary p-xs">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col flex-1 gap-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (window.innerWidth < 1024) onClose();
              }}
              className={cn(
                "flex items-center gap-md px-lg py-md transition-all duration-200 group cursor-pointer text-sm font-semibold",
                activeTab === item.id 
                  ? "text-primary border-l-2 border-primary bg-surface-container-low" 
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              )}
            >
              <item.icon size={20} className={cn(activeTab === item.id && "fill-primary/20", "group-hover:scale-110 transition-transform")} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-auto px-lg pt-lg border-t border-outline-variant/30">
          <button 
            onClick={onLogout}
            className="flex items-center gap-md px-md py-md w-full text-on-surface-variant hover:text-primary transition-all duration-200 group text-sm font-semibold whitespace-nowrap"
          >
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            Logout Session
          </button>
        </div>
      </nav>
    </>
  );
}
