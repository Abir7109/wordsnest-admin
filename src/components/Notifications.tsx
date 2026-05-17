import { Bell, CheckCircle2, AlertCircle, Trash2, Clock, Terminal, Send, Users, X, Check } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Notification } from "../App";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, UserType } from "../types";

interface NotificationsProps {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  users: User[];
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
}

export default function Notifications({ notifications, setNotifications, users, onNotify }: NotificationsProps) {
  const [showSendModal, setShowSendModal] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);
  const [sending, setSending] = useState(false);

  const handleClear = () => {
    setNotifications([]);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      onNotify("Please enter title and message", "error");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/admin/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          targetUsers: sendToAll ? null : selectedUsers,
          sentBy: "Admin"
        })
      });

      if (response.ok) {
        const data = await response.json();
        onNotify(`Notification sent to ${sendToAll ? "all users" : selectedUsers.length + " users"}`, "success");
        setShowSendModal(false);
        setTitle("");
        setMessage("");
        setSelectedUsers([]);
        setSendToAll(true);
        
        // Refresh notifications
        fetch("/api/admin/notifications")
          .then(res => res.json())
          .then(data => {
            const adminNotifs = (data.notifications || []).map((n: any) => ({
              id: n.id,
              type: 'info' as const,
              message: `${n.title}: ${n.message}`,
              timestamp: new Date(n.createdAt)
            }));
            setNotifications(adminNotifs);
          });
      } else {
        onNotify("Failed to send notification", "error");
      }
    } catch (e) {
      onNotify("Error sending notification", "error");
    }
    setSending(false);
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  // Fetch sent notifications on mount
  useEffect(() => {
    fetch("/api/admin/notifications")
      .then(res => res.json())
      .then(data => {
        const adminNotifs = (data.notifications || []).map((n: any) => ({
          id: n.id,
          type: 'info' as const,
          message: `${n.title}: ${n.message}`,
          timestamp: new Date(n.createdAt)
        }));
        setNotifications(prev => [...adminNotifs, ...prev.filter(p => !adminNotifs.find(a => a.id === p.id))]);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-gutter relative">
      {/* Send Notification Modal */}
      <AnimatePresence>
        {showSendModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-md bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-surface-container border border-outline-variant rounded-2xl p-xl w-[95%] max-w-2xl shadow-2xl mx-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-xl">
                <h3 className="text-2xl font-bold text-on-surface">Send Notification</h3>
                <button onClick={() => setShowSendModal(false)} className="p-3 hover:bg-surface-container-high rounded-xl">
                  <X size={24} className="text-on-surface-variant" />
                </button>
              </div>

              <div className="space-y-lg">
                <div>
                  <label className="text-base font-bold text-on-surface-variant mb-md block">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., New Feature Available!"
                    className="w-full bg-surface-container-low border-2 border-outline-variant rounded-xl p-lg text-on-surface text-lg focus:border-primary outline-none"
                  />
                </div>

                <div>
                  <label className="text-base font-bold text-on-surface-variant mb-md block">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Enter your notification message..."
                    rows={4}
                    className="w-full bg-surface-container-low border-2 border-outline-variant rounded-xl p-lg text-on-surface text-lg focus:border-primary outline-none resize-none"
                  />
                </div>

                <div>
                  <label className="text-base font-bold text-on-surface-variant mb-md block">Send To</label>
                  <div className="flex gap-lg mb-lg">
                    <button
                      onClick={() => { setSendToAll(true); setSelectedUsers([]); }}
                      className={cn(
                        "flex-1 py-md px-lg rounded-xl font-bold border transition-all",
                        sendToAll 
                          ? "bg-primary text-on-primary border-primary" 
                          : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:border-primary"
                      )}
                    >
                      <Send size={20} className="inline mr-md" />
                      All Users
                    </button>
                    <button
                      onClick={() => setSendToAll(false)}
                      className={cn(
                        "flex-1 py-lg px-xl rounded-xl font-bold border-2 transition-all text-lg",
                        !sendToAll 
                          ? "bg-primary text-on-primary border-primary" 
                          : "bg-surface-container-low border-outline-variant text-on-surface-variant hover:border-primary"
                      )}
                    >
                      <Users size={20} className="inline mr-md" />
                      Specific Users
                    </button>
                  </div>

                  {!sendToAll && (
                    <div className="bg-surface-container-low border-2 border-outline-variant rounded-xl p-lg max-h-56 overflow-y-auto">
                      <div className="flex flex-wrap gap-md">
                        {users.map(user => (
                          <button
                            key={user.id}
                            onClick={() => toggleUser(user.id)}
                            className={cn(
                              "px-lg py-md rounded-full text-base font-bold transition-all flex items-center gap-md",
                              selectedUsers.includes(user.id)
                                ? "bg-primary text-on-primary"
                                : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                            )}
                          >
                            {selectedUsers.includes(user.id) && <Check size={18} />}
                            {user.id}
                          </button>
                        ))}
                        {users.length === 0 && (
                          <p className="text-on-surface-variant text-lg">No users available</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSend}
                  disabled={sending || !title.trim() || !message.trim()}
                  className="w-full bg-primary text-on-primary py-lg rounded-xl font-bold text-xl hover:bg-primary-container hover:text-on-primary-container transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-lg"
                >
                  {sending ? "Sending..." : "Send Notification"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-md mb-xl pb-md border-b border-outline-variant/30">
        <div>
          <h2 className="font-display text-4xl font-bold text-on-surface mb-xs tracking-tight">Notification Center</h2>
          <p className="text-on-surface-variant font-medium">Send and manage notifications to users.</p>
        </div>
        <div className="flex gap-md">
          <button 
            onClick={() => setShowSendModal(true)}
            className="bg-primary text-on-primary px-lg py-[10px] rounded-xl font-bold flex items-center gap-sm hover:bg-primary-container hover:text-on-primary-container transition-all shadow-lg shadow-primary/10"
          >
            <Send size={18} />
            Send Notification
          </button>
          {notifications.length > 0 && (
            <button 
              onClick={handleClear}
              className="text-sm font-bold text-on-surface-variant hover:text-error flex items-center gap-sm transition-colors group px-lg py-[10px]"
            >
              <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
              Clear All
            </button>
          )}
        </div>
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
            <h3 className="font-display text-2xl font-bold text-on-surface mb-xs">No notifications yet.</h3>
            <p className="text-on-surface-variant">Send a notification to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}