import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, Users, BookOpen, Brain, Search, Activity, Calendar, Download } from 'lucide-react';
import type { TimelineDay, WordTypeStat } from '../types';

const COLORS = ['#D48A4A', '#AA7137', '#8B5E2E', '#6B4F2E', '#C4956A', '#A08060', '#907050', '#E8C4A0'];

function StatBox({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-4">
      <div className="flex items-center gap-2 text-xs text-[#897365] mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className="text-xl font-bold text-[#2A170F]">{value}</p>
    </div>
  );
}

export default function Analytics() {
  const [timeline, setTimeline] = useState([]);
  const [wordTypes, setWordTypes] = useState([]);
  const [usersStats, setUsersStats] = useState(null);
  const [wordsStats, setWordsStats] = useState(null);
  const [searchesStats, setSearchesStats] = useState(null);
  const [quizzesStats, setQuizzesStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${window.location.origin}/api/dashboard/timeline`).then(r => r.json()),
      fetch(`${window.location.origin}/api/dashboard/word-types`).then(r => r.json()),
      fetch(`${window.location.origin}/api/users/stats`).then(r => r.json()),
      fetch(`${window.location.origin}/api/words/stats`).then(r => r.json()),
      fetch(`${window.location.origin}/api/searches/stats`).then(r => r.json()),
      fetch(`${window.location.origin}/api/quizzes/stats`).then(r => r.json()),
    ]).then(([tl, wt, us, ws, ss, qs]) => {
      setTimeline(tl.timeline || []);
      setWordTypes(wt.distribution || []);
      setUsersStats(us);
      setWordsStats(ws);
      setSearchesStats(ss);
      setQuizzesStats(qs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2A170F]">Analytics</h1>
        <p className="text-sm text-[#897365] mt-0.5">In-depth analysis of user activity and content</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox icon={Users} label="Total Users" value={usersStats?.total || 0} color="bg-blue-500" />
        <StatBox icon={Activity} label="Active Users" value={usersStats?.active || 0} color="bg-green-500" />
        <StatBox icon={BookOpen} label="Words Saved" value={wordsStats?.total || 0} color="bg-amber-500" />
        <StatBox icon={Brain} label="Avg Quiz Score" value={`${quizzesStats?.averageScore || 0}%`} color="bg-purple-500" />
      </div>

      {timeline.length > 0 && (
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-4">7-Day Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#897365' }} />
                <YAxis tick={{ fontSize: 11, fill: '#897365' }} />
                <Tooltip contentStyle={{ background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8 }} />
                <Line type="monotone" dataKey="searches" stroke="#D48A4A" strokeWidth={2} name="Searches" />
                <Line type="monotone" dataKey="words" stroke="#AA7137" strokeWidth={2} name="Words" />
                <Line type="monotone" dataKey="quizzes" stroke="#8B5E2E" strokeWidth={2} name="Quizzes" />
                <Line type="monotone" dataKey="newUsers" stroke="#4A7C59" strokeWidth={2} name="New Users" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {wordTypes.length > 0 && (
          <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
            <h3 className="text-sm font-semibold text-[#2A170F] mb-4">Word Type Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={wordTypes} cx="50%" cy="50%" outerRadius={90} dataKey="count" nameKey="type" label={({ type, percentage }) => `${type} ${percentage}%`}>
                    {wordTypes.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#FFFBF5', border: '1px solid #E8DDD0', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-4">User Growth</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#F5F0EB] rounded-lg p-3 text-center">
                <p className="text-xs text-[#897365]">New Today</p>
                <p className="text-2xl font-bold text-green-600">{usersStats?.newToday || 0}</p>
              </div>
              <div className="bg-[#F5F0EB] rounded-lg p-3 text-center">
                <p className="text-xs text-[#897365]">This Week</p>
                <p className="text-2xl font-bold text-[#AA7137]">{usersStats?.thisWeek || 0}</p>
              </div>
              <div className="bg-[#F5F0EB] rounded-lg p-3 text-center">
                <p className="text-xs text-[#897365]">This Month</p>
                <p className="text-2xl font-bold text-blue-600">{usersStats?.thisMonth || 0}</p>
              </div>
              <div className="bg-[#F5F0EB] rounded-lg p-3 text-center">
                <p className="text-xs text-[#897365]">Retention</p>
                <p className="text-2xl font-bold text-purple-600">{timeline.length > 1 ? Math.round((timeline[timeline.length - 1].activeUsers / Math.max(1, timeline[0].newUsers)) * 100) : 0}%</p>
              </div>
            </div>

            {usersStats?.byVersion && Object.keys(usersStats.byVersion).length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#897365] uppercase tracking-wider mb-2">By App Version</p>
                <div className="space-y-1.5">
                  {Object.entries(usersStats.byVersion).sort((a, b) => b[1] - a[1]).map(([v, c]) => (
                    <div key={v} className="flex items-center gap-2 text-xs">
                      <span className="text-[#2A170F] w-16">v{v}</span>
                      <div className="flex-1 h-4 bg-[#E8DDD0] rounded overflow-hidden">
                        <div className="h-full bg-[#AA7137] rounded" style={{ width: `${(c / usersStats.total) * 100}%` }} />
                      </div>
                      <span className="text-[#897365] w-8 text-right">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-[#AA7137]" /> Search Stats
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Total</span><span className="font-medium">{searchesStats?.total || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Today</span><span className="font-medium">{searchesStats?.today || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">This Week</span><span className="font-medium">{searchesStats?.thisWeek || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Unique Words</span><span className="font-medium">{searchesStats?.uniqueWords || 0}</span></div>
            <div className="pt-2 border-t border-[#E8DDD0]">
              <p className="text-xs font-medium text-[#897365] uppercase mb-2">Top Searches</p>
              {(searchesStats?.topSearches || []).slice(0, 5).map((s, i) => (
                <div key={s.word} className="flex items-center justify-between text-xs py-1">
                  <span className="text-[#2A170F]">#{i + 1} {s.word}</span>
                  <span className="text-[#897365]">{s.count}x</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#AA7137]" /> Word Stats
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Total Saved</span><span className="font-medium">{wordsStats?.total || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Today</span><span className="font-medium">{wordsStats?.today || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">This Week</span><span className="font-medium">{wordsStats?.thisWeek || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Unique Words</span><span className="font-medium">{wordsStats?.uniqueWords || 0}</span></div>
            <div className="pt-2 border-t border-[#E8DDD0]">
              <p className="text-xs font-medium text-[#897365] uppercase mb-2">By Type</p>
              {(wordsStats?.typeDistribution || []).slice(0, 5).map(t => (
                <div key={t.type} className="flex items-center justify-between text-xs py-1">
                  <span className="text-[#2A170F]">{t.type}</span>
                  <span className="text-[#897365]">{t.count} ({t.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
          <h3 className="text-sm font-semibold text-[#2A170F] mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" /> Quiz Stats
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Total Taken</span><span className="font-medium">{quizzesStats?.total || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Today</span><span className="font-medium">{quizzesStats?.today || 0}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Avg Score</span><span className="font-medium">{quizzesStats?.averageScore || 0}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Highest</span><span className="font-medium">{quizzesStats?.highestScore || 0}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Lowest</span><span className="font-medium">{quizzesStats?.lowestScore || 0}%</span></div>
            <div className="flex justify-between text-sm"><span className="text-[#897365]">Participants</span><span className="font-medium">{quizzesStats?.totalParticipants || 0}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
