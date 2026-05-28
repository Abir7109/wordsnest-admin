import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, X, Inbox, SearchCheck } from 'lucide-react';
import type { SearchEvent } from '../types';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.03, type: 'spring', stiffness: 80, damping: 14 },
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

const statusStyles: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function Searches() {
  const [searches, setSearches] = useState<SearchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${window.location.origin}/api/searches`)
      .then((res) => res.json())
      .then((data: SearchEvent[]) => {
        setSearches(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const q = search.toLowerCase();
  const filtered = searches.filter(
    (s) =>
      (s.word ?? '').toLowerCase().includes(q) ||
      (s.user_id ?? '').toLowerCase().includes(q),
  );

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
          <h1 className="text-2xl font-bold text-[#2A170F]">Searches</h1>
          <p className="text-sm text-[#897365] mt-1">Dictionary lookups performed by users</p>
        </div>
        <div className="flex items-center gap-2.5 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg px-4 py-2">
          <SearchCheck className="w-4 h-4 text-[#AA7137]" />
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
          <p className="text-sm font-medium">No searches found</p>
          <p className="text-xs mt-1">User searches will appear here</p>
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
                <th className="p-4 font-medium">User ID</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <motion.tr
                  key={s.id}
                  custom={i}
                  variants={rowVariants}
                  initial="hidden"
                  animate="show"
                  className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50 transition-colors"
                >
                  <td className="p-4 font-medium text-[#2A170F]">{s.word || '—'}</td>
                  <td className="p-4 text-[#897365] font-mono text-xs">
                    {s.user_id || '—'}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusStyles[s.status ?? ''] ?? 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {s.status || 'unknown'}
                    </span>
                  </td>
                  <td className="p-4 text-[#897365] text-xs whitespace-nowrap">
                    {s.timestamp ? timeAgo(s.timestamp) : '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </motion.div>
  );
}
