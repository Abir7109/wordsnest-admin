import { Fragment, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, ChevronDown, ChevronUp, BookOpen, Inbox, X } from 'lucide-react';
import type { SavedWord } from '../types';

interface WordRow extends SavedWord {
  synonyms?: string[];
  sentences?: string[];
}

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, type: 'spring', stiffness: 80, damping: 14 },
  }),
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const headerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function Words() {
  const [words, setWords] = useState<WordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${window.location.origin}/api/words`)
      .then((res) => res.json())
      .then((data: WordRow[]) => {
        setWords(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const q = search.toLowerCase();
  const filtered = words.filter(
    (w) =>
      w.word.toLowerCase().includes(q) ||
      w.userId.toLowerCase().includes(q),
  );

  const truncate = (s?: string, len = 80) =>
    s && s.length > len ? s.slice(0, len) + '…' : s ?? '—';

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#897365] text-lg">
        Loading...
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show">
      <motion.div variants={headerItem} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Saved Words</h1>
          <p className="text-sm text-[#897365] mt-1">Browse all words saved by users</p>
        </div>
        <div className="flex items-center gap-2.5 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg px-4 py-2">
          <BookOpen className="w-4 h-4 text-[#AA7137]" />
          <span className="text-sm font-semibold text-[#2A170F]">{filtered.length}</span>
          <span className="text-xs text-[#897365]">total</span>
        </div>
      </motion.div>

      <motion.div variants={headerItem} className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
        <input
          type="text"
          placeholder="Filter by word or user ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#897365] hover:text-[#2A170F] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.div>

      {filtered.length === 0 ? (
        <motion.div
          variants={headerItem}
          className="flex flex-col items-center justify-center py-20 text-[#897365]"
        >
          <Inbox className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No saved words found</p>
          <p className="text-xs mt-1">Words saved by users will appear here</p>
        </motion.div>
      ) : (
        <motion.div
          variants={headerItem}
          className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Word</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">User ID</th>
                <th className="p-4 font-medium">Definition</th>
                <th className="p-4 font-medium">Saved</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w, i) => (
                <Fragment key={w.id}>
                  <motion.tr
                    custom={i}
                    variants={rowVariants}
                    initial="hidden"
                    animate="show"
                    onClick={() => toggle(w.id)}
                    className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50 cursor-pointer transition-colors"
                  >
                    <td className="p-4 font-medium text-[#2A170F]">{w.word}</td>
                    <td className="p-4">
                      {w.type ? (
                        <span className="inline-block bg-[#F5F0EB] text-[#AA7137] px-2.5 py-0.5 rounded text-xs font-medium">
                          {w.type}
                        </span>
                      ) : (
                        <span className="text-[#897365]">—</span>
                      )}
                    </td>
                    <td className="p-4 text-[#897365] font-mono text-xs">{w.userId}</td>
                    <td className="p-4 text-[#2A170F] max-w-[280px] truncate">
                      {truncate(w.definition)}
                    </td>
                    <td className="p-4 text-[#897365] text-xs whitespace-nowrap">
                      {w.timestamp ? new Date(w.timestamp).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggle(w.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#AA7137] hover:text-[#D48A4A] transition-colors"
                      >
                        {expanded === w.id ? (
                          <>
                            Less <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            More <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </td>
                  </motion.tr>
                  {expanded === w.id && (
                    <tr className="bg-[#F5F0EB] border-b border-[#E8DDD0]">
                      <td colSpan={6} className="p-4">
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm"
                        >
                          <div>
                            <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">
                              Full Definition
                            </span>
                            <p className="text-[#2A170F] mt-0.5">{w.definition || '—'}</p>
                          </div>
                          {w.phonetic && (
                            <div className="text-right">
                              <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">
                                Phonetic
                              </span>
                              <p className="text-[#AA7137] mt-0.5 font-medium">{w.phonetic}</p>
                            </div>
                          )}
                          {w.synonyms && w.synonyms.length > 0 && (
                            <div className="col-span-full">
                              <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">
                                Synonyms
                              </span>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {w.synonyms.map((s) => (
                                  <span
                                    key={s}
                                    className="bg-[#FFFBF5] text-[#2A170F] px-2 py-0.5 rounded text-xs border border-[#E8DDD0]"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {w.sentences && w.sentences.length > 0 && (
                            <div className="col-span-full">
                              <span className="text-xs text-[#897365] font-medium uppercase tracking-wider">
                                Sentences
                              </span>
                              <ul className="mt-1 space-y-1">
                                {w.sentences.map((s, idx) => (
                                  <li key={idx} className="text-[#2A170F] text-sm flex gap-2">
                                    <span className="text-[#D48A4A] mt-0.5 shrink-0">•</span>
                                    <span>{s}</span>
                                  </li>
                                ))}
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
        </motion.div>
      )}
    </motion.div>
  );
}
