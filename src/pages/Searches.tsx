import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, TrendingUp, Hash, Users, Calendar, BarChart3, Globe, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { SearchEvent, SearchStats } from '../types';

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Searches() {
  const [searches, setSearches] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  function deleteSearch(id) {
    if (!window.confirm('Delete this search event?')) return;
    fetch(`${window.location.origin}/api/searches/${id}`, { method: 'DELETE' })
      .then(() => setSearches(prev => prev.filter(s => s.id !== id)));
  }

  useEffect(() => {
    Promise.all([
      fetch(`${window.location.origin}/api/searches`).then(r => r.json()),
      fetch(`${window.location.origin}/api/searches/stats`).then(r => r.json()),
    ]).then(([data, statsData]) => {
      setSearches(data.searches ?? []);
      setStats(statsData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const q = searchTerm.toLowerCase();
  const filtered = searches.filter(s =>
    s.word?.toLowerCase().includes(q) || s.user_id?.toLowerCase().includes(q)
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  const topSearchesForChart = (stats?.topSearches || []).slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Search Analytics</h1>
          <p className="text-sm text-[#897365] mt-0.5">Dictionary lookups and search behavior</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Globe className="w-3 h-3" /> Total Searches</span>
          <p className="text-xl font-bold text-[#2A170F]">{stats?.total || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Calendar className="w-3 h-3" /> Today</span>
          <p className="text-xl font-bold text-[#AA7137]">{stats?.today || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><TrendingUp className="w-3 h-3" /> This Week</span>
          <p className="text-xl font-bold text-green-600">{stats?.thisWeek || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Hash className="w-3 h-3" /> Unique Words</span>
          <p className="text-xl font-bold text-purple-600">{stats?.uniqueWords || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Users className="w-3 h-3" /> Searches/User</span>
          <p className="text-xl font-bold text-blue-600">
            {searches.length > 0 ? (searches.length / Math.max(1, [...new Set(searches.map(s => s.user_id).filter(Boolean))].length)).toFixed(1) : '0'}
          </p>
        </div>
      </div>

      {topSearchesForChart.length > 0 && (
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 mb-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-4">Top Searched Words</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSearchesForChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#897365' }} />
                <YAxis type="category" dataKey="word" tick={{ fontSize: 11, fill: '#2A170F' }} width={120} />
                <Tooltip contentStyle={{ background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#D48A4A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
        <input type="text" placeholder="Filter by word or user ID..." value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]" />
      </div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
              <th className="p-3 font-medium">Word</th>
              <th className="p-3 font-medium">User ID</th>
              <th className="p-3 font-medium">Timestamp</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <motion.tr key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.01 }}
                className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50"
              >
                <td className="p-3 font-medium text-[#2A170F] capitalize">{s.word || '—'}</td>
                <td className="p-3 text-[#897365] font-mono text-xs">{s.user_id || '—'}</td>
                <td className="p-3 text-[#897365] text-xs whitespace-nowrap">{s.timestamp ? new Date(s.timestamp).toLocaleString() : '—'}</td>
                <td className="p-3">
                  <span className="text-[10px] text-[#897365]">{s.status || '—'}</span>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => deleteSearch(s.id)}
                    className="w-7 h-7 rounded-lg text-[#897365] hover:text-red-500 hover:bg-red-50 transition-colors inline-flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-[#897365]">No searches recorded yet.</div>
        )}
      </div>
    </div>
  );
}
