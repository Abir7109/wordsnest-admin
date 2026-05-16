import { Search, Calendar, Download, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { RequestLog } from "../types";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface RequestsProps {
  requests: RequestLog[];
  setRequests: React.Dispatch<React.SetStateAction<RequestLog[]>>;
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
}

export default function Requests({ requests, setRequests, onNotify }: RequestsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Success" | "Error">("All");

  const filteredRequests = requests.filter(log => {
    const matchesSearch = log.word.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         log.userId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleClearLogs = () => {
    if (confirm("Are you certain? This will purge all transaction logs from the session memory.")) {
      setRequests([]);
      onNotify("Transaction logs purged from volatile memory.", "info");
    }
  };

  const handleExport = () => {
    onNotify("Preparing archival CSV for download...", "info");
    setTimeout(() => {
      onNotify("Linguistic request metadata exported successfully.", "success");
    }, 1500);
  };

  return (
    <div className="space-y-gutter font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-lg mb-lg">
        <div>
          <h3 className="font-display text-4xl font-bold text-on-surface mb-xs tracking-tight">Request Logs</h3>
          <p className="text-on-surface-variant font-medium">Detailed view of API and query transactions.</p>
        </div>
        <div className="flex gap-md">
          <button 
            onClick={handleClearLogs}
            className="flex items-center gap-sm bg-surface-variant text-on-surface-variant px-lg py-sm rounded-xl font-bold hover:bg-error-container hover:text-error transition-all active:scale-95 border border-transparent hover:border-error/20"
          >
            <Trash2 size={18} />
            Purge Logs
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-xl font-bold hover:bg-primary-container hover:text-on-primary-container transition-all active:scale-95 shadow-lg shadow-primary/10"
          >
            <Download size={18} />
            Export Archive
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-md mb-lg bg-surface-container-low p-lg rounded-2xl border border-outline-variant items-end backdrop-blur-sm">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-sm ml-1">Search Query / ID</label>
          <div className="relative group/search">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within/search:text-primary transition-colors" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant/50 rounded-xl py-[10px] pl-10 pr-md text-sm focus:border-primary outline-none ring-0 focus:ring-0 transition-all" 
              placeholder="e.g. usr_892 or 'ephemeral'" 
              type="text"
              autoComplete="one-time-code"
            />
          </div>
        </div>
        
        <div className="flex flex-col shrink-0">
          <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-sm ml-1">Date Range</label>
          <div className="flex items-center gap-sm bg-surface-container border border-outline-variant/50 rounded-xl px-md py-[10px] focus-within:border-primary transition-colors group">
            <Calendar size={18} className="text-on-surface-variant group-focus-within:text-primary" />
            <span className="text-sm font-medium text-on-surface whitespace-nowrap">Session Duration</span>
          </div>
        </div>

        <div className="flex flex-col shrink-0">
          <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mb-sm ml-1">Outcome</label>
          <div className="relative">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="appearance-none w-36 bg-surface-container border border-outline-variant/50 rounded-xl py-[10px] pl-md pr-10 text-sm font-bold text-on-surface focus:border-primary transition-all cursor-pointer outline-none ring-0 focus:ring-0"
            >
              <option value="All">All Statuses</option>
              <option value="Success">Success (200)</option>
              <option value="Error">Error (500/400)</option>
            </select>
            <AlertCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="bg-surface-container-low border border-outline-variant rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-high/50">
                {['Word Requested', 'User Context', 'Timestamp', 'Latency', 'Status', 'Tools'].map((head, i) => (
                  <th key={head} className={cn(
                    "px-lg py-xl text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em]",
                    i === 5 && "text-right"
                  )}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              <AnimatePresence initial={false}>
                {filteredRequests.map((log) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    key={log.id} 
                    className={cn(
                      "hover:bg-surface-container transition-colors group",
                      log.status === 'Error' && "bg-error-container/5 hover:bg-error-container/10"
                    )}
                  >
                    <td className={cn("px-lg py-md font-bold font-display text-lg", log.status === 'Error' ? "text-error" : "text-primary italic")}>
                      {log.word}
                    </td>
                    <td className="px-lg py-md">
                       <div className="flex flex-col gap-xs">
                          <span className="text-[12px] font-bold text-on-surface">{log.userId !== '-' ? log.userId : log.guestId}</span>
                          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{log.userId !== '-' ? 'Internal ID' : 'Guest Session'}</span>
                       </div>
                    </td>
                    <td className="px-lg py-md text-on-surface-variant font-mono text-[13px] font-medium">{log.timestamp}</td>
                    <td className="px-lg py-md">
                      <div className={cn(
                        "font-mono font-bold text-sm",
                        parseInt(log.time) > 1000 ? "text-primary-fixed" : 
                        parseInt(log.time) < 100 ? "text-secondary" : "text-on-surface"
                      )}>
                        {log.time}
                      </div>
                    </td>
                    <td className="px-lg py-md">
                      <span className={cn(
                        "inline-flex items-center gap-xs px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] border",
                        log.status === 'Success' 
                          ? "bg-secondary-container/20 text-secondary border-secondary/10" 
                          : "bg-error-container/20 text-error border-error/10"
                      )}>
                        {log.status === 'Success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-lg py-md text-right">
                      <button className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 outline-none">
                        <ExternalLink size={18} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-24 text-center">
                    <p className="text-on-surface-variant font-display italic text-xl opacity-30">No transaction logs match archival query.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="bg-surface-container border-t border-outline-variant p-lg px-xl flex justify-between items-center bg-surface-container-high/30">
          <span className="text-sm font-medium text-on-surface-variant">Archived {filteredRequests.length} transaction entries</span>
          <div className="flex gap-sm">
            <button className="p-2 rounded-xl bg-surface hover:bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-primary transition-all disabled:opacity-10 shadow-sm" disabled>
              <ChevronLeft size={20} />
            </button>
            <button className="p-2 rounded-xl bg-surface hover:bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-primary transition-all shadow-sm">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
