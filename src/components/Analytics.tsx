import { BarChart3, TrendingUp, PieChart as PieChartIcon, Download, Calendar, Activity, Users, Smartphone, UserX, Clock } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { RequestLog } from "../types";
import { motion } from "motion/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { useState, useEffect } from "react";

interface AnalyticsProps {
  requests: RequestLog[];
}

interface InstallStats {
  totalInstalls: number;
  activeUsers: number;
  likelyUninstalled: number;
  recentInstalls: any[];
}

export default function Analytics({ requests }: AnalyticsProps) {
  const [installStats, setInstallStats] = useState<InstallStats>({
    totalInstalls: 0,
    activeUsers: 0,
    likelyUninstalled: 0,
    recentInstalls: []
  });

  useEffect(() => {
    fetch('/api/install-analytics')
      .then(res => res.json())
      .then(data => setInstallStats(data))
      .catch(err => console.log('Failed to fetch install analytics:', err));
  }, []);

  const successCount = requests.filter(r => r.status === 'Success').length;
  const errorCount = requests.filter(r => r.status === 'Error').length;

  const pieData = [
    { name: 'Success', value: successCount },
    { name: 'Error', value: errorCount },
  ];

  const totalReqs = requests.length || 1;
  const healthPercent = Math.round((successCount / totalReqs) * 100);

  const COLORS = ['#e6d0b6', '#ef4444'];

  const barData = [
    { day: 'Mon', count: 120 },
    { day: 'Tue', count: 150 },
    { day: 'Wed', count: 180 },
    { day: 'Thu', count: 140 },
    { day: 'Fri', count: 210 },
    { day: 'Sat', count: 90 },
    { day: 'Sun', count: 70 },
  ];

  return (
    <div className="space-y-gutter relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-lg mb-xl">
        <div>
          <h2 className="font-display text-4xl font-bold text-on-surface mb-xs tracking-tight">Platform Analytics</h2>
          <p className="text-on-surface-variant font-medium">Deep insights into linguistic query behavior and system reliability.</p>
        </div>
        <div className="flex gap-md">
          <div className="bg-surface-container-high border border-outline-variant rounded-xl px-lg py-sm flex items-center gap-md shadow-sm">
             <Calendar size={18} className="text-primary" />
             <span className="text-sm font-bold text-on-surface">Current Billing Cycle</span>
          </div>
          <button className="flex items-center gap-sm bg-primary text-on-primary px-lg py-sm rounded-xl font-bold hover:bg-primary-fixed transition-all active:scale-95 shadow-lg shadow-primary/10">
            <Download size={18} />
            Generate Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl backdrop-blur-sm h-[450px] flex flex-col">
          <div className="flex justify-between items-center mb-xl">
            <div className="flex items-center gap-sm">
              <TrendingUp size={24} className="text-primary" />
              <h3 className="text-xl font-bold text-on-surface">Request Volume Distribution</h3>
            </div>
            <div className="flex bg-surface-container-high rounded-xl p-1 border border-outline-variant shadow-inner">
               <button className="px-lg py-sm text-[11px] font-bold uppercase tracking-widest bg-primary text-on-primary rounded-lg transition-all shadow-md">Daily</button>
               <button className="px-lg py-sm text-[11px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-all">Weekly</button>
            </div>
          </div>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3c332f" vertical={false} />
                <XAxis dataKey="day" stroke="#d0c5ba" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#d0c5ba" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(230, 208, 182, 0.05)' }}
                  contentStyle={{ backgroundColor: '#211a16', borderColor: '#4d463d', borderRadius: '12px', color: '#efdfd9' }}
                />
                <Bar dataKey="count" fill="#e6d0b6" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl flex flex-col h-[450px]">
          <div className="flex items-center gap-sm mb-xl">
            <PieChartIcon size={24} className="text-secondary" />
            <h3 className="text-xl font-bold text-on-surface">Transaction Outcome</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="h-[240px] w-full relative">
              <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none z-10">
                 <span className="text-3xl font-display font-bold text-on-surface leading-none">{healthPercent}%</span>
                 <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Health</span>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="hover:opacity-80 transition-opacity cursor-pointer outline-none" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-xl grid grid-cols-2 gap-xl w-full px-lg">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex flex-col gap-xs">
                  <div className="flex items-center gap-sm">
                    <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">{d.name}</span>
                  </div>
                  <span className="text-2xl font-display font-bold text-on-surface">{d.value} <span className="text-sm opacity-30">reqs</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-12 bg-surface-container-high border border-outline-variant rounded-2xl p-xl shadow-2xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-lg opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all pointer-events-none">
              <Activity size={120} className="text-primary/10" />
           </div>
           <h3 className="text-xl font-bold text-on-surface mb-lg flex items-center gap-sm">
              <BarChart3 className="text-primary" size={24} />
              Model Precision Report
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-xl relative z-10">
              {[
                { label: 'Token Efficiency', value: '0.84', desc: 'Avg tokens per definition', color: 'text-primary' },
                { label: 'Nuance Score', value: '4.92/5', desc: 'Based on manual auditor feedback', color: 'text-secondary' },
                { label: 'Retry Probability', value: '0.003%', desc: 'Recursive agent loop triggers', color: 'text-tertiary' }
              ].map(item => (
                <div key={item.label} className="p-lg bg-surface-container rounded-xl border border-outline-variant shadow-inner hover:border-primary/30 transition-all">
                   <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-md">{item.label}</p>
                   <p className={cn("text-3xl font-display font-bold mb-xs", item.color)}>{item.value}</p>
                   <p className="text-xs text-on-surface-variant font-medium italic">{item.desc}</p>
                </div>
              ))}
           </div>
        </div>

        {/* Install Analytics Section */}
        <div className="lg:col-span-12 bg-surface-container border border-outline-variant rounded-2xl p-xl shadow-2xl">
          <div className="flex items-center gap-sm mb-lg">
            <Smartphone size={24} className="text-primary" />
            <h3 className="text-xl font-bold text-on-surface">Install Analytics</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">
            <div className="bg-surface-container-high rounded-xl p-lg border border-outline-variant">
              <div className="flex items-center gap-sm mb-md">
                <Users size={18} className="text-primary" />
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Total Installs</span>
              </div>
              <p className="text-3xl font-display font-bold text-on-surface">{installStats.totalInstalls}</p>
            </div>
            
            <div className="bg-surface-container-high rounded-xl p-lg border border-outline-variant">
              <div className="flex items-center gap-sm mb-md">
                <Activity size={18} className="text-secondary" />
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Active Users (7 days)</span>
              </div>
              <p className="text-3xl font-display font-bold text-secondary">{installStats.activeUsers}</p>
            </div>
            
            <div className="bg-surface-container-high rounded-xl p-lg border border-outline-variant">
              <div className="flex items-center gap-sm mb-md">
                <UserX size={18} className="text-error" />
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Likely Uninstalled (30 days)</span>
              </div>
              <p className="text-3xl font-display font-bold text-error">{installStats.likelyUninstalled}</p>
            </div>
          </div>

          {installStats.recentInstalls.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-on-surface mb-md flex items-center gap-sm">
                <Clock size={18} className="text-on-surface-variant" />
                Recent Installs
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      <th className="text-left py-sm px-md text-on-surface-variant font-bold text-[11px] uppercase">User ID</th>
                      <th className="text-left py-sm px-md text-on-surface-variant font-bold text-[11px] uppercase">App Version</th>
                      <th className="text-left py-sm px-md text-on-surface-variant font-bold text-[11px] uppercase">Device</th>
                      <th className="text-left py-sm px-md text-on-surface-variant font-bold text-[11px] uppercase">Install Date</th>
                      <th className="text-left py-sm px-md text-on-surface-variant font-bold text-[11px] uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installStats.recentInstalls.map((install: any, i: number) => (
                      <tr key={i} className="border-b border-outline-variant/50 hover:bg-surface-container-high transition-colors">
                        <td className="py-sm px-md text-on-surface font-mono text-xs">{install.user_id || install.userId || 'N/A'}</td>
                        <td className="py-sm px-md text-on-surface">{install.app_version || 'N/A'}</td>
                        <td className="py-sm px-md text-on-surface">{install.device_model || 'Unknown'}</td>
                        <td className="py-sm px-md text-on-surface">
                          {install.install_date ? new Date(install.install_date).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-sm px-md">
                          <span className={cn(
                            "px-sm py-xs rounded-full text-[10px] font-bold uppercase",
                            install.status === 'active' ? "bg-secondary/20 text-secondary" : "bg-error/20 text-error"
                          )}>
                            {install.status || 'unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
