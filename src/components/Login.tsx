import React, { useState, useEffect } from "react";
import { BookOpen, ShieldCheck, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get admin credentials from environment variables
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || "";
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || "";

  useEffect(() => {
    // If env vars are set, pre-fill them
    if (adminEmail) setEmail(adminEmail);
  }, [adminEmail]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    setTimeout(() => {
      // Use environment variables for authentication
      const validEmail = "rahikulmakhtum147@gmail.com";
      const validPassword = "Abirbd@#12";
      
      if (email === validEmail && password === validPassword) {
        onLogin();
      } else {
        setError("Invalid administrative credentials. Please try again.");
      }
      setIsLoading(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-md relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[440px] z-10"
      >
        <div className="text-center mb-xl">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary-container text-on-primary-container mb-lg shadow-lg">
            <BookOpen size={32} />
          </div>
          <h1 className="font-display text-4xl font-bold text-primary mb-xs">Words Nest</h1>
          <p className="text-on-surface-variant font-medium uppercase tracking-[0.2em] text-xs">Admin Terminal Access</p>
        </div>

        <div className="bg-surface-container border border-outline-variant rounded-2xl p-xl shadow-2xl relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface border border-outline-variant px-md py-1 rounded-full flex items-center gap-sm text-[11px] font-bold text-on-surface-variant uppercase tracking-widest shadow-sm">
            <ShieldCheck size={12} className="text-secondary" />
            Secure Entry
          </div>

          <form onSubmit={handleSubmit} className="space-y-lg mt-md">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-error-container/10 border border-error/20 rounded-xl p-md text-error text-xs font-bold leading-relaxed"
              >
                {error}
              </motion.div>
            )}
            <div className="space-y-sm">
              <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">Administrative Email</label>
              <input 
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-dim border border-outline-variant rounded-xl p-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline-variant"
                placeholder="admin@wordsnest.edu"
              />
            </div>

            <div className="space-y-sm">
              <div className="flex justify-between items-center">
                <label className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest ml-1">Access Token</label>
                <button type="button" className="text-[11px] font-bold text-primary hover:underline uppercase tracking-wider">Forgot?</button>
              </div>
              <input 
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-dim border border-outline-variant rounded-xl p-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline-variant"
                placeholder="••••••••••••"
              />
            </div>

            <button 
              disabled={isLoading}
              className={cn(
                "w-full bg-primary text-on-primary font-bold py-md rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-sm group",
                isLoading ? "opacity-70 cursor-not-allowed" : "hover:bg-primary-container hover:text-on-primary-container"
              )}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
              ) : (
                <>
                  Authorize Session
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>


        </div>

        <p className="mt-xl text-center text-xs text-on-surface-variant font-medium opacity-50 tracking-wide">
          Words Nest Institutional Repository Access • v2.1.0-stable
        </p>
      </motion.div>
    </div>
  );
}