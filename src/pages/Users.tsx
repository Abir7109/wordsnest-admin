import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronDown, ChevronRight, X, Mail, Smartphone, Calendar, Shield, BookOpen, Brain, Activity, Crown, Ban, Star, RefreshCw, Clock } from 'lucide-react';
import { apiFetch } from '../api';

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

function UserDetailModal({ phone, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${window.location.origin}/api/users/${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(data => { setDetail(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [phone]);

  const planLabel = detail?.profile?.subscription?.plan || 'free';
  const isLifetimeFree = detail?.profile?.subscription?.lifetimeFree;
  const isBanned = detail?.profile?.banned;
  const expiresAt = detail?.profile?.subscription?.expiresAt;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#FFFBF5] rounded-2xl border border-[#E8DDD0] w-full max-w-2xl max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#FFFBF5] border-b border-[#E8DDD0] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-[#2A170F]">User Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#F5F0EB] flex items-center justify-center text-[#897365]">
            <X className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-[#897365]">Loading...</div>
        ) : detail ? (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Smartphone className="w-3 h-3" />Phone</div>
                <p className="text-sm font-medium text-[#2A170F]">{detail.profile?.phone || '—'}</p>
              </div>
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Mail className="w-3 h-3" />Email</div>
                <p className="text-sm font-medium text-[#2A170F] break-all">{detail.profile?.email || '—'}</p>
              </div>
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Shield className="w-3 h-3" />Status</div>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${detail.profile?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {detail.profile?.status || 'inactive'}
                </span>
              </div>
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Clock className="w-3 h-3" />Cooldown</div>
                {(() => {
                  const cd = detail.profile?.coolDownUntil;
                  if (!cd || cd < Date.now()) return <span className="text-xs text-[#897365]">—</span>;
                  const diff = cd - Date.now();
                  const h = Math.floor(diff / 3600000);
                  const m = Math.floor((diff % 3600000) / 60000);
                  return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">{h}h {m}m remaining</span>;
                })()}
              </div>
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Crown className="w-3 h-3" />Subscription</div>
                {isLifetimeFree ? (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">Lifetime Free</span>
                ) : planLabel === 'premium' ? (
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Premium</span>
                    {expiresAt && <p className="text-xs text-[#897365] mt-1">Expires {new Date(expiresAt).toLocaleDateString()}</p>}
                  </div>
                ) : (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Free</span>
                )}
              </div>
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Smartphone className="w-3 h-3" />Device</div>
                <p className="text-sm text-[#2A170F]">{detail.profile?.deviceName || detail.profile?.device_model || '—'}</p>
              </div>
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Activity className="w-3 h-3" />Rate Limit Hits</div>
                <p className="text-sm font-medium text-[#2A170F]">{detail.profile?.rateLimitHits || 0}x</p>
              </div>
              <div className="bg-[#F5F0EB] rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-[#897365] mb-1"><Calendar className="w-3 h-3" />Joined</div>
                <p className="text-sm text-[#2A170F]">{detail.profile?.createdAt ? new Date(detail.profile.createdAt).toLocaleDateString() : '—'}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#2A170F] mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#AA7137]" /> Saved Words ({detail.words?.length || 0})
              </h3>
              <div className="space-y-1.5 max-h-40 overflow-auto">
                {(detail.words || []).map(w => (
                  <div key={w.id || w.word} className="flex items-center justify-between bg-[#F5F0EB] rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-[#2A170F]">{w.word}</span>
                    <div className="flex items-center gap-2">
                      {w.type && <span className="text-[10px] text-[#AA7137] bg-white px-1.5 py-0.5 rounded">{w.type}</span>}
                      <span className="text-[10px] text-[#897365]">{timeAgo(w.timestamp)}</span>
                    </div>
                  </div>
                ))}
                {(!detail.words || detail.words.length === 0) && (
                  <p className="text-sm text-[#897365] py-2">No saved words</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#2A170F] mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-500" /> Quiz History ({detail.quizzes?.length || 0})
              </h3>
              <div className="space-y-1.5 max-h-40 overflow-auto">
                {(detail.quizzes || []).map((q, i) => (
                  <div key={q.id || i} className="flex items-center justify-between bg-[#F5F0EB] rounded-lg px-3 py-2 text-sm">
                    <span className="text-[#2A170F]">Score: <strong>{q.score ?? '—'}%</strong></span>
                    <span className="text-[10px] text-[#897365]">{timeAgo(q.timestamp)}</span>
                  </div>
                ))}
                {(!detail.quizzes || detail.quizzes.length === 0) && (
                  <p className="text-sm text-[#897365] py-2">No quizzes taken</p>
                )}
              </div>
            </div>

            {detail.searchHistory && (
              <div>
                <h3 className="text-sm font-semibold text-[#2A170F] mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" /> Search History ({detail.searchHistory.length || 0})
                </h3>
                <div className="space-y-1.5 max-h-40 overflow-auto">
                  {detail.searchHistory.map((s, i) => (
                    <div key={s.id || i} className="flex items-center justify-between bg-[#F5F0EB] rounded-lg px-3 py-2 text-sm">
                      <span className="font-medium text-[#2A170F]">{s.word}</span>
                      <span className="text-[10px] text-[#897365]">{timeAgo(s.timestamp)}</span>
                    </div>
                  ))}
                  {detail.searchHistory.length === 0 && (
                    <p className="text-sm text-[#897365] py-2">No searches yet</p>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-[#E8DDD0]">
              <button onClick={() => {
                if (!confirm(`Are you sure you want to permanently delete user ${phone}?\n\nThis will also delete their Firebase Auth account. This cannot be undone!`)) return;
                apiFetch(`${window.location.origin}/api/users/${encodeURIComponent(phone)}`, { method: 'DELETE' })
                  .then(r => r.json())
                  .then(() => { onClose(); window.location.reload(); })
                  .catch(console.error);
              }}
                className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                Delete User Permanently
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-[#897365]">Failed to load user details</div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [sortBy, setSortBy] = useState('lastActive');

  const load = () => {
    setError(null);
    apiFetch(`${window.location.origin}/api/users`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        return r.json();
      })
      .then(data => {
        setUsers(data.users ?? []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Users fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 7000);
    return () => clearInterval(interval);
  }, []);

  const versions = [...new Set(users.map(u => u.app_version).filter(Boolean))];

  const filtered = users.filter(u => {
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (planFilter !== 'all') {
      const sub = u.subscription || {};
      if (planFilter === 'lifetime' && !sub.lifetimeFree) return false;
      if (planFilter === 'premium' && sub.lifetimeFree) return false;
      if (planFilter === 'premium' && (!sub.plan || sub.plan === 'free')) return false;
      if (planFilter === 'free' && (sub.plan && sub.plan !== 'free')) return false;
      if (planFilter === 'free' && sub.lifetimeFree) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.uid?.toLowerCase().includes(q) || u.phone?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q));
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'lastActive') return (b.lastActive || 0) - (a.lastActive || 0);
    if (sortBy === 'words') return (b.wordCount || 0) - (a.wordCount || 0);
    if (sortBy === 'quizzes') return (b.quizCount || 0) - (a.quizCount || 0);
    return 0;
  });

  const toggleLifetimeFree = (phone, current) => {
    if (!confirm(`${current ? 'Revoke' : 'Grant'} lifetime free access for ${phone}?`)) return;
    apiFetch(`${window.location.origin}/api/admin/users/${encodeURIComponent(phone)}/lifetime-free`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant: !current }),
    })
      .then(r => r.json())
      .then(() => load())
      .catch(console.error);
  };

  const toggleBan = (phone, current) => {
    if (!confirm(`${current ? 'Unban' : 'Ban'} user ${phone}?`)) return;
    apiFetch(`${window.location.origin}/api/admin/users/${encodeURIComponent(phone)}/ban`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ban: !current }),
    })
      .then(r => r.json())
      .then(() => load())
      .catch(console.error);
  };

  const toggleCooldown = (phone, currentCoolDown) => {
    if (currentCoolDown && currentCoolDown > Date.now()) {
      if (!confirm(`Remove cooldown for ${phone}? The user will be able to search again.`)) return;
      apiFetch(`${window.location.origin}/api/admin/users/${encodeURIComponent(phone)}/cooldown`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: true }),
      })
        .then(r => r.json())
        .then(() => load())
        .catch(console.error);
    } else {
      const hours = prompt('Enter cooldown duration in hours (e.g., 24 for 24 hours):', '24');
      if (!hours) return;
      const ms = parseInt(hours) * 3600000;
      if (isNaN(ms) || ms <= 0) return;
      if (!confirm(`Apply ${hours}h cooldown to ${phone}? The user won't be able to search.`)) return;
      apiFetch(`${window.location.origin}/api/admin/users/${encodeURIComponent(phone)}/cooldown`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs: ms }),
      })
        .then(r => r.json())
        .then(() => load())
        .catch(console.error);
    }
  };

  const totalWords = users.reduce((s, u) => s + (u.wordCount || 0), 0);
  const totalQuizzes = users.reduce((s, u) => s + (u.quizCount || 0), 0);
  const activeUsers = users.filter(u => u.status === 'active').length;
  const premiumUsers = users.filter(u => u.subscription?.plan === 'premium' || u.subscription?.lifetimeFree).length;

  function coolDownRemaining(ts) {
    if (!ts) return null;
    const diff = ts - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#2A170F]">Users</h1>
            <p className="text-sm text-red-500 mt-0.5">Error loading users: {error}</p>
          </div>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#897365] hover:text-[#2A170F] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Users</h1>
          <p className="text-sm text-[#897365] mt-0.5">{users.length} total · {activeUsers} active · {premiumUsers} premium · {totalWords} words</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#897365] hover:text-[#2A170F] transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Total</span>
          <p className="text-xl font-bold text-[#2A170F]">{users.length}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Active</span>
          <p className="text-xl font-bold text-green-600">{activeUsers}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Premium</span>
          <p className="text-xl font-bold text-[#AA7137]">{premiumUsers}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Total Words</span>
          <p className="text-xl font-bold text-purple-600">{totalWords}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
          <input type="text" placeholder="Search by phone, email or username..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
          <option value="all">All Plans</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="lifetime">Lifetime Free</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
          <option value="lastActive">Sort: Last Active</option>
          <option value="words">Sort: Words Saved</option>
          <option value="quizzes">Sort: Quizzes Taken</option>
        </select>
      </div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
              <th className="p-3 font-medium">Phone / UID</th>
              <th className="p-3 font-medium">User</th>
              <th className="p-3 font-medium">Plan</th>
              <th className="p-3 font-medium">Cooldown</th>
              <th className="p-3 font-medium">Rate Limit</th>
              <th className="p-3 font-medium">Daily Used</th>
              <th className="p-3 font-medium">Device</th>
              <th className="p-3 font-medium">Words</th>
              <th className="p-3 font-medium">Last Active</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((user, i) => {
              const sub = user.subscription || {};
              const planLabel = sub.plan || 'free';
              const isLifetime = sub.lifetimeFree;
              const isBanned = user.banned;
              const dailyUsed = sub.dailyUsage?.count || 0;
              const dailyDate = sub.dailyUsage?.date;

              return (
                <motion.tr key={user.uid || user.phone}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50 cursor-pointer ${isBanned ? 'bg-red-50/30' : ''}`}
                  onClick={() => setSelectedPhone(user.phone || user.uid)}
                >
                  <td className="p-3 font-mono text-xs text-[#2A170F] max-w-[130px] truncate">{user.phone || user.uid}</td>
                  <td className="p-3">
                    <div className="text-[#2A170F] text-sm font-medium">{user.username || '—'}</div>
                    {user.email && <div className="text-[10px] text-[#897365]">{user.email}</div>}
                  </td>
                  <td className="p-3">
                    {isLifetime ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                        <Star className="w-3 h-3" /> Lifetime
                      </span>
                    ) : planLabel === 'premium' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        <Crown className="w-3 h-3" /> Premium
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Free</span>
                    )}
                    {isBanned && <span className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700"><Ban className="w-3 h-3" /> Banned</span>}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const remaining = coolDownRemaining(user.coolDownUntil);
                      if (!remaining) return <span className="text-xs text-[#897365]">—</span>;
                      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"><Clock className="w-3 h-3" /> {remaining}</span>;
                    })()}
                  </td>
                  <td className="p-3">
                    {user.rateLimitHits > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700" title="Times user hit 10-word limit">
                        {user.rateLimitHits}x
                      </span>
                    ) : (
                      <span className="text-xs text-[#897365]">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-[#897365]">{dailyUsed}/10 {dailyDate ? `(${new Date(dailyDate).toLocaleDateString()})` : ''}</td>
                  <td className="p-3 text-xs text-[#897365] max-w-[100px] truncate" title={user.deviceName || user.device_model}>{user.deviceName || user.device_model || '—'}</td>
                  <td className="p-3 font-medium text-[#AA7137]">{user.wordCount || 0}</td>
                  <td className="p-3 text-[#897365] text-xs whitespace-nowrap">{timeAgo(user.lastActive)}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={e => { e.stopPropagation(); toggleLifetimeFree(user.phone || user.uid, isLifetime); }}
                        className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors ${isLifetime ? 'text-purple-600 bg-purple-50 hover:bg-purple-100' : 'text-[#897365] hover:text-purple-600 hover:bg-purple-50'}`}
                        title={isLifetime ? 'Revoke lifetime free' : 'Grant lifetime free'}>
                        <Star className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); toggleBan(user.phone || user.uid, isBanned); }}
                        className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors ${isBanned ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-[#897365] hover:text-red-500 hover:bg-red-50'}`}
                        title={isBanned ? 'Unban user' : 'Ban user'}>
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); toggleCooldown(user.phone || user.uid, user.coolDownUntil); }}
                        className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors ${user.coolDownUntil && user.coolDownUntil > Date.now() ? 'text-orange-600 bg-orange-50 hover:bg-orange-100' : 'text-[#897365] hover:text-orange-500 hover:bg-orange-50'}`}
                        title={user.coolDownUntil && user.coolDownUntil > Date.now() ? 'Remove cooldown' : 'Set cooldown (pause searching)'}>
                        <Clock className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="p-8 text-center text-[#897365]">No users found matching your filters.</div>
        )}
      </div>

      <AnimatePresence>
        {selectedPhone && <UserDetailModal phone={selectedPhone} onClose={() => setSelectedPhone(null)} />}
      </AnimatePresence>
    </div>
  );
}
