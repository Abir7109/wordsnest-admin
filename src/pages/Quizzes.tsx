import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Brain, TrendingUp, Users, BarChart3, Target, Award, Search, X, Trash2, Sparkles, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

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

const SCORE_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#A855F7', '#EC4899'];

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [generating, setGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState(null);
  const [generateError, setGenerateError] = useState('');

  function deleteQuiz(id) {
    if (!window.confirm('Delete this quiz record?')) return;
    fetch(`${window.location.origin}/api/quizzes/${id}`, { method: 'DELETE' })
      .then(() => setQuizzes(prev => prev.filter(q => q.id !== id)));
  }

  useEffect(() => {
    const load = () => {
      Promise.all([
        fetch(`${window.location.origin}/api/quizzes`).then(r => r.json()),
        fetch(`${window.location.origin}/api/quizzes/stats`).then(r => r.json()),
      ]).then(([data, statsData]) => {
        setQuizzes(data.quizzes ?? []);
        setStats(statsData);
        setLoading(false);
      }).catch(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 7000);
    return () => clearInterval(interval);
  }, []);

  const q = search.toLowerCase();
  const filtered = [...quizzes].filter(qz =>
    qz.userId?.toLowerCase().includes(q) || String(qz.score ?? '').includes(q)
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'newest') return (b.timestamp || 0) - (a.timestamp || 0);
    if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
    return 0;
  });

  const generateQuiz = async () => {
    setGenerating(true);
    setGenerateError('');
    setGeneratedQuestions(null);
    try {
      const res = await fetch(`${window.location.origin}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 5 }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedQuestions(data.questions);
      } else {
        setGenerateError(data.error || 'Generation failed');
      }
    } catch (e) {
      setGenerateError(e.message);
    }
    setGenerating(false);
  };

  const getScoreColor = score => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBg = score => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    if (score >= 40) return 'bg-orange-100';
    return 'bg-red-100';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  const scoreDist = (stats?.scoreDistribution || []).map((d, i) => ({ ...d, fill: SCORE_COLORS[i % SCORE_COLORS.length] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Quiz Analytics</h1>
          <p className="text-sm text-[#897365] mt-0.5">User quiz performance and statistics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Brain className="w-3 h-3" /> Total</span>
          <p className="text-xl font-bold text-[#2A170F]">{stats?.total || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Today</span>
          <p className="text-xl font-bold text-[#AA7137]">{stats?.today || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Target className="w-3 h-3" /> Avg Score</span>
          <p className="text-xl font-bold text-green-600">{stats?.averageScore || 0}%</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Award className="w-3 h-3" /> Highest</span>
          <p className="text-xl font-bold text-blue-600">{stats?.highestScore || 0}%</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Lowest</span>
          <p className="text-xl font-bold text-red-600">{stats?.lowestScore || 0}%</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Users className="w-3 h-3" /> Participants</span>
          <p className="text-xl font-bold text-purple-600">{stats?.totalParticipants || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {scoreDist.length > 0 && (
          <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
            <h3 className="text-sm font-semibold text-[#2A170F] mb-4">Score Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
                  <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#897365' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#897365' }} />
                  <Tooltip contentStyle={{ background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {scoreDist.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-3">Score Categories</h3>
          <div className="space-y-3">
            {(() => {
              const scores = quizzes.map(q => q.score).filter(s => s !== undefined && s !== null);
              const excellent = scores.filter(s => s >= 80).length;
              const good = scores.filter(s => s >= 60 && s < 80).length;
              const average = scores.filter(s => s >= 40 && s < 60).length;
              const poor = scores.filter(s => s < 40).length;
              const total = scores.length || 1;
              return [
                { label: 'Excellent (80-100)', count: excellent, pct: Math.round(excellent / total * 100), color: 'bg-green-500' },
                { label: 'Good (60-79)', count: good, pct: Math.round(good / total * 100), color: 'bg-yellow-500' },
                { label: 'Average (40-59)', count: average, pct: Math.round(average / total * 100), color: 'bg-orange-500' },
                { label: 'Poor (0-39)', count: poor, pct: Math.round(poor / total * 100), color: 'bg-red-500' },
              ].map(cat => (
                <div key={cat.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[#2A170F]">{cat.label}</span>
                    <span className="text-[#897365]">{cat.count} ({cat.pct}%)</span>
                  </div>
                  <div className="h-2 bg-[#E8DDD0] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cat.color} transition-all duration-500`} style={{ width: `${cat.pct}%` }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {generatedQuestions && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[#FFF8F0] to-[#FFFBF5] rounded-xl border border-[#D48A4A]/30 p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#D48A4A]" />
              <h3 className="text-sm font-bold text-[#2A170F]">AI Generated Quiz</h3>
            </div>
            <button onClick={generateQuiz} disabled={generating}
              className="text-xs text-[#AA7137] hover:text-[#D48A4A] font-medium flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Regenerate
            </button>
          </div>
          <div className="space-y-3">
            {generatedQuestions.map((q, i) => (
              <div key={q.id || i} className="bg-white rounded-lg border border-[#E8DDD0] p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full bg-[#D48A4A]/10 text-[#AA7137] text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-xs font-bold text-[#D48A4A]">{q.word}</span>
                    </div>
                    <p className="text-xs text-[#2A170F]">{q.question}</p>
                    <div className="mt-1.5 space-y-0.5">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`text-[11px] px-2 py-0.5 rounded ${oi === q.correctIndex ? 'bg-green-50 text-green-700 font-medium' : 'text-[#897365]'}`}>
                          {oi === q.correctIndex ? '✓ ' : ''}{opt}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#BFA090] mt-1 italic">💡 {q.hint}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D48A4A]" />
            <span className="text-xs font-semibold text-[#2A170F]">AI Quiz Generator</span>
          </div>
          <button onClick={generateQuiz} disabled={generating}
            className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5">
            {generating ? <><Loader className="w-3.5 h-3.5 animate-spin" /> Generating...</> : <><Sparkles className="w-3.5 h-3.5" /> Generate Quiz</>}
          </button>
        </div>
        {generateError && <p className="text-xs text-red-500 mt-2">{generateError}</p>}
        {!generatedQuestions && !generateError && (
          <p className="text-[11px] text-[#897365] mt-2">Generate a vocabulary quiz from words users have searched recently.</p>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
          <input type="text" placeholder="Filter by user ID or score..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]" />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
          <option value="newest">Newest First</option>
          <option value="score">Highest Score</option>
        </select>
      </div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
              <th className="p-3 font-medium">User ID</th>
              <th className="p-3 font-medium">Score</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Time</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((q, i) => (
              <motion.tr key={q.id || i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.01 }}
                className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50"
              >
                <td className="p-3 text-[#897365] font-mono text-xs">{q.userId}</td>
                <td className="p-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${getScoreBg(q.score)} ${getScoreColor(q.score)}`}>
                    {q.score ?? '—'}%
                  </span>
                </td>
                <td className="p-3 text-[#897365] text-xs">{q.timestamp ? new Date(q.timestamp).toLocaleDateString() : '—'}</td>
                <td className="p-3 text-[#897365] text-xs whitespace-nowrap">{timeAgo(q.timestamp)}</td>
                <td className="p-3 text-right">
                  <button onClick={() => deleteQuiz(q.id)}
                    className="w-7 h-7 rounded-lg text-[#897365] hover:text-red-500 hover:bg-red-50 transition-colors inline-flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="p-8 text-center text-[#897365]">No quizzes taken yet.</div>
        )}
      </div>
    </div>
  );
}
