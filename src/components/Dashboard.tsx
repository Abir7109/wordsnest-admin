import { Users, Clock, Languages, TrendingUp, ArrowUpRight, ArrowDownRight, Activity, ArrowRight } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { User, RequestLog } from "../types";
import { motion } from "motion/react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  users: User[];
  requests: RequestLog[];
}

const areaData = [
  { name: '00:00', value: 20 },
  { name: '03:00', value: 35 },
  { name: '06:00', value: 25 },
  { name: '09:00', value: 50 },
  { name: '12:00', value: 80 },
  { name: '15:00', value: 65 },
  { name: '18:00', value: 90 },
  { name: '21:00', value: 45 },
];

export default function Dashboard({ users, requests }: DashboardProps) {
  const avgLatency = requests.length > 0 
    ? Math.round(requests.reduce((acc, r) => acc + parseInt(r.time), 0) / requests.length) 
    : 0;
  
  const successRate = requests.length > 0 
    ? ((requests.filter(r => r.status === 'Success').length / requests.length) * 100).toFixed(1)
    : '100';

  const stats = [
    { label: 'Active Scholars', value: users.filter(u => u.type === 'Registered').length.toLocaleString(), icon: Users, color: 'text-primary' },
    { label: 'Linguistic Queries', value: requests.length.toString(), icon: Languages, color: 'text-secondary' },
    { label: 'Average Latency', value: `${avgLatency}ms`, icon: Clock, color: 'text-tertiary' },
    { label: 'Success Rate', value: `${successRate}%`, icon: Activity, color: 'text-primary' },
  ];

  return (
    <div className="space-y-gutter">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-gutter">
        {stats.map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={stat.label} 
            className="group bg-surface-container rounded-2xl p-lg border border-outline-variant hover:border-primary transition-all duration-300 shadow-sm hover:shadow-2xl backdrop-blur-sm"
          >
            <div className="flex justify-between items-center mb-lg">
              <div className={cn("p-md rounded-xl bg-surface-container-high shadow-inner", stat.color)}>
                <stat.icon size={24} />
              </div>
              <div className="flex items-center gap-xs text-[12px] font-bold px-2 py-1 rounded-full bg-secondary-container text-secondary">
                <ArrowUpRight size={14} />
                +12%
              </div>
            </div>
            <h4 className="text-on-surface-variant font-bold text-[11px] uppercase tracking-[0.2em] mb-xs">{stat.label}</h4>
            <p className="text-4xl font-display font-bold text-on-surface tracking-tight group-hover:text-primary transition-colors">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 bg-surface-container rounded-2xl border border-outline-variant p-xl shadow-2xl relative overflow-hidden backdrop-blur-sm h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-xl relative">
            <div>
              <h3 className="text-xl font-bold text-on-surface flex items-center gap-sm">
                <TrendingUp className="text-primary" size={24} />
                 System Performance Trace
              </h3>
              <p className="text-on-surface-variant text-sm font-medium">Real-time volumetric analysis of linguistic transactions.</p>
            </div>
            <select className="bg-surface-container-high border border-outline-variant rounded-xl px-lg py-sm text-sm font-bold text-on-surface outline-none cursor-pointer hover:border-primary transition-all shadow-sm">
              <option>Last 24 Hours</option>
              <option>Archival Year</option>
            </select>
          </div>
          
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e6d0b6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#e6d0b6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3c332f" vertical={false} />
                <XAxis dataKey="name" stroke="#d0c5ba" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#d0c5ba" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#211a16', borderColor: '#4d463d', borderRadius: '8px', color: '#efdfd9', fontSize: '12px' }}
                  itemStyle={{ color: '#e6d0b6' }}
                />
                <Area type="monotone" dataKey="value" stroke="#e6d0b6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-primary text-on-primary rounded-2xl p-xl shadow-2xl flex flex-col justify-between overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.1),_transparent)] pointer-events-none" />
          <div className="relative">
            <h3 className="text-xl font-bold mb-md flex items-center gap-sm">
              <Activity size={24} className="animate-pulse" />
              Engine Status
            </h3>
            <div className="space-y-lg">
              <div className="p-lg bg-on-primary/10 rounded-xl backdrop-blur-md border border-white/10 group hover:bg-on-primary/20 transition-all">
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-xs">Concurrent Scholars</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-display font-bold">142</span>
                  <Activity size={20} className="text-secondary" />
                </div>
              </div>
              <div className="p-lg bg-on-primary/10 rounded-xl backdrop-blur-md border border-white/10 group hover:bg-on-primary/20 transition-all">
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 mb-xs">System Uptime</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-display font-bold">99.998%</span>
                  <Clock size={20} className="text-secondary" />
                </div>
              </div>
            </div>
          </div>
          <button className="mt-xl w-full bg-on-primary text-primary py-md rounded-xl font-bold hover:bg-primary-container hover:text-on-primary-container transition-all shadow-xl group/btn overflow-hidden relative active:scale-95">
            <span className="relative z-10 flex items-center justify-center gap-sm">
              Run Diagnostic
              <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
