import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Trophy, Star, TrendingUp, Users, BookOpen, Brain, Zap, Edit3, X, Save } from 'lucide-react';

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

function EditScoreModal({ entry, onClose, onSave }) {
  const [score, setScore] = useState(String(entry.score));
  const [streak, setStreak] = useState(String(entry.streak));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${window.location.origin}/api/admin/leaderboard/${entry.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualScore: parseInt(score) || 0,
          streak: parseInt(streak) || 0,
        }),
      });
      onSave(parseInt(score) || 0);
      onClose();
    } catch (e) {
      alert('Failed to save');
    }
    setSaving(false);
  };

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
        className="bg-[#FFFBF5] rounded-2xl border border-[#E8DDD0] w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#2A170F]">Edit Leaderboard Entry</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[#F5F0EB] flex items-center justify-center text-[#897365]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{entry.emoji}</span>
            <div>
              <p className="font-semibold text-[#2A170F]">{entry.name}</p>
              <p className="text-xs text-[#897365]">#{entry.rank} · {entry.email}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#897365] mb-1">Star Score (Admin Override)</label>
            <input type="number" value={score} onChange={e => setScore(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
            <p className="text-[10px] text-[#AA7137] mt-1">Computed: {entry.computedScore} pts · Set 0 to use computed</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#897365] mb-1">Streak (days)</label>
            <input type="number" value={streak} onChange={e => setStreak(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-[#F5F0EB] rounded-lg p-3 text-center">
              <span className="text-xs text-[#897365]">Words</span>
              <p className="text-lg font-bold text-[#AA7137]">{entry.words}</p>
            </div>
            <div className="bg-[#F5F0EB] rounded-lg p-3 text-center">
              <span className="text-xs text-[#897365]">Quiz Score</span>
              <p className="text-lg font-bold text-purple-600">{entry.quiz}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-[#E8DDD0] rounded-xl text-sm text-[#897365] hover:bg-[#F5F0EB] transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-[#2A170F] text-white rounded-xl text-sm font-medium hover:bg-[#3D2A1F] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editEntry, setEditEntry] = useState(null);
  const [sortBy, setSortBy] = useState('rank');

  useEffect(() => {
    const load = () => {
      fetch(`${window.location.origin}/api/admin/leaderboard`)
        .then(r => r.json())
        .then(data => {
          setEntries(data.leaderboard ?? []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 7000);
    return () => clearInterval(interval);
  }, []);

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) || e.uid?.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'rank') return a.rank - b.rank;
    if (sortBy === 'score') return b.score - a.score;
    if (sortBy === 'words') return b.words - a.words;
    if (sortBy === 'quiz') return b.quiz - a.quiz;
    if (sortBy === 'streak') return b.streak - a.streak;
    return 0;
  });

  const handleEditSave = (uid, newScore) => {
    setEntries(prev => prev.map(e => e.uid === uid ? { ...e, score: newScore } : e));
  };

  const totalScore = entries.reduce((s, e) => s + e.score, 0);
  const avgScore = entries.length > 0 ? Math.round(totalScore / entries.length) : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Leaderboard</h1>
          <p className="text-sm text-[#897365] mt-0.5">{entries.length} gardeners · {avgScore} avg score</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Users className="w-3 h-3" /> Gardeners</span>
          <p className="text-xl font-bold text-[#2A170F]">{entries.length}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Star className="w-3 h-3" /> Total Stars</span>
          <p className="text-xl font-bold text-amber-500">{totalScore}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><BookOpen className="w-3 h-3" /> Total Words</span>
          <p className="text-xl font-bold text-[#AA7137]">{entries.reduce((s, e) => s + e.words, 0)}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Brain className="w-3 h-3" /> Total Quiz</span>
          <p className="text-xl font-bold text-purple-600">{entries.reduce((s, e) => s + e.quiz, 0)}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Zap className="w-3 h-3" /> Avg Streak</span>
          <p className="text-xl font-bold text-green-600">{entries.length > 0 ? Math.round(entries.reduce((s, e) => s + e.streak, 0) / entries.length) : 0}d</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
          <input type="text" placeholder="Search by name, email or UID..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]" />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
          <option value="rank">Sort: Rank</option>
          <option value="score">Sort: Stars</option>
          <option value="words">Sort: Words</option>
          <option value="quiz">Sort: Quiz</option>
          <option value="streak">Sort: Streak</option>
        </select>
      </div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
              <th className="p-3 font-medium w-12">#</th>
              <th className="p-3 font-medium">Gardener</th>
              <th className="p-3 font-medium text-center">
                <span className="flex items-center gap-1 justify-center"><Star className="w-3 h-3" /> Stars</span>
              </th>
              <th className="p-3 font-medium text-center"><BookOpen className="w-3 h-3 inline" /> Words</th>
              <th className="p-3 font-medium text-center"><Brain className="w-3 h-3 inline" /> Quiz</th>
              <th className="p-3 font-medium text-center"><Zap className="w-3 h-3 inline" /> Streak</th>
              <th className="p-3 font-medium text-center">Computed</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => (
              <motion.tr key={entry.uid}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50"
              >
                <td className="p-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#F5F0EB] text-sm font-bold text-[#2A170F]">
                    {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : `#${entry.rank}`}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{entry.emoji}</span>
                    <div>
                      <p className="font-medium text-[#2A170F]">{entry.name}</p>
                      <p className="text-[10px] text-[#897365] font-mono">{entry.email || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-sm">
                    <Star className="w-3 h-3" /> {entry.score}
                  </span>
                </td>
                <td className="p-3 text-center font-medium text-[#AA7137]">{entry.words}</td>
                <td className="p-3 text-center font-medium text-purple-600">{entry.quiz}</td>
                <td className="p-3 text-center">
                  <span className="text-green-600 font-medium">{entry.streak}d</span>
                </td>
                <td className="p-3 text-center text-[#897365] text-xs">{entry.computedScore}</td>
                <td className="p-3 text-right">
                  <button onClick={() => setEditEntry(entry)}
                    className="w-7 h-7 rounded-lg text-[#897365] hover:text-[#AA7137] hover:bg-amber-50 transition-colors inline-flex items-center justify-center">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="p-8 text-center text-[#897365]">No leaderboard entries found.</div>
        )}
      </div>

      {editEntry && (
        <EditScoreModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSave={(newScore) => handleEditSave(editEntry.uid, newScore)}
        />
      )}
    </div>
  );
}
