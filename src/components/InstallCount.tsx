import { Users, UserX, Activity, Smartphone, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

interface InstallStats {
  totalInstalls: number;
  activeUsers: number;
  uninstalls: number;
  recentInstalls: any[];
}

interface InstallCountProps {
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
}

export default function InstallCount({ onNotify }: InstallCountProps) {
  const [stats, setStats] = useState<InstallStats>({
    totalInstalls: 0,
    activeUsers: 0,
    uninstalls: 0,
    recentInstalls: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      setRefreshing(true);
      console.log('Fetching install analytics...');
      const response = await fetch('/api/install-analytics');
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error('Failed to fetch');
      }
      
      const data = await response.json();
      console.log('Received data:', data);
      
      // Handle case where firestore is not available
      if (data.error) {
        console.log('Install analytics error:', data.error);
        setStats({
          totalInstalls: 0,
          activeUsers: 0,
          uninstalls: 0,
          recentInstalls: []
        });
      } else {
        console.log('Setting stats:', data);
        setStats(data);
      }
      onNotify('Stats refreshed', 'success');
    } catch (err) {
      console.error('Failed to fetch install stats:', err);
      // Don't show error - just set empty stats
      setStats({
        totalInstalls: 0,
        activeUsers: 0,
        uninstalls: 0,
        recentInstalls: []
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const uninstallRate = stats.totalInstalls > 0 
    ? Math.round((stats.uninstalls / stats.totalInstalls) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-md">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Smartphone className="text-primary" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">Install Analytics</h2>
            <p className="text-sm text-on-surface-variant">Live tracking of installs & uninstalls</p>
          </div>
        </div>
        <button
          onClick={fetchStats}
          disabled={refreshing}
          className="flex items-center gap-sm px-md py-sm rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg">
        {/* Total Installs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-container rounded-xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <Users size={20} className="text-primary" />
            <span className="text-sm font-medium text-on-surface-variant">Total Installs</span>
          </div>
          <p className="text-4xl font-display font-bold text-on-surface">{stats.totalInstalls}</p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <Activity size={14} />
            <span>All time</span>
          </div>
        </motion.div>

        {/* Active Users */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface-container rounded-xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <Activity size={20} className="text-secondary" />
            <span className="text-sm font-medium text-on-surface-variant">Active Users</span>
          </div>
          <p className="text-4xl font-display font-bold text-secondary">{stats.activeUsers}</p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <TrendingUp size={14} className="text-secondary" />
            <span>Last 7 days</span>
          </div>
        </motion.div>

        {/* Likely Uninstalled */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface-container rounded-xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <UserX size={20} className="text-error" />
            <span className="text-sm font-medium text-on-surface-variant">Likely Uninstalled</span>
          </div>
          <p className="text-4xl font-display font-bold text-error">{stats.uninstalls}</p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <TrendingDown size={14} className="text-error" />
            <span>Last 30 days</span>
          </div>
        </motion.div>

        {/* Uninstall Rate */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface-container rounded-xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <Activity size={20} className="text-warning" />
            <span className="text-sm font-medium text-on-surface-variant">Uninstall Rate</span>
          </div>
          <p className="text-4xl font-display font-bold text-warning">{uninstallRate}%</p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <span>Of total installs</span>
          </div>
        </motion.div>
      </div>

      {/* Real-time Status Banner */}
      <div className={cn(
        "p-md rounded-xl border flex items-center gap-md",
        stats.activeUsers > 0 ? "bg-secondary/10 border-secondary/30" : "bg-surface-container-high border-outline-variant"
      )}>
        <div className={cn(
          "w-3 h-3 rounded-full",
          stats.activeUsers > 0 ? "bg-secondary animate-pulse" : "bg-on-surface-variant"
        )} />
        <span className="text-sm font-medium text-on-surface">
          {stats.activeUsers > 0 
            ? `🔴 ${stats.activeUsers} users currently active`
            : "No active users right now"}
        </span>
      </div>

      {/* Recent Installs Table */}
      <div className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden">
        <div className="p-lg border-b border-outline-variant">
          <h3 className="text-lg font-semibold text-on-surface">Recent Installs</h3>
        </div>
        
        {stats.recentInstalls.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="text-left py-md px-lg text-sm font-bold text-on-surface-variant">User ID</th>
                  <th className="text-left py-md px-lg text-sm font-bold text-on-surface-variant">App Version</th>
                  <th className="text-left py-md px-lg text-sm font-bold text-on-surface-variant">Device</th>
                  <th className="text-left py-md px-lg text-sm font-bold text-on-surface-variant">Install Date</th>
                  <th className="text-left py-md px-lg text-sm font-bold text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentInstalls.map((install: any, index: number) => (
                  <tr key={index} className="border-t border-outline-variant/30 hover:bg-surface-container-low transition-colors">
                    <td className="py-md px-lg text-sm text-on-surface font-mono">
                      {install.user_id?.substring(0, 20) || 'N/A'}
                    </td>
                    <td className="py-md px-lg text-sm text-on-surface">
                      {install.app_version || 'N/A'}
                    </td>
                    <td className="py-md px-lg text-sm text-on-surface">
                      {install.device_model || 'Unknown'}
                    </td>
                    <td className="py-md px-lg text-sm text-on-surface">
                      {install.install_date 
                        ? new Date(install.install_date).toLocaleDateString() 
                        : 'N/A'}
                    </td>
                    <td className="py-md px-lg">
                      <span className={cn(
                        "px-sm py-xs rounded-full text-xs font-bold uppercase",
                        install.status === 'active' ? "bg-secondary/20 text-secondary" : 
                        install.status === 'uninstalled' ? "bg-error/20 text-error" : 
                        "bg-outline text-on-surface-variant"
                      )}>
                        {install.status || 'unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-xl text-center text-on-surface-variant">
            <Smartphone size={48} className="mx-auto mb-md opacity-30" />
            <p>No installs recorded yet</p>
          </div>
        )}
      </div>
    </div>
  );
}