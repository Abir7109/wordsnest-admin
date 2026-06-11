import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { Users, Search, BookOpen, Brain, TrendingUp, Clock, Zap, Target, Activity, UserPlus, BarChart3, Sparkles, Layers, RefreshCw, Smartphone } from 'lucide-react';
import type { DashboardStats, TimelineDay, TopWord, TopSearch, WordTypeStat, RecentActivity } from '../types';
import { apiFetch } from '../api';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatCard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-4 flex flex-col gap-1.5 hover:shadow-lg hover:border-[#D48A4A]/30 transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#897365] uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <span className="text-2xl font-bold text-[#2A170F]">{value}</span>
      <div className="flex items-center gap-1.5">
        {trend !== undefined && (
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
        <span className="text-xs text-[#897365]">{sub}</span>
      </div>
    </motion.div>
  );
}

function TimelineChart({ data }) {
  return (
    <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
      <h3 className="text-sm font-semibold text-[#2A170F] mb-4">7-Day Activity</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#897365' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#897365' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#2A170F', fontWeight: 600 }}
            />
            <Line type="monotone" dataKey="searches" stroke="#D48A4A" strokeWidth={2} dot={{ r: 3 }} name="Searches" />
            <Line type="monotone" dataKey="words" stroke="#AA7137" strokeWidth={2} dot={{ r: 3 }} name="Words Saved" />
            <Line type="monotone" dataKey="quizzes" stroke="#8B5E2E" strokeWidth={2} dot={{ r: 3 }} name="Quizzes" />
            <Line type="monotone" dataKey="newUsers" stroke="#4A7C59" strokeWidth={2} dot={{ r: 3 }} name="New Users" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WordTypePie({ data }) {
  const COLORS = ['#D48A4A', '#AA7137', '#8B5E2E', '#6B4F2E', '#C4956A', '#A08060', '#907050', '#E8C4A0'];
  return (
    <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
      <h3 className="text-sm font-semibold text-[#2A170F] mb-4">Word Types</h3>
      {data.length > 0 ? (
        <div className="flex items-center gap-4">
          <div className="h-48 w-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="type">
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [`${value} words`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5">
            {data.slice(0, 6).map((item, i) => (
              <div key={item.type} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-[#2A170F] flex-1">{item.type}</span>
                <span className="text-[#897365]">{item.count}</span>
                <span className="text-[#BFA090] w-8 text-right">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[#897365] text-center py-8">No word type data yet</p>
      )}
    </div>
  );
}

function TopWordsList({ data }) {
  return (
    <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
      <h3 className="text-sm font-semibold text-[#2A170F] mb-3">Most Saved Words</h3>
      {data.length > 0 ? (
        <div className="space-y-1.5">
          {data.slice(0, 8).map((item, i) => (
            <div key={item.word} className="flex items-center gap-3 py-1.5 border-b border-[#E8DDD0]/50 last:border-0">
              <span className="text-xs font-bold text-[#BFA090] w-5">#{i + 1}</span>
              <span className="text-sm font-medium text-[#2A170F] flex-1 truncate capitalize">{item.word}</span>
              {item.type && (
                <span className="text-[10px] text-[#AA7137] bg-[#F5F0EB] px-1.5 py-0.5 rounded">{item.type}</span>
              )}
              <span className="text-xs font-semibold text-[#897365]">{item.count}x</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#897365] text-center py-8">No words saved yet</p>
      )}
    </div>
  );
}

function TopSearchesList({ data }) {
  return (
    <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
      <h3 className="text-sm font-semibold text-[#2A170F] mb-3">Top Searches</h3>
      {data.length > 0 ? (
        <div className="space-y-1.5">
          {data.slice(0, 8).map((item, i) => (
            <div key={item.word} className="flex items-center gap-3 py-1.5 border-b border-[#E8DDD0]/50 last:border-0">
              <span className="text-xs font-bold text-[#BFA090] w-5">#{i + 1}</span>
              <span className="text-sm font-medium text-[#2A170F] flex-1 truncate capitalize">{item.word}</span>
              <span className="text-xs font-semibold text-[#897365]">{item.count}x</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#897365] text-center py-8">No searches yet</p>
      )}
    </div>
  );
}

function RecentActivityFeed({ data }) {
  const getIcon = (type) => {
    switch (type) {
      case 'user_signup': return <UserPlus className="w-3.5 h-3.5 text-green-600" />;
      case 'word_saved': return <BookOpen className="w-3.5 h-3.5 text-[#AA7137]" />;
      case 'quiz_taken': return <Brain className="w-3.5 h-3.5 text-purple-600" />;
      case 'search': return <Search className="w-3.5 h-3.5 text-blue-600" />;
      default: return <Activity className="w-3.5 h-3.5 text-[#897365]" />;
    }
  };
  const getBg = (type) => {
    switch (type) {
      case 'user_signup': return 'bg-green-100';
      case 'word_saved': return 'bg-[#F5F0EB]';
      case 'quiz_taken': return 'bg-purple-100';
      default: return 'bg-gray-100';
    }
  };
  const getText = (item) => {
    switch (item.type) {
      case 'user_signup': return `${item.username} joined`;
      case 'word_saved': return `${item.word} was saved`;
      case 'quiz_taken': return `Quiz scored ${item.score}`;
      default: return item.word || 'Activity';
    }
  };

  return (
    <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
      <h3 className="text-sm font-semibold text-[#2A170F] mb-3">Recent Activity</h3>
      {data.length > 0 ? (
        <div className="space-y-2">
          {data.map((item, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-[#E8DDD0]/30 last:border-0">
              <div className={`w-7 h-7 rounded-full ${getBg(item.type)} flex items-center justify-center shrink-0`}>
                {getIcon(item.type)}
              </div>
              <span className="text-sm text-[#2A170F] flex-1 truncate">{getText(item)}</span>
              <span className="text-[10px] text-[#BFA090] shrink-0">{timeAgo(item.timestamp)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#897365] text-center py-8">No recent activity</p>
      )}
    </div>
  );
}

function UserGrowthChart({ data }) {
  return (
    <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
      <h3 className="text-sm font-semibold text-[#2A170F] mb-4">User Growth (7 days)</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#897365' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#897365' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="newUsers" fill="#D48A4A" radius={[4, 4, 0, 0]} name="New Users" />
            <Bar dataKey="activeUsers" fill="#AA7137" radius={[4, 4, 0, 0]} name="Active Users" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [topWords, setTopWords] = useState([]);
  const [topSearches, setTopSearches] = useState([]);
  const [wordTypes, setWordTypes] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const load = () => {
      setError(null);
      Promise.all([
        apiFetch(`${window.location.origin}/api/dashboard`).then(r => { if (!r.ok) throw new Error(`/api/dashboard: HTTP ${r.status}`); return r.json(); }),
        apiFetch(`${window.location.origin}/api/dashboard/timeline`).then(r => { if (!r.ok) throw new Error(`/api/timeline: HTTP ${r.status}`); return r.json(); }),
        apiFetch(`${window.location.origin}/api/dashboard/top-words`).then(r => { if (!r.ok) throw new Error(`/api/top-words: HTTP ${r.status}`); return r.json(); }),
        apiFetch(`${window.location.origin}/api/dashboard/top-searches`).then(r => { if (!r.ok) throw new Error(`/api/top-searches: HTTP ${r.status}`); return r.json(); }),
        apiFetch(`${window.location.origin}/api/dashboard/word-types`).then(r => { if (!r.ok) throw new Error(`/api/word-types: HTTP ${r.status}`); return r.json(); }),
        apiFetch(`${window.location.origin}/api/dashboard/recent-activity`).then(r => { if (!r.ok) throw new Error(`/api/activity: HTTP ${r.status}`); return r.json(); }),
        apiFetch(`${window.location.origin}/api/app-config`).then(r => { if (!r.ok) throw new Error(`/api/app-config: HTTP ${r.status}`); return r.json(); }),
      ])
        .then(([statsData, timelineData, wordsData, searchesData, typesData, activityData, configData]) => {
          setStats(statsData);
          setTimeline(timelineData.timeline || []);
          setTopWords(wordsData.topWords || []);
          setTopSearches(searchesData.topSearches || []);
          setWordTypes(typesData.distribution || []);
          setActivity(activityData.activities || []);
          setAppVersion(configData.currentVersion || '');
          setLoading(false);
        })
        .catch(err => {
          console.error('Dashboard fetch error:', err);
          setError(err.message);
          setLoading(false);
        });
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [retryCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#897365]">Loading dashboard...</div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#2A170F]">Dashboard</h1>
          <button onClick={() => { setLoading(true); setError(null); setRetryCount(c => c + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#897365] hover:text-[#2A170F] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          Failed to load dashboard: {error}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64 text-[#897365]">No data available.</div>
    );
  }

  const topRowCards = [
    { icon: Users, label: 'Total Users', value: stats.users.toLocaleString(), sub: 'All registered accounts', color: 'bg-blue-500' },
    { icon: Activity, label: 'Active Today', value: stats.dailyActiveUsers.toLocaleString(), sub: `${stats.engagementRate}% engagement`, color: 'bg-green-500' },
    { icon: UserPlus, label: 'New Today', value: stats.newUsersToday.toLocaleString(), sub: 'Signed up today', color: 'bg-emerald-500' },
    { icon: Search, label: 'Searches', value: stats.searches.toLocaleString(), sub: `${stats.searchesToday.toLocaleString()} today`, color: 'bg-amber-500' },
    { icon: BookOpen, label: 'Words Saved', value: stats.words.toLocaleString(), sub: `${stats.uniqueWordsSaved.toLocaleString()} unique`, color: 'bg-orange-500' },
    { icon: Brain, label: 'Quizzes Taken', value: stats.quizzes.toLocaleString(), sub: `Avg ${stats.averageQuizScore}% score`, color: 'bg-purple-500' },
  ];

  const midRowCards = [
    { icon: Target, label: 'Avg Quiz Score', value: `${stats.averageQuizScore}%`, sub: 'Overall average', color: 'bg-indigo-500' },
    { icon: Layers, label: 'Top Word Type', value: stats.topWordType, sub: 'Most common', color: 'bg-rose-500' },
    { icon: TrendingUp, label: 'Engagement Rate', value: `${stats.engagementRate}%`, sub: 'Users active today', color: 'bg-teal-500' },
    { icon: Sparkles, label: 'Retention Rate', value: `${stats.retentionRate}%`, sub: '7-day retention', color: 'bg-cyan-500' },
    { icon: Zap, label: 'Words Today', value: stats.wordsToday.toLocaleString(), sub: 'Saved in last 24h', color: 'bg-yellow-500' },
    { icon: BarChart3, label: 'Installs', value: stats.totalInstalls.toLocaleString(), sub: 'Total app installs', color: 'bg-sky-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Dashboard</h1>
          <p className="text-sm text-[#897365] mt-0.5">Overview of your Words Nest application</p>
        </div>
        <div className="flex items-center gap-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg px-3 py-2">
          <Smartphone className="w-4 h-4 text-[#897365]" />
          <span className="text-xs font-medium text-[#AA7137]">v{appVersion}</span>
          <div className="w-px h-4 bg-[#E8DDD0]" />
          <Clock className="w-4 h-4 text-[#897365]" />
          <span className="text-xs text-[#897365]">Live</span>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {topRowCards.map((card, i) => (
          <StatCard key={i} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {midRowCards.map((card, i) => (
          <StatCard key={i} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TimelineChart data={timeline} />
        <UserGrowthChart data={timeline} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <WordTypePie data={wordTypes} />
        <TopWordsList data={topWords} />
        <TopSearchesList data={topSearches} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RecentActivityFeed data={activity} />
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <a href="#appcontrol" className="flex items-center gap-2.5 p-3 rounded-lg border border-[#E8DDD0] hover:border-[#D48A4A] hover:bg-[#F5F0EB] transition-all text-sm text-[#2A170F]">
              <Zap className="w-4 h-4 text-[#AA7137]" />
              App Control
            </a>
            <a href="#notifications" className="flex items-center gap-2.5 p-3 rounded-lg border border-[#E8DDD0] hover:border-[#D48A4A] hover:bg-[#F5F0EB] transition-all text-sm text-[#2A170F]">
              <Activity className="w-4 h-4 text-[#AA7137]" />
              Notifications
            </a>
            <a href="#users" className="flex items-center gap-2.5 p-3 rounded-lg border border-[#E8DDD0] hover:border-[#D48A4A] hover:bg-[#F5F0EB] transition-all text-sm text-[#2A170F]">
              <Users className="w-4 h-4 text-[#AA7137]" />
              Manage Users
            </a>
            <a href="#analytics" className="flex items-center gap-2.5 p-3 rounded-lg border border-[#E8DDD0] hover:border-[#D48A4A] hover:bg-[#F5F0EB] transition-all text-sm text-[#2A170F]">
              <BarChart3 className="w-4 h-4 text-[#AA7137]" />
              Analytics
            </a>
          </div>
          <div className="mt-4 pt-4 border-t border-[#E8DDD0]">
            <div className="flex items-center justify-between text-xs text-[#897365]">
              <span>Server Status</span>
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Online
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#897365] mt-2">
              <span>Firebase</span>
              <span className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
