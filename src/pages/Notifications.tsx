import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { NotificationItem } from '../types';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Notifications() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('all');
  const [userId, setUserId] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${window.location.origin}/api/admin/notifications`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  const showToast = (ok: boolean, text: string) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      const body: Record<string, string> = { title: title.trim(), message: message.trim() };
      if (target === 'specific' && userId.trim()) body.targetUserId = userId.trim();
      const res = await fetch(`${window.location.origin}/api/admin/send-notification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await res.json();
      if (res.ok) {
        showToast(true, 'Notification sent successfully!');
        setTitle(''); setMessage(''); setUserId('');
        fetchHistory();
      } else {
        showToast(false, result.error || 'Failed to send notification');
      }
    } catch {
      showToast(false, 'Network error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <Bell className="w-7 h-7 text-nest-amber" />
        <h1 className="text-2xl font-bold text-nest-brown">Push Notifications</h1>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSend}
        className="bg-nest-cream rounded-xl border border-nest-border p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-nest-brown">Send Notification</h2>

        <div>
          <label className="block text-sm font-medium text-nest-muted mb-1">Title</label>
          <input
            className="input-field"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Notification title"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-nest-muted mb-1">Message</label>
          <textarea
            className="input-field min-h-[100px] resize-y"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Notification message"
            required
          />
        </div>

        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-nest-muted mb-1">Target</label>
            <select
              className="input-field"
              value={target}
              onChange={e => setTarget(e.target.value)}
            >
              <option value="all">All Users</option>
              <option value="specific">Specific User ID</option>
            </select>
          </div>
          {target === 'specific' && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              className="flex-1"
            >
              <label className="block text-sm font-medium text-nest-muted mb-1">User ID</label>
              <input
                className="input-field"
                value={userId}
                onChange={e => setUserId(e.target.value)}
                placeholder="Enter user ID"
              />
            </motion.div>
          )}
        </div>

        <button type="submit" className="btn-primary flex items-center gap-2" disabled={sending}>
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'Sending...' : 'Send Notification'}
        </button>
      </motion.form>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-nest-cream rounded-xl border border-nest-border p-6"
      >
        <h2 className="text-lg font-semibold text-nest-brown mb-4">Notification History</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-nest-amber" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-nest-muted text-center py-8">No notifications sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Title</th>
                  <th className="table-header">Message</th>
                  <th className="table-header">Target</th>
                  <th className="table-header">Sent</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {history.map((n, i) => (
                    <motion.tr
                      key={`${n.sentAt}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-nest-border last:border-0"
                    >
                      <td className="table-cell font-medium text-nest-brown">{n.title}</td>
                      <td className="table-cell text-nest-muted max-w-[200px] truncate">{n.message}</td>
                      <td className="table-cell text-nest-muted">{n.target}</td>
                      <td className="table-cell text-nest-muted whitespace-nowrap">{timeAgo(n.sentAt)}</td>
                      <td className="table-cell">
                        {n.success ? (
                          <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs font-medium">
                            <CheckCircle className="w-3 h-3" /> Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs font-medium" title={n.error}>
                            <XCircle className="w-3 h-3" /> Failed
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-6 left-1/2 px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium z-50 ${
              toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
