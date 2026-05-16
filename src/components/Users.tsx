import { Search, Filter, ArrowRight, ChevronLeft, ChevronRight, UserPlus, Trash2, ShieldAlert } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { User, UserType } from "../types";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface UsersProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
}

export default function Users({ users, setUsers, onNotify }: UsersProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | UserType>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.identity.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         user.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === "all" || user.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleDelete = (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    onNotify(`User ${id} has been permanently removed from archives.`, 'success');
    setDeleteConfirm(null);
  };

  const handleAddUser = () => {
    const newUser: User = {
      id: `USR-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      type: UserType.REGISTERED,
      identity: `scholar.${Math.floor(Math.random() * 1000)}@new.edu`,
      words: 0,
      lastActive: 'Just now',
      joinDate: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    };
    setUsers(prev => [newUser, ...prev]);
    onNotify("New scholar account provisioned successfully.", "success");
  };

  return (
    <div className="space-y-gutter relative">
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-md bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-surface-container border border-outline-variant rounded-2xl p-lg sm:p-xl max-w-md w-full shadow-2xl mx-auto"
            >
              <div className="flex items-center gap-md text-error mb-md">
                <ShieldAlert size={32} className="shrink-0" />
                <h3 className="text-xl font-bold">Revoke Access?</h3>
              </div>

              <div className="flex justify-end gap-md">
                <button 
                  onClick={() => setDeleteConfirm(null)}
                  className="px-lg py-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDelete(deleteConfirm)}
                  className="bg-error text-on-error px-lg py-sm rounded-xl font-bold shadow-lg shadow-error/20 hover:bg-error/90 transition-all active:scale-95"
                >
                  Confirm Deletion
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-lg mb-xl">
        <div>
          <h1 className="font-display text-4xl font-bold text-on-surface mb-xs tracking-tight">User Database</h1>
          <p className="text-on-surface-variant font-medium">Manage registered scholars and track guest session activity.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-md">
          <button 
            onClick={handleAddUser}
            className="bg-primary text-on-primary px-lg py-[10px] rounded-xl font-bold flex items-center justify-center gap-sm hover:bg-primary-container hover:text-on-primary-container transition-all shadow-lg shadow-primary/10 active:scale-95"
          >
            <UserPlus size={18} />
            Provision Scholar
          </button>
          <div className="relative group/search">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within/search:text-primary transition-colors" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-[280px] bg-surface-container-low border border-outline-variant rounded-xl p-[10px] pl-10 text-sm focus:border-primary outline-none ring-0 focus:ring-0 transition-all placeholder:text-on-surface-variant/50" 
              placeholder="Filter by ID or Identity..." 
              type="text" 
              autoComplete="one-time-code"
            />
          </div>
          
          <div className="relative min-w-[160px]">
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full appearance-none bg-surface-container-low border border-outline-variant rounded-xl p-[10px] px-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none cursor-pointer pr-10"
            >
              <option value="all">All Access Types</option>
              <option value={UserType.REGISTERED}>Registered Scholars</option>
              <option value={UserType.GUEST}>Guest Sessions</option>
            </select>
            <Filter size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="bg-surface-container rounded-2xl border border-outline-variant overflow-hidden shadow-2xl backdrop-blur-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="bg-surface-container-high/50 border-b border-outline-variant">
              <tr>
                {['User ID', 'Type', 'Identity / Email', 'Words Searched', 'Last Active', 'Join Date', 'Action'].map((head, i) => (
                  <th key={head} className={cn(
                    "px-lg py-xl text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em]",
                    (i === 3 || i === 6) && "text-right"
                  )}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              <AnimatePresence initial={false}>
                {filteredUsers.map((user) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    key={user.id} 
                    className="group hover:bg-surface-container-highest/30 transition-colors"
                  >
                    <td className="px-lg py-md font-bold text-primary tracking-wide font-mono text-sm">
                      {user.id}
                    </td>
                    <td className="px-lg py-md">
                      <span className={cn(
                        "inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all",
                        user.type === UserType.REGISTERED 
                          ? "bg-secondary-container/40 text-secondary border-secondary/20 group-hover:bg-secondary-container" 
                          : "bg-surface-variant text-on-surface-variant border-transparent group-hover:bg-outline-variant/20"
                      )}>
                        {user.type}
                      </span>
                    </td>
                    <td className={cn("px-lg py-md font-medium", user.type === UserType.GUEST ? "text-on-surface-variant italic" : "text-on-surface")}>
                      {user.identity}
                    </td>
                    <td className="px-lg py-md text-right font-bold text-on-surface-variant group-hover:text-primary transition-colors">
                      {user.words.toLocaleString()}
                    </td>
                    <td className="px-lg py-md text-on-surface-variant text-sm italic font-medium">
                      {user.lastActive}
                    </td>
                    <td className="px-lg py-md text-on-surface-variant font-medium">
                      {user.joinDate}
                    </td>
                    <td className="px-lg py-md text-right">
                      <div className="flex items-center justify-end gap-md opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                        <button 
                          onClick={() => setDeleteConfirm(user.id)}
                          className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition-all"
                          title="Delete User"
                        >
                          <Trash2 size={18} />
                        </button>
                        <button className="inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:text-primary-fixed group/btn">
                          View
                          <ArrowRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-24 text-center">
                    <div className="flex flex-col items-center gap-md opacity-30">
                      <Search size={48} />
                      <p className="font-display text-xl">No archival records matching your filter.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="bg-surface-container-low border-t border-outline-variant p-lg px-xl flex justify-between items-center bg-surface-container-low/50">
          <span className="text-sm font-medium text-on-surface-variant">Showing {filteredUsers.length} of {users.length} archives</span>
          <div className="flex items-center gap-sm">
            <button className="p-2 rounded-xl bg-surface hover:bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-on-surface disabled:opacity-10 transition-all shadow-sm" disabled>
              <ChevronLeft size={20} />
            </button>
            <button className="p-2 rounded-xl bg-surface hover:bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-on-surface transition-all shadow-sm">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
