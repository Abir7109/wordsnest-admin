import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Brain, Trophy, Target, Calendar } from 'lucide-react';
import type { QuizEvent } from '../types';

function medal(score: number): string {
  if (score >= 10) return '🥇';
  if (score >= 7) return '🥈';
  if (score >= 5) return '🥉';
  return '📝';
}

function getToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function Quizzes() {
  const [quizzes, setQuizzes] = useState<QuizEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${window.location.origin}/api/quizzes`)
      .then((r) => r.json())
      .then((data: { quizzes: QuizEvent[] }) => {
        setQuizzes(data.quizzes ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = quizzes.length;
  const scores = quizzes.map((q) => q.score ?? 0);
  const avg = total ? (scores.reduce((a, b) => a + b, 0) / total).toFixed(1) : '0.0';
  const highest = total ? Math.max(...scores) : 0;
  const today = getToday();
  const todayCount = quizzes.filter((q) => (q.timestamp ?? 0) >= today).length;

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[#D48A4A] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Brain className="w-6 h-6 text-[#AA7137]" />
        <h1 className="text-2xl font-bold text-[#2A170F]">Quizzes</h1>
      </div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.08 } },
        }}
      >
        {[
          { icon: Brain, label: 'Total Quizzes', value: total, color: '#D48A4A' },
          { icon: Target, label: 'Average Score', value: avg, color: '#AA7137' },
          { icon: Trophy, label: 'Highest Score', value: highest, color: '#2A170F' },
          { icon: Calendar, label: "Today's Quizzes", value: todayCount, color: '#897365' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            className="stats-card"
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0 },
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <card.icon className="w-5 h-5" style={{ color: card.color }} />
              <span className="text-xs font-medium text-[#897365] uppercase tracking-wider">
                {card.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-[#2A170F]">{card.value}</p>
          </motion.div>
        ))}
      </motion.div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F5F0EB]">
                <th className="table-header">User ID</th>
                <th className="table-header">Score</th>
                <th className="table-header">Date</th>
              </tr>
            </thead>
            <motion.tbody
              variants={container}
              initial="hidden"
              animate="show"
            >
              {quizzes.map((q) => (
                <motion.tr key={q.id} variants={item} className="hover:bg-[#F5F0EB]/50 transition-colors">
                  <td className="table-cell font-mono text-xs max-w-[160px] truncate">
                    {q.userId}
                  </td>
                  <td className="table-cell">
                    <span className="flex items-center gap-1.5">
                      {medal(q.score ?? 0)}
                      <span className="font-semibold">{q.score ?? 0}</span>
                    </span>
                  </td>
                  <td className="table-cell text-[#897365]">
                    {q.timestamp ? new Date(q.timestamp).toLocaleDateString() : '—'}
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>

        {quizzes.length === 0 && (
          <div className="text-center py-12 text-[#897365] text-sm">No quizzes found.</div>
        )}
      </div>
    </div>
  );
}
