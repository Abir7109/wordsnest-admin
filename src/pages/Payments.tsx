import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle, XCircle, Search, Clock, Smartphone, User, RefreshCw } from 'lucide-react';
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

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('unverified');
  const [search, setSearch] = useState('');

  const load = () => {
    apiFetch(`${window.location.origin}/api/admin/payments`)
      .then(r => r.json())
      .then(data => {
        setPayments(data.payments || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const verifyPayment = async (trxId, months = 1) => {
    if (!confirm(`Verify payment ${trxId} and activate ${months} month(s) subscription?`)) return;
    try {
      await apiFetch(`${window.location.origin}/api/admin/payments/${trxId}/verify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months }),
      });
      load();
    } catch (e) { console.error(e); }
  };

  const filtered = payments.filter(p => {
    if (filter === 'unverified' && p.verified) return false;
    if (filter === 'verified' && !p.verified) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.trxId?.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q);
    }
    return true;
  });

  const unverified = payments.filter(p => !p.verified).length;
  const verifiedCount = payments.filter(p => p.verified).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Payments</h1>
          <p className="text-sm text-[#897365] mt-0.5">bKash payment verification · {unverified} pending</p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#897365] hover:text-[#2A170F] transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Total Payments</span>
          <p className="text-xl font-bold text-[#2A170F]">{payments.length}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Pending Verification</span>
          <p className="text-xl font-bold text-amber-600">{unverified}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Verified</span>
          <p className="text-xl font-bold text-green-600">{verifiedCount}</p>
        </div>
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-3">
          <span className="text-xs text-[#897365]">Revenue (BDT)</span>
          <p className="text-xl font-bold text-[#AA7137]">{verifiedCount * 100} ৳</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#897365]" />
          <input type="text" placeholder="Search by TrxID, phone or username..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] placeholder-[#897365] outline-none focus:border-[#D48A4A]" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="px-3 py-2 bg-[#FFFBF5] border border-[#E8DDD0] rounded-lg text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
          <option value="unverified">Pending Only</option>
          <option value="verified">Verified Only</option>
          <option value="all">All Payments</option>
        </select>
      </div>

      <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E8DDD0] text-left text-[#897365] text-xs uppercase tracking-wider">
              <th className="p-3 font-medium">Phone</th>
              <th className="p-3 font-medium">Username</th>
              <th className="p-3 font-medium">TrxID</th>
              <th className="p-3 font-medium">Amount</th>
              <th className="p-3 font-medium">Device</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.trxId || i}
                className={`border-b border-[#E8DDD0] last:border-0 hover:bg-[#F5F0EB]/50 ${!p.verified ? 'bg-amber-50/30' : ''}`}>
                <td className="p-3 font-mono text-xs text-[#2A170F]">{p.phone || '—'}</td>
                <td className="p-3 text-[#2A170F]">{p.username || '—'}</td>
                <td className="p-3 font-mono text-xs font-medium text-[#AA7137]">{p.trxId}</td>
                <td className="p-3 font-medium">{p.amount || 100} ৳</td>
                <td className="p-3 text-[#897365] text-xs">{p.deviceName || '—'}</td>
                <td className="p-3 text-[#897365] text-xs whitespace-nowrap">{timeAgo(p.date)}</td>
                <td className="p-3">
                  {p.verified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-3 h-3" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  )}
                </td>
                <td className="p-3 text-right">
                  {!p.verified && (
                    <button onClick={() => verifyPayment(p.trxId, 1)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
                      Verify & Activate
                    </button>
                  )}
                  {p.verified && (
                    <span className="text-xs text-[#897365]">{p.verifiedBy ? `by ${p.verifiedBy}` : ''}</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-[#897365]">No payments found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
