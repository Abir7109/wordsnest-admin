import { LogOut, User, Search, Menu } from "lucide-react";

interface TopbarProps {
  title: string;
  onMenuClick: () => void;
  onLogout: () => void;
}

export default function Topbar({ title, onMenuClick, onLogout }: TopbarProps) {
  return (
    <header className="bg-surface border-b border-outline-variant sticky top-0 z-40 h-16 shrink-0 shadow-sm">
      <div className="flex justify-between items-center w-full h-full px-4 md:px-margin">
        <div className="flex items-center gap-md">
          <button 
            onClick={onMenuClick}
            className="lg:hidden p-sm -ml-2 text-on-surface-variant hover:text-primary transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="font-display text-xl md:text-2xl font-bold text-primary truncate max-w-[200px] sm:max-w-none">
            {title}
          </div>
        </div>
        
        <div className="flex items-center gap-md md:gap-xl">
          <div className="hidden md:flex items-center gap-sm bg-surface-container-low border border-outline-variant rounded-full px-md py-xs h-10 w-48 lg:w-64 group focus-within:border-primary transition-all">
            <Search size={18} className="text-on-surface-variant group-focus-within:text-primary" />
            <input 
              type="text" 
              placeholder="Search admin..." 
              autoComplete="off"
              className="bg-transparent border-none focus:ring-0 outline-none text-sm text-on-surface placeholder:text-on-surface-variant/50 w-full"
            />
          </div>

          <div className="flex items-center gap-sm md:gap-md">
            <button 
              onClick={onLogout}
              className="text-xs md:text-sm font-semibold text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-sm group whitespace-nowrap"
            >
              <span className="hidden sm:inline">Logout</span>
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <div className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
              <User size={20} className="text-on-surface-variant" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
