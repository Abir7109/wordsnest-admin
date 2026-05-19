import { useState, useEffect, useMemo } from "react";
import { Users, Clock, Languages, TrendingUp, ArrowUpRight, ArrowDownRight, Activity, ArrowRight, Zap, Globe, Target, AlertCircle, CheckCircle2, Clock3, Wifi, WifiOff, BookOpen, Search, Smartphone, UserPlus, LogOut, ChevronRight, BarChart3, PieChart as PieChartIcon, TrendingDown, Crown, Ghost } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { User, RequestLog } from "../types";
import { motion } from "motion/react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface DashboardProps {
  users: User[];
  requests: RequestLog[];
}

interface InstallStats {
  totalInstalls: number;
  activeUsers: number;
  uninstalls: number;
  recentInstalls: any[];
}

export default function Dashboard({ users, requests }: DashboardProps) {
  const [installStats, setInstallStats] = useState<InstallStats>({
    totalInstalls: 0,
    activeUsers: 0,
    uninstalls: 0,
    recentInstalls: []
  });

  useEffect(() => {
    fetch('/api/install-analytics')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setInstallStats(data);
      })
      .catch(() => {});
  }, []);

  const stats = useMemo(() => {
    const registered = users.filter(u => u.type === 'Registered').length;
    const guests = users.filter(u => u.type === 'Guest').length;
    const avgLatency = requests.length > 0
      ? Math.round(requests.reduce((acc, r) => acc + parseInt(r.time.replace(/\D/g, '') || '0'), 0) / requests.length)
      : 0;
    const successCount = requests.filter(r => r.status === 'Success').length;
    const successRate = requests.length > 0 ? ((successCount / requests.length) * 100).toFixed(1) : '100';

    return { registered, guests, avgLatency, successRate, successCount };
  }, [users, requests]);

  const areaData = useMemo(() => {
    const hourlyData: Record<string, { time: string; success: number; error: number }> = {};
    requests.forEach(r => {
      const hour = new Date(r.timestamp).getHours();
      const timeKey = `${hour.toString().padStart(2, '0')}:00`;
      if (!hourlyData[timeKey]) hourlyData[timeKey] = { time: timeKey, success: 0, error: 0 };
      if (r.status === 'Success') hourlyData[timeKey].success++;
      else hourlyData[timeKey].error++;
    });
    return Object.values(hourlyData).slice(0, 12);
  }, [requests]);

  const topWords = useMemo(() => {
    const wordCounts: Record<string, number> = {};
    requests.forEach(r => {
      if (r.word) {
        wordCounts[r.word] = (wordCounts[r.word] || 0) + 1;
      }
    });
    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, count }));
  }, [requests]);

  const recentActivity = useMemo(() => {
    return requests.slice(0, 10).map(r => ({
      ...r,
      icon: r.status === 'Success' ? <CheckCircle2 size={16} className="text-secondary" /> : <AlertCircle size={16} className="text-error" />,
      timeAgo: getTimeAgo(r.timestamp)
    }));
  }, [requests]);

  const pieData = [
    { name: 'Registered', value: stats.registered, color: '#e6d0b6' },
    { name: 'Guest', value: stats.guests, color: '#3c332f' }
  ];

  const statusPieData = [
    { name: 'Success', value: stats.successCount, color: '#aad0ad' },
    { name: 'Error', value: requests.length - stats.successCount, color: '#ffb4ab' }
  ];

  return (
    <div className="space-y-gutter">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter mb-gutter">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="group bg-surface-container rounded-2xl p-lg border border-outline-variant hover:border-primary transition-all duration-300 shadow-sm hover:shadow-2xl"
        >
          <div className="flex justify-between items-center mb-lg">
            <div className="p-md rounded-xl bg-surface-container-high shadow-inner text-primary">
              <Users size={24} />
            </div>
            <div className="flex items-center gap-xs text-[12px] font-bold px-2 py-1 rounded-full bg-secondary/20 text-secondary">
              <ArrowUpRight size={14} />
              {stats.registered}
            </div>
          </div>
          <h4 className="text-on-surface-variant font-bold text-[10px] uppercase tracking-[0.2em] mb-xs">Registered Scholars</h4>
          <p className="text-3xl font-display font-bold text-on-surface tracking-tight group-hover:text-primary transition-colors">{stats.registered.toLocaleString()}</p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <Crown size={12} className="text-primary" />
            <span>{stats.guests} guests</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="group bg-surface-container rounded-2xl p-lg border border-outline-variant hover:border-secondary transition-all duration-300 shadow-sm hover:shadow-2xl"
        >
          <div className="flex justify-between items-center mb-lg">
            <div className="p-md rounded-xl bg-surface-container-high shadow-inner text-secondary">
              <Languages size={24} />
            </div>
            <div className="flex items-center gap-xs text-[12px] font-bold px-2 py-1 rounded-full bg-secondary/20 text-secondary">
              <ArrowUpRight size={14} />
              +{requests.length > 100 ? '100' : requests.length}%
            </div>
          </div>
          <h4 className="text-on-surface-variant font-bold text-[10px] uppercase tracking-[0.2em] mb-xs">Linguistic Queries</h4>
          <p className="text-3xl font-display font-bold text-on-surface tracking-tight group-hover:text-secondary transition-colors">{requests.length.toLocaleString()}</p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <Search size={12} />
            <span>Total requests</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group bg-surface-container rounded-2xl p-lg border border-outline-variant hover:border-primary transition-all duration-300 shadow-sm hover:shadow-2xl"
        >
          <div className="flex justify-between items-center mb-lg">
            <div className="p-md rounded-xl bg-surface-container-high shadow-inner text-primary">
              <Clock size={24} />
            </div>
            <div className="flex items-center gap-xs text-[12px] font-bold px-2 py-1 rounded-full bg-surface-container-high text-on-surface-variant">
              <Zap size={14} className="text-primary" />
              ms
            </div>
          </div>
          <h4 className="text-on-surface-variant font-bold text-[10px] uppercase tracking-[0.2em] mb-xs">Average Latency</h4>
          <p className="text-3xl font-display font-bold text-on-surface tracking-tight group-hover:text-primary transition-colors">{stats.avgLatency}<span className="text-lg ml-1">ms</span></p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <Activity size={12} />
            <span>Response time</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="group bg-surface-container rounded-2xl p-lg border border-outline-variant hover:border-secondary transition-all duration-300 shadow-sm hover:shadow-2xl"
        >
          <div className="flex justify-between items-center mb-lg">
            <div className="p-md rounded-xl bg-surface-container-high shadow-inner text-secondary">
              <Target size={24} />
            </div>
            <div className="flex items-center gap-xs text-[12px] font-bold px-2 py-1 rounded-full bg-secondary/20 text-secondary">
              <CheckCircle2 size={14} />
              {stats.successRate}%
            </div>
          </div>
          <h4 className="text-on-surface-variant font-bold text-[10px] uppercase tracking-[0.2em] mb-xs">Success Rate</h4>
          <p className="text-3xl font-display font-bold text-on-surface tracking-tight group-hover:text-secondary transition-colors">{stats.successRate}<span className="text-lg ml-1">%</span></p>
          <div className="flex items-center gap-xs mt-sm text-xs text-on-surface-variant">
            <CheckCircle2 size={12} className="text-secondary" />
            <span>{requests.length - stats.successCount} errors</span>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl relative overflow-hidden backdrop-blur-sm" style={{ minHeight: '380px' }}>
          <div className="flex justify-between items-center mb-xl relative">
            <div>
              <h3 className="text-xl font-bold text-on-surface flex items-center gap-sm">
                <TrendingUp className="text-primary" size={24} />
                Request Volume Trace
              </h3>
              <p className="text-on-surface-variant text-sm font-medium">Real-time linguistic transaction analysis</p>
            </div>
            <div className="flex items-center gap-md">
              <div className="flex items-center gap-xs text-xs">
                <div className="w-3 h-3 rounded-full bg-secondary" />
                <span className="text-on-surface-variant">Success</span>
              </div>
              <div className="flex items-center gap-xs text-xs">
                <div className="w-3 h-3 rounded-full bg-error" />
                <span className="text-on-surface-variant">Error</span>
              </div>
            </div>
          </div>

          <div className="flex-1 w-full" style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData.length > 0 ? areaData : [{ time: '00:00', success: 0, error: 0 }]}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#aad0ad" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#aad0ad" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffb4ab" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ffb4ab" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3c332f" vertical={false} />
                <XAxis dataKey="time" stroke="#d0c5ba" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#d0c5ba" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#211a16', borderColor: '#4d463d', borderRadius: '8px', color: '#efdfd9', fontSize: '12px' }}
                  itemStyle={{ color: '#aad0ad' }}
                />
                <Area type="monotone" dataKey="success" stroke="#aad0ad" strokeWidth={2} fillOpacity={1} fill="url(#colorSuccess)" />
                <Area type="monotone" dataKey="error" stroke="#ffb4ab" strokeWidth={2} fillOpacity={1} fill="url(#colorError)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-primary text-on-primary rounded-2xl p-xl shadow-2xl flex flex-col overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.1),_transparent)] pointer-events-none" />
          <div className="relative">
            <h3 className="text-xl font-bold mb-md flex items-center gap-sm">
              <Activity size={24} className="animate-pulse" />
              Engine Status
            </h3>
            <div className="space-y-md">
              <div className="p-md bg-on-primary/10 rounded-xl backdrop-blur-md border border-white/10 group hover:bg-on-primary/20 transition-all">
                <div className="flex items-center justify-between mb-xs">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Active Scholars</p>
                  <Wifi size={16} className="text-secondary" />
                </div>
                <span className="text-2xl font-display font-bold">{installStats.activeUsers || stats.registered}</span>
              </div>
              <div className="p-md bg-on-primary/10 rounded-xl backdrop-blur-md border border-white/10 group hover:bg-on-primary/20 transition-all">
                <div className="flex items-center justify-between mb-xs">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">System Uptime</p>
                  <Clock3 size={16} className="text-secondary" />
                </div>
                <span className="text-2xl font-display font-bold">99.9%</span>
              </div>
              <div className="p-md bg-on-primary/10 rounded-xl backdrop-blur-md border border-white/10 group hover:bg-on-primary/20 transition-all">
                <div className="flex items-center justify-between mb-xs">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Total Installs</p>
                  <Smartphone size={16} className="text-secondary" />
                </div>
                <span className="text-2xl font-display font-bold">{installStats.totalInstalls || users.length}</span>
              </div>
            </div>
          </div>
          <div className="mt-auto pt-lg relative">
            <div className="flex items-center gap-xs">
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-xs font-bold opacity-80">System Operational</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-4 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl">
          <div className="flex items-center gap-sm mb-lg">
            <PieChartIcon size={20} className="text-primary" />
            <h3 className="text-lg font-bold text-on-surface">User Distribution</h3>
          </div>
          <div className="h-[180px] flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none z-10">
              <span className="text-2xl font-display font-bold text-on-surface leading-none">{users.length}</span>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Total</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-lg grid grid-cols-2 gap-md">
            <div className="flex items-center gap-md p-md bg-surface-container-high rounded-xl">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <div>
                <p className="text-lg font-display font-bold text-on-surface">{stats.registered}</p>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase">Registered</p>
              </div>
            </div>
            <div className="flex items-center gap-md p-md bg-surface-container-high rounded-xl">
              <div className="w-3 h-3 rounded-full bg-surface-container-highest" />
              <div>
                <p className="text-lg font-display font-bold text-on-surface">{stats.guests}</p>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase">Guest</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl">
          <div className="flex items-center gap-sm mb-lg">
            <Globe size={20} className="text-secondary" />
            <h3 className="text-lg font-bold text-on-surface">Top Searched Words</h3>
          </div>
          <div className="space-y-sm">
            {topWords.length > 0 ? topWords.map((item, i) => (
              <div key={item.word} className="flex items-center gap-md p-sm bg-surface-container-high rounded-lg hover:bg-surface-container-highest transition-colors group cursor-pointer">
                <div className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                  i === 0 ? "bg-primary/20 text-primary" :
                  i === 1 ? "bg-secondary/20 text-secondary" :
                  i === 2 ? "bg-tertiary/20 text-tertiary" :
                  "bg-surface-container-highest text-on-surface-variant"
                )}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors capitalize">{item.word}</p>
                </div>
                <div className="flex items-center gap-xs text-on-surface-variant">
                  <Search size={12} />
                  <span className="text-xs font-bold">{item.count}</span>
                </div>
              </div>
            )) : (
              <div className="text-center py-xl text-on-surface-variant">
                <Search size={32} className="mx-auto mb-md opacity-30" />
                <p className="text-sm">No search data yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl">
          <div className="flex items-center gap-sm mb-lg">
            <BarChart3 size={20} className="text-tertiary" />
            <h3 className="text-lg font-bold text-on-surface">Request Health</h3>
          </div>
          <div className="h-[180px] flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none z-10">
              <span className="text-2xl font-display font-bold text-on-surface leading-none">{stats.successRate}%</span>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Health</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-lg grid grid-cols-2 gap-md">
            <div className="flex items-center gap-md p-md bg-surface-container-high rounded-xl">
              <CheckCircle2 size={16} className="text-secondary" />
              <div>
                <p className="text-lg font-display font-bold text-on-surface">{stats.successCount}</p>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase">Success</p>
              </div>
            </div>
            <div className="flex items-center gap-md p-md bg-surface-container-high rounded-xl">
              <AlertCircle size={16} className="text-error" />
              <div>
                <p className="text-lg font-display font-bold text-on-surface">{requests.length - stats.successCount}</p>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase">Errors</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl">
          <div className="flex items-center justify-between mb-lg">
            <div className="flex items-center gap-sm">
              <Clock3 size={20} className="text-primary" />
              <h3 className="text-lg font-bold text-on-surface">Recent Activity</h3>
            </div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest bg-surface-container-high px-md py-xs rounded-full">Live</span>
          </div>
          <div className="space-y-sm max-h-[300px] overflow-y-auto pr-sm">
            {recentActivity.length > 0 ? recentActivity.map((activity, i) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-md p-md bg-surface-container-high rounded-xl hover:bg-surface-container-highest transition-colors"
              >
                <div className="p-sm bg-surface-container rounded-lg">
                  {activity.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-on-surface truncate">
                    <span className="capitalize">{activity.word}</span>
                    <span className="text-on-surface-variant font-normal ml-sm">by {activity.userId}</span>
                  </p>
                  <p className="text-xs text-on-surface-variant">{activity.time}</p>
                </div>
                <div className="flex items-center gap-xs text-xs">
                  <Clock size={12} className="text-on-surface-variant" />
                  <span className="text-on-surface-variant">{activity.time}</span>
                </div>
              </motion.div>
            )) : (
              <div className="text-center py-xl text-on-surface-variant">
                <Activity size={32} className="mx-auto mb-md opacity-30" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl">
          <div className="flex items-center gap-sm mb-lg">
            <Smartphone size={20} className="text-secondary" />
            <h3 className="text-lg font-bold text-on-surface">Install Summary</h3>
          </div>
          <div className="space-y-lg">
            <div className="p-md bg-surface-container-high rounded-xl">
              <div className="flex items-center justify-between mb-xs">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Total Installs</span>
                <UserPlus size={14} className="text-primary" />
              </div>
              <p className="text-2xl font-display font-bold text-on-surface">{installStats.totalInstalls || users.length}</p>
            </div>
            <div className="p-md bg-surface-container-high rounded-xl">
              <div className="flex items-center justify-between mb-xs">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Active (7 days)</span>
                <Activity size={14} className="text-secondary" />
              </div>
              <p className="text-2xl font-display font-bold text-secondary">{installStats.activeUsers || stats.registered}</p>
            </div>
            <div className="p-md bg-surface-container-high rounded-xl">
              <div className="flex items-center justify-between mb-xs">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Uninstalled</span>
                <LogOut size={14} className="text-error" />
              </div>
              <p className="text-2xl font-display font-bold text-error">{installStats.uninstalls || 0}</p>
            </div>
          </div>
          <div className="mt-lg">
            <div className="flex items-center justify-between mb-xs">
              <span className="text-xs text-on-surface-variant">Retention Rate</span>
              <span className="text-sm font-bold text-secondary">{installStats.totalInstalls > 0 ? Math.round((installStats.activeUsers / installStats.totalInstalls) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${installStats.totalInstalls > 0 ? (installStats.activeUsers / installStats.totalInstalls) * 100 : 0}%` }}
                className="h-full bg-secondary rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface-container rounded-2xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <div className="p-sm bg-secondary/20 rounded-lg">
              <Users size={18} className="text-secondary" />
            </div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Total Users</span>
          </div>
          <p className="text-2xl font-display font-bold text-on-surface">{users.length}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-surface-container rounded-2xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <div className="p-sm bg-primary/20 rounded-lg">
              <BookOpen size={18} className="text-primary" />
            </div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Total Words</span>
          </div>
          <p className="text-2xl font-display font-bold text-on-surface">
            {users.reduce((acc, u) => acc + (u.words || 0), 0)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface-container rounded-2xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <div className="p-sm bg-tertiary/20 rounded-lg">
              <Globe size={18} className="text-tertiary" />
            </div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Languages</span>
          </div>
          <p className="text-2xl font-display font-bold text-on-surface">English</p>
          <p className="text-xs text-on-surface-variant">Primary</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-surface-container rounded-2xl p-lg border border-outline-variant"
        >
          <div className="flex items-center gap-sm mb-md">
            <div className="p-sm bg-surface-container-high rounded-lg">
              <Zap size={18} className="text-primary" />
            </div>
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">AI Model</span>
          </div>
          <p className="text-2xl font-display font-bold text-on-surface">Gemini</p>
          <p className="text-xs text-on-surface-variant">Active</p>
        </motion.div>
      </div>
    </div>
  );
}

function getTimeAgo(timestamp: string): string {
  try {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return 'Unknown';
  }
}