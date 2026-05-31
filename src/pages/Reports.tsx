import { useEffect, useState } from 'react';
import { Bug, CheckCircle, XCircle, Trash2, RefreshCw, Clock, User, Smartphone } from 'lucide-react';

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

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, []);

  const refresh = () => {
    fetch(`${window.location.origin}/api/reports`)
      .then(r => r.json())
      .then(data => setReports(data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const markRead = async (id) => {
    try {
      await fetch(`${window.location.origin}/api/reports/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'read' }),
      });
      refresh();
    } catch (e) { console.error(e); }
  };

  const deleteReport = async (id) => {
    if (!confirm('Delete this bug report?')) return;
    try {
      await fetch(`${window.location.origin}/api/reports/${id}`, { method: 'DELETE' });
      refresh();
    } catch (e) { console.error(e); }
  };

  const unread = reports.filter(r => r.status === 'unread').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Bug Reports</h1>
          <p className="text-sm text-[#897365] mt-0.5">User-submitted bug reports from the app</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Total Reports</span>
          <p className="text-xl font-bold text-[#2A170F]">{reports.length}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Unread</span>
          <p className="text-xl font-bold text-amber-600">{unread}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Read</span>
          <p className="text-xl font-bold text-green-600">{reports.length - unread}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Auto-refresh</span>
          <p className="text-xl font-bold text-[#AA7137]">10s</p>
        </div>
      </div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <div className="p-3 border-b border-[#E8DDD0] flex items-center justify-between">
          <span className="text-xs font-medium text-[#897365] uppercase tracking-wider">
            {loading ? 'Loading...' : `${reports.length} report${reports.length !== 1 ? 's' : ''}`}
          </span>
          <button onClick={refresh} className="text-[#897365] hover:text-[#2A170F] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {reports.length > 0 ? (
          <div className="divide-y divide-[#E8DDD0]">
            {reports.map((r, i) => (
              <div key={r.id || i} className="p-4 hover:bg-[#F5F0EB]/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {r.status === 'unread' ? (
                        <Bug className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.status === 'unread' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {r.status || 'unread'}
                      </span>
                    </div>
                    <p className="text-sm text-[#2A170F] mt-2 whitespace-pre-wrap">{r.message}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="text-[10px] text-[#BFA090] flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {timeAgo(r.timestamp)}
                      </span>
                      <span className="text-[10px] text-[#BFA090] flex items-center gap-1">
                        <User className="w-3 h-3" /> {r.username || 'Unknown'}
                      </span>
                      {r.appVersion && (
                        <span className="text-[10px] text-[#BFA090] flex items-center gap-1">
                          <Smartphone className="w-3 h-3" /> v{r.appVersion}
                        </span>
                      )}
                      {r.userId && (
                        <span className="text-[10px] font-mono text-[#BFA090]">{r.userId.slice(0, 12)}...</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {r.status === 'unread' && (
                      <button onClick={() => markRead(r.id)}
                        className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                        title="Mark as read">
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => deleteReport(r.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                      title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-[#897365]">
            <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{loading ? 'Loading...' : 'No bug reports yet'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
