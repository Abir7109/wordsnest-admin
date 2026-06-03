import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, TrendingUp, Users, BarChart3, Target, Award, Search, X, Trash2, Sparkles, CheckCircle, Loader, RefreshCw, Zap, BookOpen, Sliders, Send, Eye, EyeOff, Edit3, Clock, BarChart4 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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

const SCORE_COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6', '#A855F7', '#EC4899'];
const DIFFICULTIES = [
  { value: 'easy', label: 'Easy', desc: 'Basic definitions, suitable for beginners', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'medium', label: 'Medium', desc: 'Mixed definitions, synonyms, and usage', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'hard', label: 'Hard', desc: 'Nuanced meanings, antonyms, etymology', color: 'bg-red-100 text-red-700 border-red-200' },
];

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [activeTab, setActiveTab] = useState('generator');

  const [generating, setGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState(null);
  const [generateError, setGenerateError] = useState('');
  const [quizCount, setQuizCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [poolStatus, setPoolStatus] = useState({ hasQuiz: false, count: 0, generatedAt: null, generatedWords: [] });
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editableQuestions, setEditableQuestions] = useState(null);

  const deleteQuiz = (id) => {
    if (!window.confirm('Delete this quiz record?')) return;
    apiFetch(`${window.location.origin}/api/quizzes/${id}`, { method: 'DELETE' })
      .then(() => setQuizzes(prev => prev.filter(q => q.id !== id)));
  };

  const loadPoolStatus = async () => {
    try {
      const res = await apiFetch(`${window.location.origin}/api/quiz-pool/status`);
      const data = await res.json();
      setPoolStatus(data);
    } catch (e) {}
  };

  useEffect(() => {
    const load = () => {
      Promise.all([
        apiFetch(`${window.location.origin}/api/quizzes`).then(r => r.json()),
        apiFetch(`${window.location.origin}/api/quizzes/stats`).then(r => r.json()),
      ]).then(([data, statsData]) => {
        setQuizzes(data.quizzes ?? []);
        setStats(statsData);
        setLoading(false);
      }).catch(() => setLoading(false));
    };
    load();
    loadPoolStatus();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const generateQuiz = async () => {
    setGenerating(true);
    setGenerateError('');
    setGeneratedQuestions(null);
    setPublishSuccess(false);
    try {
      const res = await apiFetch(`${window.location.origin}/api/ai/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: quizCount, difficulty }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedQuestions(data.questions);
        setEditableQuestions(JSON.parse(JSON.stringify(data.questions)));
        await loadPoolStatus();
      } else {
        setGenerateError(data.error || 'Generation failed');
      }
    } catch (e) {
      setGenerateError(e.message);
    }
    setGenerating(false);
  };

  const publishQuiz = async () => {
    if (!editableQuestions || editableQuestions.length === 0) {
      setGenerateError('Generate a quiz first before publishing');
      return;
    }
    setPublishing(true);
    try {
      const res = await apiFetch(`${window.location.origin}/api/quiz-pool/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: editableQuestions, difficulty }),
      });
      const data = await res.json();
      if (data.success) {
        setPublishSuccess(true);
        await loadPoolStatus();
        setTimeout(() => setPublishSuccess(false), 3000);
      } else {
        setGenerateError(data.error || 'Publishing failed');
      }
    } catch (e) {
      setGenerateError(e.message);
    }
    setPublishing(false);
  };

  const q = search.toLowerCase();
  const filtered = [...quizzes].filter(qz =>
    qz.userId?.toLowerCase().includes(q) || String(qz.score ?? '').includes(q)
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'newest') return (b.timestamp || 0) - (a.timestamp || 0);
    if (sortBy === 'score') return (b.score || 0) - (a.score || 0);
    return 0;
  });

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

  const updateQuestion = (idx, field, value) => {
    const updated = [...editableQuestions];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditableQuestions(updated);
  };

  const updateOption = (qIdx, oIdx, value) => {
    const updated = [...editableQuestions];
    const opts = [...updated[qIdx].options];
    opts[oIdx] = value;
    updated[qIdx] = { ...updated[qIdx], options: opts };
    setEditableQuestions(updated);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  const scoreDist = (stats?.scoreDistribution || []).map((d, i) => ({ ...d, fill: SCORE_COLORS[i % SCORE_COLORS.length] }));
  const activeQuestions = generatedQuestions || editableQuestions;
  const isLive = poolStatus.hasQuiz && poolStatus.count > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Quiz Control Center</h1>
          <p className="text-sm text-[#897365] mt-0.5">AI-powered quiz generation & analytics</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 bg-[#FFFBF5] border border-[#E8DDD0] rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('generator')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'generator' ? 'bg-[#AA7137] text-white shadow-sm' : 'text-[#897365] hover:text-[#2A170F]'}`}>
          <Zap className="w-3.5 h-3.5" /> AI Generator
        </button>
        <button onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${activeTab === 'analytics' ? 'bg-[#AA7137] text-white shadow-sm' : 'text-[#897365] hover:text-[#2A170F]'}`}>
          <BarChart4 className="w-3.5 h-3.5" /> Analytics
        </button>
      </div>

      {/* ═══════════ AI GENERATOR TAB ═══════════ */}
      {activeTab === 'generator' && (
        <div className="space-y-5">
          {/* Pool Status Bar */}
          <div className={`rounded-xl border p-4 flex items-center justify-between ${isLive ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' : 'bg-[#FFFBF5] border-[#E8DDD0]'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isLive ? 'bg-green-100' : 'bg-[#F5F0EB]'}`}>
                {isLive ? <CheckCircle className="w-5 h-5 text-green-600" /> : <BookOpen className="w-5 h-5 text-[#897365]" />}
              </div>
              <div>
                <p className="text-sm font-bold text-[#2A170F]">
                  {isLive ? `${poolStatus.count} questions live in the quiz pool` : 'No quiz published yet'}
                </p>
                <p className="text-xs text-[#897365]">
                  {isLive
                    ? `Generated ${timeAgo(poolStatus.generatedAt)} · Words: ${poolStatus.generatedWords?.slice(0, 3).join(', ')}${poolStatus.generatedWords?.length > 3 ? '...' : ''}`
                    : 'Generate a quiz below and it will be available to all users instantly'}
                </p>
              </div>
            </div>
            {isLive && (
              <span className="text-[10px] bg-green-200 text-green-800 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                <Send className="w-3 h-3" /> Active
              </span>
            )}
          </div>

          {/* AI Generator Hero */}
          <div className="bg-gradient-to-br from-[#FFF8F0] to-[#FFFBF5] rounded-xl border border-[#D48A4A]/20 p-6">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#D48A4A] to-[#AA7137] flex items-center justify-center shadow-lg shadow-[#D48A4A]/20">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#2A170F]">AI Quiz Generator</h2>
                  <p className="text-xs text-[#897365] mt-0.5">Creates vocabulary questions from words your users have actually searched</p>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="text-xs font-medium text-[#897365] uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <Sliders className="w-3 h-3" /> Questions
                </label>
                <div className="flex items-center gap-3">
                  <input type="range" min={3} max={10} value={quizCount} onChange={e => setQuizCount(parseInt(e.target.value))}
                    className="flex-1 accent-[#D48A4A] h-1.5" />
                  <span className="text-sm font-bold text-[#D48A4A] min-w-[24px] text-right">{quizCount}</span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-[#897365] uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <Target className="w-3 h-3" /> Difficulty
                </label>
                <div className="flex gap-2">
                  {DIFFICULTIES.map(d => (
                    <button key={d.value} onClick={() => setDifficulty(d.value)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        difficulty === d.value
                          ? `${d.color} border-2 shadow-sm`
                          : 'bg-white border-[#E8DDD0] text-[#897365] hover:border-[#D48A4A]/40'
                      }`}>
                      <span className="block font-bold mb-0.5">{d.label}</span>
                      <span className="block text-[10px] opacity-70">{d.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button onClick={generateQuiz} disabled={generating}
                className="btn-primary px-6 py-2.5 inline-flex items-center gap-2 text-sm font-bold shadow-lg shadow-[#D48A4A]/20">
                {generating ? <><Loader className="w-4 h-4 animate-spin" /> Generating with AI...</> : <><Sparkles className="w-4 h-4" /> Generate Quiz</>}
              </button>
              {activeQuestions && !generating && (
                <button onClick={publishQuiz} disabled={publishing}
                  className="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold inline-flex items-center gap-2 transition-all shadow-lg shadow-green-600/20">
                  {publishing ? <><Loader className="w-4 h-4 animate-spin" /> Publishing...</> : <><Send className="w-4 h-4" /> Publish to App</>}
                </button>
              )}
              {activeQuestions && (
                <button onClick={() => { setEditMode(!editMode); if (!editMode) setEditableQuestions(JSON.parse(JSON.stringify(generatedQuestions))); }}
                  className="px-4 py-2.5 rounded-xl border border-[#E8DDD0] bg-white text-[#897365] hover:text-[#2A170F] hover:border-[#D48A4A]/40 text-sm font-medium inline-flex items-center gap-2 transition-all">
                  {editMode ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                  {editMode ? 'Preview' : 'Edit'}
                </button>
              )}
            </div>
            {generateError && (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs text-red-500 mt-3 bg-red-50 rounded-lg px-3 py-2">{generateError}</motion.p>
            )}
            {publishSuccess && (
              <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="text-xs text-green-600 mt-3 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Quiz published! Users will see these questions next time they open the quiz.
              </motion.p>
            )}
          </div>

          {/* Generated Questions Preview */}
          <AnimatePresence>
            {activeQuestions && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#E8DDD0] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#D48A4A]" />
                    <span className="text-sm font-bold text-[#2A170F]">Quiz Preview ({activeQuestions.length} questions)</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                      difficulty === 'hard' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{difficulty}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { if (!editMode) setGeneratedQuestions(null); setEditableQuestions(null); }}
                      className="text-[#897365] hover:text-red-500 text-xs flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                      <X className="w-3 h-3" /> Clear
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {(editMode ? editableQuestions : generatedQuestions).map((q, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className={`rounded-xl border p-4 ${editMode ? 'border-[#D48A4A]/30 bg-[#FFFAF5]' : 'border-[#E8DDD0] bg-white'}`}>
                      <div className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-full bg-[#D48A4A]/10 text-[#AA7137] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          {editMode ? (
                            <>
                              <div className="flex gap-2 mb-2">
                                <input value={q.word} onChange={e => updateQuestion(i, 'word', e.target.value)}
                                  className="flex-1 px-2 py-1 rounded border border-[#E8DDD0] text-xs font-bold text-[#D48A4A] bg-white outline-none focus:border-[#D48A4A]" />
                              </div>
                              <textarea value={q.question} onChange={e => updateQuestion(i, 'question', e.target.value)}
                                className="w-full px-2 py-1 rounded border border-[#E8DDD0] text-xs text-[#2A170F] bg-white outline-none focus:border-[#D48A4A] resize-none h-14 mb-2" />
                              <div className="space-y-1 mb-2">
                                {q.options.map((opt, oi) => (
                                  <div key={oi} className="flex items-center gap-2">
                                    <input type="radio" checked={oi === q.correctIndex} readOnly
                                      className="accent-green-500 w-3 h-3" />
                                    <input value={opt} onChange={e => updateOption(i, oi, e.target.value)}
                                      className={`flex-1 px-2 py-1 rounded border text-xs bg-white outline-none focus:border-[#D48A4A] ${oi === q.correctIndex ? 'border-green-300 bg-green-50 font-medium text-green-800' : 'border-[#E8DDD0] text-[#897365]'}`} />
                                  </div>
                                ))}
                              </div>
                              <textarea value={q.hint} onChange={e => updateQuestion(i, 'hint', e.target.value)}
                                className="w-full px-2 py-1 rounded border border-[#E8DDD0] text-[10px] text-[#BFA090] bg-white outline-none focus:border-[#D48A4A] resize-none h-12 italic" />
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold text-[#D48A4A]">{q.word}</span>
                              </div>
                              <p className="text-sm text-[#2A170F]">{q.question}</p>
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {q.options.map((opt, oi) => (
                                  <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg border ${
                                    oi === q.correctIndex
                                      ? 'bg-green-50 border-green-200 text-green-700 font-medium flex items-center gap-1.5'
                                      : 'bg-[#FAF8F6] border-[#E8DDD0] text-[#897365]'
                                  }`}>
                                    {oi === q.correctIndex && <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />}
                                    {opt}
                                  </div>
                                ))}
                              </div>
                              <p className="text-[11px] text-[#BFA090] mt-2 italic flex items-center gap-1">
                                <span>💡</span> {q.hint}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {editMode && (
                  <div className="px-5 py-3 border-t border-[#E8DDD0] bg-[#FAF8F6] flex items-center justify-between">
                    <p className="text-xs text-[#897365]">Edit questions and options, then publish</p>
                    <button onClick={() => { setEditMode(false); setGeneratedQuestions(editableQuestions); }}
                      className="btn-primary text-xs px-4 py-1.5 inline-flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Done Editing
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty State */}
          {!activeQuestions && !generating && (
            <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F5F0EB] flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-[#BFA090]" />
              </div>
              <h3 className="text-base font-bold text-[#2A170F] mb-1">Ready to Generate a Quiz?</h3>
              <p className="text-sm text-[#897365] max-w-md mx-auto">
                Choose your difficulty and number of questions above, then click <strong>Generate Quiz</strong>. 
                The AI will create questions from words your users have searched.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ ANALYTICS TAB ═══════════ */}
      {activeTab === 'analytics' && (
        <div>
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
                        {scoreDist.map((d, i) => (<Cell key={i} fill={d.fill} />))}
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
                    className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50">
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
      )}
    </div>
  );
}