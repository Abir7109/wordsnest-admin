import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { UserProfile, SavedWord, QuizEvent } from '../types';

interface UserDetail {
  savedWords: SavedWord[];
  quizEvents: QuizEvent[];
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const rowVariants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, type: 'spring', stiffness: 80, damping: 14 },
  }),
};

export default function Users() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<Record<string, UserDetail>>({});

  useEffect(() => {
    fetch(`${window.location.origin}/api/users`)
      .then((res) => res.json())
      .then((data: UserProfile[]) => {
        setUsers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.uid?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q)
    );
  });

  const toggleExpand = (uid: string) => {
    if (expandedUid === uid) {
      setExpandedUid(null);
      return;
    }
    setExpandedUid(uid);
    if (!userDetails[uid]) {
      fetch(`${window.location.origin}/api/users/${uid}`)
        .then((res) => res.json())
        .then((detail: UserDetail) => {
          setUserDetails((prev) => ({ ...prev, [uid]: detail }));
        })
        .catch(() => {});
    }
  };

  const deleteUser = (uid: string) => {
    if (!window.confirm(`Are you sure you want to delete user ${uid}?`)) return;
    fetch(`${window.location.origin}/api/users/${uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'DELETE' }),
    })
      .then(() => {
        setUsers((prev) => prev.filter((u) => u.uid !== uid));
      })
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#897365] text-lg">
        Loading...
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#2A170F] mb-6">Users</h1>

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
        <input
          type="text"
          placeholder="Search by UID, email or username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]"
        />
      </div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
              <th className="p-4 font-medium">UID</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Username</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Device</th>
              <th className="p-4 font-medium">App Version</th>
              <th className="p-4 font-medium">Last Active</th>
              <th className="p-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user, i) => (
              <motion.tr
                key={user.uid}
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate="show"
                className="border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50 cursor-pointer"
                onClick={() => toggleExpand(user.uid)}
              >
                <td className="p-4 font-mono text-xs text-[#2A170F]">{user.uid}</td>
                <td className="p-4 text-[#2A170F]">{user.email || '—'}</td>
                <td className="p-4 text-[#2A170F]">{user.username || '—'}</td>
                <td className="p-4">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {user.status || 'inactive'}
                  </span>
                </td>
                <td className="p-4 text-[#897365]">{user.device_model || '—'}</td>
                <td className="p-4 text-[#897365]">{user.app_version || '—'}</td>
                <td className="p-4 text-[#897365] whitespace-nowrap">
                  {user.lastActive ? timeAgo(user.lastActive) : '—'}
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteUser(user.uid);
                    }}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#897365] hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <span className="inline-flex items-center justify-center w-8 h-8 text-[#897365]">
                    {expandedUid === user.uid ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="p-8 text-center text-[#897365]">No users found.</div>
        )}
      </div>

      {expandedUid && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 overflow-hidden"
        >
          <h2 className="text-sm font-semibold text-[#2A170F] mb-3">
            User Details — {expandedUid}
          </h2>
          {userDetails[expandedUid] ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-medium text-[#897365] uppercase tracking-wider mb-2">
                  Saved Words
                </h3>
                {userDetails[expandedUid].savedWords.length > 0 ? (
                  <div className="space-y-1.5">
                    {userDetails[expandedUid].savedWords.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between bg-[#F5F0EB] rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-[#2A170F]">{w.word}</span>
                        <span className="text-xs text-[#897365]">
                          {w.timestamp ? timeAgo(w.timestamp) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#897365]">No saved words.</p>
                )}
              </div>
              <div>
                <h3 className="text-xs font-medium text-[#897365] uppercase tracking-wider mb-2">
                  Quiz Stats
                </h3>
                {userDetails[expandedUid].quizEvents.length > 0 ? (
                  <div className="space-y-1.5">
                    {userDetails[expandedUid].quizEvents.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between bg-[#F5F0EB] rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="text-[#2A170F]">
                          Score: <strong>{q.score ?? '—'}</strong>
                        </span>
                        <span className="text-xs text-[#897365]">
                          {q.timestamp ? timeAgo(q.timestamp) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#897365]">No quizzes taken.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#897365]">Loading details...</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
