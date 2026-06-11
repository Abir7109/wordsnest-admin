import { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../api';

interface LoginPageProps {
  onLogin: (token: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${window.location.origin}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Login failed');
        return;
      }
      // Ensure token is defined
      if (!data.token) { setError('No token received'); return; }
      onLogin(data.token);
    } catch (e) {
      setError('Connection error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[#D48A4A] to-[#8B5E2E] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#2A170F]">Words Nest</h1>
          <p className="text-[#897365] text-sm mt-1">Admin Panel</p>
        </div>

        <div className="bg-[#FFFBF5] rounded-2xl border border-[#E8DDD0] p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-[#2A170F] mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+880000000000"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E8DDD0] bg-white text-[#2A170F] placeholder-[#B8A99A] outline-none focus:border-[#D48A4A] focus:ring-2 focus:ring-[#D48A4A]/20 transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#2A170F] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-4 py-2.5 pr-10 rounded-xl border border-[#E8DDD0] bg-white text-[#2A170F] placeholder-[#B8A99A] outline-none focus:border-[#D48A4A] focus:ring-2 focus:ring-[#D48A4A]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8A99A] hover:text-[#897365]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-sm text-center"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-[#D48A4A] to-[#AA7137] text-white font-semibold rounded-xl hover:from-[#C07A3A] hover:to-[#9A6130] disabled:opacity-50 transition-all duration-200 shadow-md hover:shadow-lg"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#B8A99A] mt-6">Words Nest Admin v1.4.3</p>
      </motion.div>
    </div>
  );
}
