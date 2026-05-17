/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import Sidebar from "@/src/components/Sidebar";
import Topbar from "@/src/components/Topbar";
import Dashboard from "@/src/components/Dashboard";
import Users from "@/src/components/Users";
import Requests from "@/src/components/Requests";
import AIConfig from "@/src/components/AIConfig";
import AppControl from "@/src/components/AppControl";
import Notifications from "@/src/components/Notifications";
import Analytics from "@/src/components/Analytics";
import InstallCount from "@/src/components/InstallCount";
import Login from "@/src/components/Login";
import { AnimatePresence, motion } from "motion/react";
import { User, RequestLog, UserType } from "./types";
import { Bell, CheckCircle2, AlertCircle, X } from "lucide-react";

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'error';
  message: string;
  timestamp: Date;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

// Shared State
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, activeUsers: 0, inactiveUsers: 0, totalSearches: 0 });

  // Fetch requests from server every 2 seconds for live updates
  useEffect(() => {
    const fetchData = () => {
      fetch('/api/get-logs')
        .then(res => res.json())
        .then(data => {
          // Update requests
          if (data.logs) {
            const newLogs = data.logs.map((log: any) => ({
              id: log.id,
              word: log.word,
              userId: log.userId || log.guestId || 'anonymous',
              timestamp: log.timestamp || new Date().toISOString(),
              status: log.status === 'Success' ? 'Success' : 'Error',
              time: log.time || '100ms'
            }));
            setRequests(prev => JSON.stringify(prev) !== JSON.stringify(newLogs) ? newLogs : prev);
          }
          
          // Update users
          if (data.users) {
            const newUsers = data.users.map((u: any) => ({
              id: u.guestId || u.id || 'unknown',
              type: u.status === 'active' ? UserType.REGISTERED : UserType.GUEST,
              identity: u.guestId || 'anonymous',
              words: u.searchCount || 0,
              lastActive: u.status === 'active' ? 'Active now' : new Date(u.lastActive).toLocaleDateString(),
              joinDate: new Date(u.firstSeen).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
            } as User));
            setUsers(prev => JSON.stringify(prev) !== JSON.stringify(newUsers) ? newUsers : prev);
          }
          
          // Update stats
          if (data.stats) {
            setStats(data.stats);
          }
        })
        .catch(err => console.log('Failed to fetch:', err));
    };

    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const newNotif = { id: Math.random().toString(36).substr(2, 9), message, type, timestamp: new Date() };
    setNotifications(prev => [newNotif, ...prev].slice(0, 10));
  };

  const addRequest = (log: Omit<RequestLog, 'id' | 'timestamp'>) => {
    const newLog: RequestLog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString().replace('T', ' ').split('.')[0]
    };
    setRequests(prev => [newLog, ...prev]);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard users={users} requests={requests} />;
      case "users":
        return <Users users={users} setUsers={setUsers} onNotify={addNotification} />;
      case "requests":
        return <Requests requests={requests} setRequests={setRequests} onNotify={addNotification} />;
      case "aiconfig":
        return <AIConfig onNotify={addNotification} onAddRequest={addRequest} />;
      case "appcontrol":
        return <AppControl onNotify={addNotification} />;
      case "notifications":
        return <Notifications notifications={notifications} setNotifications={setNotifications} users={users} onNotify={addNotification} />;
      case "installcount":
        return <InstallCount onNotify={addNotification} />;
      case "analytics":
        return <Analytics requests={requests} />;
      default:
        return <Dashboard users={users} requests={requests} />;
    }
  };

  const getTitle = () => {
    switch (activeTab) {
      case "dashboard": return "Words Nest Admin";
      case "users": return "User Database";
      case "requests": return "Request Logs";
      case "aiconfig": return "AI Configuration";
      case "appcontrol": return "App Control";
      case "notifications": return "Notification Center";
      case "installcount": return "Install Count";
      case "analytics": return "Platform Analytics";
      default: return "Words Nest Admin";
    }
  };

  if (!isAuthenticated) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="login"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Login onLogin={() => setIsAuthenticated(true)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="flex min-h-screen bg-background relative selection:bg-primary/30">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        onLogout={handleLogout}
      />
      
      <div className="flex-1 flex flex-col min-h-screen lg:ml-[280px] w-full transition-all">
        <Topbar 
          title={getTitle()} 
          onMenuClick={() => setIsSidebarOpen(true)} 
          onLogout={handleLogout}
        />
        
        <main className="flex-1 p-4 md:p-gutter lg:p-margin overflow-x-hidden">
          <div className="max-w-[1440px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Global Toast Notifications */}
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-sm items-end pointer-events-none">
          <AnimatePresence>
            {notifications.slice(0, 3).map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 20, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
                className="pointer-events-auto bg-surface-container-high border border-outline-variant rounded-xl p-md shadow-2xl flex items-center gap-md min-w-[300px] max-w-md"
              >
                {n.type === 'success' && <CheckCircle2 className="text-secondary shrink-0" size={20} />}
                {n.type === 'error' && <AlertCircle className="text-error shrink-0" size={20} />}
                {n.type === 'info' && <Bell className="text-primary shrink-0" size={20} />}
                
                <p className="text-sm font-bold text-on-surface flex-1">{n.message}</p>
                
                <button 
                  onClick={() => setNotifications(prev => prev.filter(notif => notif.id !== n.id))}
                  className="text-on-surface-variant hover:text-on-surface p-1"
                >
                  <X size={16} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

