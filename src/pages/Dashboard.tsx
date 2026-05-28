import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { DashboardStats } from '../types';

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

const cards = [
  { key: 'users' as const, emoji: '👥', title: 'Total Users', desc: 'Registered accounts' },
  { key: 'activeUsers' as const, emoji: '🟢', title: 'Active Users (24h)', desc: 'Active in last 24 hours' },
  { key: 'searches' as const, emoji: '🔍', title: 'Total Searches', desc: 'Dictionary lookups performed' },
  { key: 'words' as const, emoji: '📖', title: 'Saved Words', desc: 'Words bookmarked by users' },
  { key: 'quizzes' as const, emoji: '🧠', title: 'Quizzes Taken', desc: 'Quiz sessions completed' },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 80, damping: 14 } },
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${window.location.origin}/api/dashboard`)
      .then((res) => res.json())
      .then((data: DashboardStats) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#897365] text-lg">
        Loading...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64 text-[#897365] text-lg">
        Failed to load dashboard data.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#2A170F] mb-6">Dashboard</h1>
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {cards.map((card) => (
          <motion.div
            key={card.key}
            variants={item}
            className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 flex flex-col gap-2"
          >
            <span className="text-2xl">{card.emoji}</span>
            <span className="text-sm font-medium text-[#897365]">{card.title}</span>
            <span className="text-3xl font-bold text-[#2A170F]">{stats[card.key]}</span>
            <span className="text-xs text-[#897365]">{card.desc}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
