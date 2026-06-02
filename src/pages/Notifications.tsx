import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Send, Bell, Clock, CheckCircle, XCircle, History, Users, Smartphone, Trash2, RefreshCw, Sparkles, Settings, Play, Pause, Loader, Zap } from 'lucide-react';
import type { NotificationItem } from '../types';
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

const TEMPLATES = [
  { title: 'New Update Available', message: 'Words Nest v{version} is here with exciting new features! Update now to enjoy the best experience.' },
  { title: 'Daily Streak Reminder', message: 'Keep your streak alive! Open Words Nest and learn something new today.' },
  { title: 'Quiz Challenge', message: 'Test your vocabulary with today\'s quiz challenge. Can you beat your high score?' },
  { title: 'Welcome to Words Nest', message: 'Welcome! Start exploring words and building your vocabulary today.' },
  { title: 'Feature Announcement', message: 'We\'ve added new features based on your feedback. Check them out now!' },
];

export default function Notifications() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetUserId, setTargetUserId] = useState('all');
  const [specificUserId, setSpecificUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('send');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiInterval, setAiInterval] = useState(60);
  const [aiTimeOfDay, setAiTimeOfDay] = useState('');
  const [aiSaving, setAiSaving] = useState(false);
  const [aiConfigLoading, setAiConfigLoading] = useState(true);
  const [aiLastSent, setAiLastSent] = useState(0);
  const [aiNextSend, setAiNextSend] = useState(0);

  useEffect(() => {
    refreshHistory();
    loadAiConfig();
    const interval = setInterval(refreshHistory, 7000);
    return () => clearInterval(interval);
  }, []);

  const loadAiConfig = async () => {
    setAiConfigLoading(true);
    try {
      const res = await apiFetch(`${window.location.origin}/api/ai/notification-agent-config`);
      const data = await res.json();
      setAiPrompt(data.prompt || '');
      setAiEnabled(data.enabled || false);
      setAiInterval(data.intervalMinutes || 60);
      setAiTimeOfDay(data.timeOfDay || '');
      setAiLastSent(data.lastSentAt || 0);
      setAiNextSend(data.nextSendAt || 0);
    } catch (e) { console.error(e); }
    setAiConfigLoading(false);
  };

  const saveAiConfig = async () => {
    if (!aiPrompt.trim()) return;
    setAiSaving(true);
    try {
      await apiFetch(`${window.location.origin}/api/ai/notification-agent-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          enabled: aiEnabled,
          intervalMinutes: aiInterval,
          timeOfDay: aiTimeOfDay || null,
        }),
      });
      await loadAiConfig();
    } catch (e) { console.error(e); }
    setAiSaving(false);
  };

  const refreshHistory = () => {
    apiFetch(`${window.location.origin}/api/admin/notifications`)
      .then(r => r.json())
      .then(data => setHistory(data.notifications || []))
      .catch(() => {});
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    const effectiveUserId = targetUserId === 'specific' ? specificUserId : 'all';
    if (targetUserId === 'specific' && !effectiveUserId.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch(`${window.location.origin}/api/admin/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), message: message.trim(), targetUserId: effectiveUserId }),
      });
      if (res.ok) {
        setTitle('');
        setMessage('');
        refreshHistory();
      }
    } catch (e) {
      console.error(e);
    }
    setSending(false);
  };

  const applyTemplate = (template) => {
    setTitle(template.title);
    setMessage(template.message);
  };

  const successful = history.filter(n => n.success).length;
  const failed = history.filter(n => !n.success).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Notifications</h1>
          <p className="text-sm text-[#897365] mt-0.5">Send push notifications to users</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Total Sent</span>
          <p className="text-xl font-bold text-[#2A170F]">{history.length}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Successful</span>
          <p className="text-xl font-bold text-green-600">{successful}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Failed</span>
          <p className="text-xl font-bold text-red-500">{failed}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Success Rate</span>
          <p className="text-xl font-bold text-[#AA7137]">{history.length > 0 ? Math.round(successful / history.length * 100) : 0}%</p>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-5 bg-[#FFFBF5] border border-[#E8DDD0] rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('send')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'send' ? 'bg-[#AA7137] text-white shadow-sm' : 'text-[#897365] hover:text-[#2A170F]'}`}>
          <Send className="w-3.5 h-3.5 inline mr-1.5" /> Send
        </button>
        <button onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-[#AA7137] text-white shadow-sm' : 'text-[#897365] hover:text-[#2A170F]'}`}>
          <History className="w-3.5 h-3.5 inline mr-1.5" /> History ({history.length})
        </button>
        <button onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'templates' ? 'bg-[#AA7137] text-white shadow-sm' : 'text-[#897365] hover:text-[#2A170F]'}`}>
          <Bell className="w-3.5 h-3.5 inline mr-1.5" /> Templates
        </button>
        <button onClick={() => setActiveTab('ai')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'ai' ? 'bg-[#AA7137] text-white shadow-sm' : 'text-[#897365] hover:text-[#2A170F]'}`}>
          <Sparkles className="w-3.5 h-3.5 inline mr-1.5" /> AI Automation
        </button>
      </div>

      {activeTab === 'send' && (
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 max-w-2xl">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-[#897365] uppercase tracking-wider">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="Notification title"
                className="w-full mt-1 px-4 py-2.5 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] placeholder-[#BFA090] outline-none focus:border-[#D48A4A]" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#897365] uppercase tracking-wider">Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Notification message"
                className="w-full mt-1 px-4 py-2.5 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] placeholder-[#BFA090] outline-none focus:border-[#D48A4A] resize-none h-24" />
            </div>
            <div>
              <label className="text-xs font-medium text-[#897365] uppercase tracking-wider">Target</label>
              <select value={targetUserId} onChange={e => setTargetUserId(e.target.value)}
                className="w-full mt-1 px-4 py-2.5 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
                <option value="all">All Users</option>
                <option value="active">Active Users Only</option>
                <option value="specific">Specific User (enter UID)</option>
              </select>
              {targetUserId === 'specific' && (
                <input type="text" value={specificUserId}
                  onChange={e => setSpecificUserId(e.target.value)}
                  placeholder="Enter user UID"
                  className="w-full mt-2 px-4 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
              )}
            </div>
            <button onClick={handleSend} disabled={sending || !title.trim() || !message.trim()}
              className="btn-primary inline-flex items-center gap-2">
              <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
          <div className="p-3 border-b border-[#E8DDD0] flex items-center justify-between">
            <span className="text-xs font-medium text-[#897365] uppercase tracking-wider">Notification History</span>
            <button onClick={refreshHistory} className="text-[#897365] hover:text-[#2A170F] transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {history.length > 0 ? (
            <div className="divide-y divide-[#E8DDD0]">
              {history.map((n, i) => (
                <div key={n.id || i} className="p-4 hover:bg-[#F5F0EB]/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {n.success ? (
                          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <p className="text-sm font-medium text-[#2A170F] truncate">{n.title}</p>
                      </div>
                      <p className="text-xs text-[#897365] mt-1 ml-6 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-3 mt-1.5 ml-6">
                        <span className="text-[10px] text-[#BFA090]">{timeAgo(n.sentAt)}</span>
                        <span className="text-[10px] text-[#BFA090]">Target: {n.target}</span>
                        {n.sentCount && <span className="text-[10px] text-green-600">{n.sentCount} delivered</span>}
                      </div>
                    </div>
                    {n.error && <span className="text-[10px] text-red-500 max-w-[150px] text-right">{n.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-[#897365]">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notifications sent yet</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TEMPLATES.map((t, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-4 cursor-pointer hover:border-[#D48A4A] hover:shadow-sm transition-all"
              onClick={() => { applyTemplate(t); setActiveTab('send'); }}
            >
              <p className="text-sm font-medium text-[#2A170F]">{t.title}</p>
              <p className="text-xs text-[#897365] mt-1 line-clamp-2">{t.message}</p>
              <p className="text-[10px] text-[#AA7137] mt-2">Click to apply template</p>
            </motion.div>
          ))}
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="max-w-2xl space-y-5">
          <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#2A170F] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D48A4A]" /> AI Notification Agent
                </h3>
                <p className="text-xs text-[#897365] mt-0.5">The AI automatically sends notifications based on your prompt.</p>
              </div>
              <button onClick={() => setAiEnabled(!aiEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${aiEnabled ? 'bg-[#D48A4A]' : 'bg-[#E8DDD0]'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${aiEnabled ? 'translate-x-6' : ''}`} />
              </button>
            </div>

            {aiConfigLoading ? (
              <div className="text-center py-4 text-[#897365] text-sm"><Loader className="w-4 h-4 inline animate-spin mr-1" /> Loading config...</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-[#897365] uppercase tracking-wider">Automation Prompt</label>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                    placeholder="Describe when and what type of notifications the AI should send. e.g.: 'Send motivational vocabulary tips every morning at 9am. Include a word of the day with its meaning and an example sentence.'"
                    className="w-full mt-1 px-4 py-3 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] placeholder-[#BFA090] outline-none focus:border-[#D48A4A] resize-none h-28" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-[#897365] uppercase tracking-wider">Interval (minutes)</label>
                    <input type="number" value={aiInterval} onChange={e => setAiInterval(Math.max(1, parseInt(e.target.value) || 60))}
                      min={1} max={1440}
                      className="w-full mt-1 px-4 py-2.5 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#897365] uppercase tracking-wider">Time of day (optional)</label>
                    <input type="time" value={aiTimeOfDay} onChange={e => setAiTimeOfDay(e.target.value)}
                      className="w-full mt-1 px-4 py-2.5 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
                  </div>
                </div>
                <button onClick={saveAiConfig} disabled={aiSaving || !aiPrompt.trim()}
                  className="btn-primary inline-flex items-center gap-2 text-sm">
                  {aiSaving ? <><Loader className="w-4 h-4 animate-spin" /> Saving...</> : <><Settings className="w-4 h-4" /> Save Configuration</>}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
              <span className="text-xs text-[#897365] flex items-center gap-1"><Zap className="w-3 h-3" /> Status</span>
              <p className={`text-lg font-bold mt-0.5 ${aiEnabled ? 'text-green-600' : 'text-[#897365]'}`}>
                {aiEnabled ? 'Active' : 'Paused'}
              </p>
            </div>
            <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
              <span className="text-xs text-[#897365] flex items-center gap-1"><History className="w-3 h-3" /> Last Sent</span>
              <p className="text-lg font-bold text-[#2A170F] mt-0.5">{aiLastSent ? timeAgo(aiLastSent) : 'Never'}</p>
            </div>
            <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
              <span className="text-xs text-[#897365] flex items-center gap-1"><Clock className="w-3 h-3" /> Next Send</span>
              <p className="text-lg font-bold text-[#AA7137] mt-0.5">{aiNextSend > Date.now() ? timeAgo(aiNextSend) : 'Soon'}</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#FFF8F0] to-[#FFFBF5] rounded-xl border border-[#D48A4A]/20 p-4">
            <p className="text-xs font-medium text-[#897365] mb-2">💡 Prompt Ideas</p>
            <div className="space-y-1.5">
              {[
                'Send a vocabulary word of the day every morning at 9am with definition and example sentence.',
                'Send quiz challenge reminders every 4 hours during daytime. Make them fun and encouraging.',
                'Send streak encouragement notifications when users haven\'t been active for a day. Keep it warm and motivational.',
              ].map((idea, i) => (
                <button key={i} onClick={() => setAiPrompt(idea)}
                  className="text-xs text-left text-[#897365] hover:text-[#2A170F] bg-white/50 hover:bg-white rounded-lg px-3 py-2 w-full transition-colors border border-[#E8DDD0]/50">
                  {idea}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
