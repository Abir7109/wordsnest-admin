import { Fragment, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, ChevronDown, ChevronUp, BookOpen, Inbox, X, Filter, Trash2, Hash, Type, Users } from 'lucide-react';
import type { SavedWord, WordTypeStat } from '../types';

export default function Words() {
  const [words, setWords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const load = () => {
      Promise.all([
        fetch(`${window.location.origin}/api/words`).then(r => r.json()),
        fetch(`${window.location.origin}/api/words/stats`).then(r => r.json()),
      ]).then(([wordsData, statsData]) => {
        setWords(wordsData.words ?? []);
        setStats(statsData);
        setLoading(false);
      }).catch(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 7000);
    return () => clearInterval(interval);
  }, []);

  const wordTypes = stats?.typeDistribution?.map(t => t.type) || [];

  const normalize = w => ({
    ...w,
    word: w.word || '(unknown)',
    synonyms: Array.isArray(w.synonyms) ? w.synonyms : (w.synonyms ? w.synonyms.split(', ').filter(Boolean) : []),
    antonyms: Array.isArray(w.antonyms) ? w.antonyms : (w.antonyms ? w.antonyms.split(', ').filter(Boolean) : []),
  });

  const normalized = words.map(normalize);

  const q = search.toLowerCase();
  const filtered = normalized.filter(w => {
    if (typeFilter !== 'all' && w.type !== typeFilter) return false;
    if (!search) return true;
    return w.word?.toLowerCase().includes(q) || w.userId?.toLowerCase().includes(q) || w.definition?.toLowerCase().includes(q);
  });

  const truncate = (s, len = 80) => s && s.length > len ? s.slice(0, len) + '...' : s || '—';

  const toggle = id => setExpanded(prev => prev === id ? null : id);

  const handleDelete = (wordId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved word?')) return;
    fetch(`${window.location.origin}/api/words/${wordId}`, { method: 'DELETE' })
      .then(() => setWords(prev => prev.filter(w => w.id !== wordId)))
      .catch(() => {});
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Saved Words</h1>
          <p className="text-sm text-[#897365] mt-0.5">Browse all words saved by users</p>
        </div>
        <div className="flex items-center gap-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg px-4 py-2">
          <BookOpen className="w-4 h-4 text-[#AA7137]" />
          <span className="text-sm font-bold text-[#2A170F]">{filtered.length}</span>
          <span className="text-xs text-[#897365]">/ {words.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><BookOpen className="w-3 h-3" /> Total Saved</span>
          <p className="text-xl font-bold text-[#2A170F]">{stats?.total || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Hash className="w-3 h-3" /> Unique Words</span>
          <p className="text-xl font-bold text-[#AA7137]">{stats?.uniqueWords || 0}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Type className="w-3 h-3" /> Top Type</span>
          <p className="text-xl font-bold text-[#2A170F]">{stats?.typeDistribution?.[0]?.type || 'N/A'}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365] flex items-center gap-1"><Users className="w-3 h-3" /> This Week</span>
          <p className="text-xl font-bold text-green-600">{stats?.thisWeek || 0}</p>
        </div>
      </div>

      {stats?.typeDistribution?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setTypeFilter('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-[#AA7137] text-white' : 'bg-[#F5F0EB] text-[#897365] hover:bg-[#E8DDD0]'}`}>
            All Types
          </button>
          {stats.typeDistribution.map(t => (
            <button key={t.type} onClick={() => setTypeFilter(t.type)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${typeFilter === t.type ? 'bg-[#AA7137] text-white' : 'bg-[#F5F0EB] text-[#897365] hover:bg-[#E8DDD0]'}`}>
              {t.type} ({t.count})
            </button>
          ))}
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
        <input type="text" placeholder="Filter by word, user, or definition..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#897365] hover:text-[#2A170F]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#897365]">
          <Inbox className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No saved words found</p>
          <p className="text-xs mt-1">Words saved by users will appear here</p>
        </div>
      ) : (
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
                <th className="p-3 font-medium">Word</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">Definition</th>
                <th className="p-3 font-medium">Phonetic</th>
                <th className="p-3 font-medium">Saved</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w, i) => (
                <Fragment key={w.id}>
                  <motion.tr
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.015 }}
                    onClick={() => toggle(w.id)}
                    className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50 cursor-pointer transition-colors"
                  >
                    <td className="p-3 font-medium text-[#2A170F] capitalize">{w.word}</td>
                    <td className="p-3">
                      {w.type ? (
                        <span className="inline-block bg-[#F5F0EB] text-[#AA7137] px-2 py-0.5 rounded text-xs font-medium">{w.type}</span>
                      ) : <span className="text-[#897365]">—</span>}
                    </td>
                    <td className="p-3 text-[#897365] font-mono text-xs max-w-[100px] truncate">{w.userId}</td>
                    <td className="p-3 text-[#2A170F] max-w-[250px] truncate">{truncate(w.definition)}</td>
                    <td className="p-3 text-[#897365] text-xs">{w.phonetic || '—'}</td>
                    <td className="p-3 text-[#897365] text-xs whitespace-nowrap">{w.timestamp ? new Date(w.timestamp).toLocaleDateString() : '—'}</td>
                    <td className="p-3 text-right">
                      <button onClick={e => handleDelete(w.id, e)}
                        className="w-7 h-7 rounded-lg text-[#897365] hover:text-red-500 hover:bg-red-50 transition-colors inline-flex items-center justify-center">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggle(w.id)}
                        className="w-7 h-7 rounded-lg text-[#897365] hover:text-[#AA7137] hover:bg-[#F5F0EB] transition-colors inline-flex items-center justify-center">
                        {expanded === w.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </motion.tr>
                  {expanded === w.id && (
                    <tr className="bg-[#F5F0EB] border-b border-[#E8DDD0]">
                      <td colSpan={7} className="p-4">
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                          className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                          <div className="col-span-full">
                            <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">Full Definition</span>
                            <p className="text-[#2A170F] mt-0.5">{w.definition || '—'}</p>
                          </div>
                          {w.phonetic && (
                            <div>
                              <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">Phonetic</span>
                              <p className="text-[#AA7137] mt-0.5 font-medium">{w.phonetic}</p>
                            </div>
                          )}
                          {w.synonyms?.length > 0 && (
                            <div>
                              <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">Synonyms</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {w.synonyms.map(s => (
                                  <span key={s} className="bg-[#FFFBF5] text-[#2A170F] px-2 py-0.5 rounded text-xs border border-[#E8DDD0]">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {w.antonyms?.length > 0 && (
                            <div>
                              <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">Antonyms</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {w.antonyms.map(a => (
                                  <span key={a} className="bg-[#FFFBF5] text-[#2A170F] px-2 py-0.5 rounded text-xs border border-[#E8DDD0]">{a}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {(w.simpleSentence || w.complexSentence || w.compoundSentence) && (
                            <div className="col-span-full">
                              <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">Example Sentences</span>
                              <ul className="mt-1 space-y-1">
                                {w.simpleSentence && <li className="text-[#2A170F] text-sm flex gap-2"><span className="text-[#D48A4A]">•</span><span>{w.simpleSentence}</span></li>}
                                {w.complexSentence && <li className="text-[#2A170F] text-sm flex gap-2"><span className="text-[#D48A4A]">•</span><span>{w.complexSentence}</span></li>}
                                {w.compoundSentence && <li className="text-[#2A170F] text-sm flex gap-2"><span className="text-[#D48A4A]">•</span><span>{w.compoundSentence}</span></li>}
                              </ul>
                            </div>
                          )}
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
