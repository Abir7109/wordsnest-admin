import { Bell, CheckCircle2, AlertCircle, Trash2, Clock, Terminal } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Notification } from "../App";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface NotificationsProps {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
}

export default function Notifications({ notifications, setNotifications }: NotificationsProps) {
  const handleClear = () => {
    setNotifications([]);
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="space-y-gutter relative max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-md mb-xl pb-md border-b border-outline-variant/30">
        <div>
          <h2 className="font-display text-4xl font-bold text-on-surface mb-xs tracking-tight">Notification Center</h2>
          <p className="text-on-surface-variant font-medium">Archival timeline of administrative and system triggers.</p>
        </div>
        {notifications.length > 0 && (
          <button 
            onClick={handleClear}
            className="text-sm font-bold text-on-surface-variant hover:text-error flex items-center gap-sm transition-colors group"
          >
            <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
            Clear All
          </button>
        )}
      </div>

      <div className="space-y-md">
        <AnimatePresence initial={false}>
          {notifications.map((n) => (
            <motion.div 
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={n.id} 
              className="bg-surface-container border border-outline-variant rounded-2xl p-md sm:p-lg shadow-sm hover:shadow-xl hover:border-primary/30 transition-all flex gap-md sm:gap-xl group"
            >
              <div className={cn(
                "p-sm sm:p-md rounded-xl shadow-inner shrink-0 self-start",
                n.type === 'success' ? "bg-secondary-container/20 text-secondary" :
                n.type === 'error' ? "bg-error-container/20 text-error" :
                "bg-surface-container-highest text-primary"
              )}>
                {n.type === 'success' && <CheckCircle2 size={20} className="sm:w-6 sm:h-6" />}
                {n.type === 'error' && <AlertCircle size={20} className="sm:w-6 sm:h-6" />}
                {n.type === 'info' && <Terminal size={20} className="sm:w-6 sm:h-6" />}
              </div>
              
              <div className="flex-1 min-w-0 space-y-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-xs">
                   <h4 className="text-md sm:text-lg font-bold text-on-surface capitalize leading-tight">{n.type} Trigger</h4>
                   <div className="flex items-center gap-sm text-[10px] sm:text-[11px] font-bold text-on-surface-variant uppercase tracking-widest bg-surface-container-high px-2 py-1 rounded shadow-inner whitespace-nowrap">
                      <Clock size={12} />
                      {getTimeAgo(n.timestamp)}
                   </div>
                </div>
                <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed font-medium break-words">{n.message}</p>
                <div className="flex flex-wrap gap-md pt-sm opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                   <button className="text-[11px] sm:text-[12px] font-bold text-primary hover:underline whitespace-nowrap">Inspect Metadata</button>
                   <button 
                    onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}
                    className="text-[11px] sm:text-[12px] font-bold text-on-surface-variant hover:text-on-surface whitespace-nowrap"
                   >
                    Dismiss
                   </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {notifications.length === 0 && (
          <div className="py-24 text-center">
            <div className="inline-flex p-xl rounded-full bg-surface-container-high border border-outline-variant mb-lg shadow-inner">
              <Bell className="text-on-surface-variant" size={48} />
            </div>
            <h3 className="font-display text-2xl font-bold text-on-surface mb-xs">Archives are silent.</h3>
          </div>
        )}
      </div>
    </div>
  );
}
