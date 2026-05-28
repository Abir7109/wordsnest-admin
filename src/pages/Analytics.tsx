import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line,
} from 'recharts';
import {
  Users, Search, BookOpen, Brain, TrendingUp, Activity,
} from 'lucide-react';
import { DashboardStats } from '../types';

const mockWeekly = [
  { day: 'Mon', searches: 42, words: 12, quizzes: 5 },
  { day: 'Tue', searches: 38, words: 8, quizzes: 7 },
  { day: 'Wed', searches: 55, words: 15, quizzes: 3 },
  { day: 'Thu', searches: 48, words: 10, quizzes: 6 },
  { day: 'Fri', searches: 62, words: 18, quizzes: 8 },
  { day: 'Sat', searches: 35, words: 7, quizzes: 4 },
  { day: 'Sun', searches: 28, words: 5, quizzes: 2 },
];

const statCards = [
  { key: 'users', label: 'Total Users', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'searches', label: 'Total Searches', icon: Search, color: 'text-nest-amber', bg: 'bg-amber-50' },
  { key: 'words', label: 'Saved Words', icon: BookOpen, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'quizzes', label: 'Quizzes Taken', icon: Brain, color: 'text-purple-600', bg: 'bg-purple-50' },
] as const;

const PIE_COLORS = ['#D48A4A', '#E8DDD0'];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Analytics() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/dashboard`);
        const data = await res.json();
        setStats(data);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const inactiveUsers = stats ? Math.max(0, stats.users - stats.activeUsers) : 0;
  const pieData = stats
    ? [
        { name: 'Active', value: stats.activeUsers },
        { name: 'Inactive', value: inactiveUsers },
      ]
    : [];

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <TrendingUp className="w-7 h-7 text-nest-amber" />
        <h1 className="text-2xl font-bold text-nest-brown">Analytics</h1>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          const value = stats ? stats[card.key as keyof DashboardStats] : '—';
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-nest-cream rounded-xl border border-nest-border p-5 flex items-center gap-4"
            >
              <div className={`w-12 h-12 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div>
                <p className="text-sm text-nest-muted">{card.label}</p>
                <p className="text-2xl font-bold text-nest-brown">
                  {loading ? (
                    <span className="inline-block w-8 h-5 rounded bg-nest-border animate-pulse" />
                  ) : (
                    value
                  )}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-nest-cream rounded-xl border border-nest-border p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-nest-amber" />
            <h2 className="text-lg font-semibold text-nest-brown">Weekly Activity</h2>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mockWeekly} barSize={18} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
              <XAxis dataKey="day" tick={{ fill: '#897365', fontSize: 12 }} axisLine={{ stroke: '#E8DDD0' }} />
              <YAxis tick={{ fill: '#897365', fontSize: 12 }} axisLine={{ stroke: '#E8DDD0' }} />
              <Tooltip
                contentStyle={{
                  background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 13,
                }}
              />
              <Bar dataKey="searches" name="Searches" fill="#D48A4A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="words" name="Words" fill="#AA7137" radius={[4, 4, 0, 0]} />
              <Bar dataKey="quizzes" name="Quizzes" fill="#E8DDD0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-nest-cream rounded-xl border border-nest-border p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-nest-amber" />
            <h2 className="text-lg font-semibold text-nest-brown">User Status</h2>
          </div>
          {loading || !stats ? (
            <div className="flex items-center justify-center h-[200px]">
              <span className="text-nest-muted">Loading...</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 13,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-center gap-6 mt-2">
            {pieData.map((entry, idx) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx] }} />
                <span className="text-nest-muted">{entry.name}</span>
                <span className="font-semibold text-nest-brown">{entry.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-nest-cream rounded-xl border border-nest-border p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-nest-amber" />
          <h2 className="text-lg font-semibold text-nest-brown">Activity Trend</h2>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={mockWeekly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
            <XAxis dataKey="day" tick={{ fill: '#897365', fontSize: 12 }} axisLine={{ stroke: '#E8DDD0' }} />
            <YAxis tick={{ fill: '#897365', fontSize: 12 }} axisLine={{ stroke: '#E8DDD0' }} />
            <Tooltip
              contentStyle={{
                background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 13,
              }}
            />
            <Line type="monotone" dataKey="searches" name="Searches" stroke="#D48A4A" strokeWidth={2} dot={{ fill: '#D48A4A', r: 4 }} />
            <Line type="monotone" dataKey="words" name="Words" stroke="#AA7137" strokeWidth={2} dot={{ fill: '#AA7137', r: 4 }} />
            <Line type="monotone" dataKey="quizzes" name="Quizzes" stroke="#E8DDD0" strokeWidth={2} dot={{ fill: '#E8DDD0', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
