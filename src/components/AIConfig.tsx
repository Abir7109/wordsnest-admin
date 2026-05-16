import { Terminal, Save, RotateCcw, FlaskConical, Send, Copy, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import React, { useState } from "react";
import { cn } from "@/src/lib/utils";
import { RequestLog } from "../types";

interface AIConfigProps {
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
  onAddRequest: (log: Omit<RequestLog, 'id' | 'timestamp'>) => void;
}

export default function AIConfig({ onNotify, onAddRequest }: AIConfigProps) {
  const [prompt, setPrompt] = useState(`You are a high-level linguistic analysis AI supporting the 'Words Nest' administrative backend. Your primary function is to receive single words or short phrases and return deeply structured, highly accurate lexicographical data.

Strictly adhere to the following output structure and constraints:

1. ETYMOLOGY: Provide a concise history tracing back to the earliest known origin (e.g., PIE root, Latin, Greek). Focus on semantic shifts.
2. SENSES: Array of distinct meanings, ordered by commonality.
   - For each sense, provide: definition, part of speech, register (academic, colloquial, archaic), and a high-quality example sentence demonstrating usage in a sophisticated context.
3. RELATIONS: Array of synonyms and antonyms, ensuring precise nuance matching.
4. TONE/NUANCE: A single brief sentence explaining the connotation (e.g., "Carries a slightly pejorative undertone in modern usage").

CRITICAL: Return the response EXCLUSIVELY as a valid JSON object matching the requested schema. Do not include markdown formatting or conversational preamble.`);

  const [testQuery, setTestQuery] = useState("ephemeral");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testStats, setTestStats] = useState<{ status: string; time: string } | null>(null);

  const handleTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testQuery.trim()) return;

    setIsTesting(true);
    setTestResult(null);
    setTestStats(null);
    const start = Date.now();

    try {
      const response = await fetch("/api/dictionary/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: testQuery }),
      });

      const data = await response.json();
      const end = Date.now();

      if (!response.ok) throw new Error(data.error || "Model request rejected.");
      
      setTestResult(JSON.stringify(data, null, 2));
      setTestStats({ status: "200 OK", time: `${end - start}ms` });
      onAddRequest({
        word: testQuery,
        userId: 'ADMIN-CONSOLE',
        guestId: '-',
        time: `${end - start}ms`,
        status: 'Success'
      });
      onNotify("Playground trace completed successfully.", "success");
    } catch (err) {
      const end = Date.now();
      onNotify("Engine trace failed. Check system logs.", "error");
      setTestResult(JSON.stringify({ error: err instanceof Error ? err.message : "Archive link failed." }, null, 2));
      setTestStats({ status: "500 Err", time: "N/A" });
      onAddRequest({
        word: testQuery,
        userId: 'ADMIN-CONSOLE',
        guestId: '-',
        time: `${end - start}ms`,
        status: 'Error'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onNotify("System instructions updated in archival memory.", "success");
  };

  return (
    <div className="space-y-gutter relative">
      <div className="flex justify-between items-end mb-xl pb-md border-b border-outline-variant/50">
        <div>
          <h2 className="font-display text-4xl font-bold text-on-surface mb-sm tracking-tight text-primary">AI Configuration</h2>
          <p className="text-on-surface-variant font-medium">Manage systemic instructions and validate model responses for the dictionary engine.</p>
        </div>
        <div className="flex items-center gap-sm px-md py-sm bg-secondary-container/10 border border-secondary/30 rounded-full shadow-sm">
          <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(170,208,173,0.5)] animate-pulse"></div>
          <span className="text-[11px] font-bold text-secondary uppercase tracking-[0.2em]">Gemini: Operational</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
        <div className="lg:col-span-7 bg-surface-container rounded-2xl border border-outline-variant flex flex-col shadow-2xl overflow-hidden backdrop-blur-sm">
          <div className="px-lg py-md border-b border-outline-variant flex justify-between items-center bg-surface-container-high/50">
            <div className="flex items-center gap-sm text-primary">
              <Terminal size={20} />
              <h3 className="text-lg font-bold text-on-surface">System Instructions</h3>
            </div>
            <span className="text-[11px] font-bold text-on-surface-variant bg-surface-container-highest px-sm py-[2px] rounded border border-outline-variant/30">v2.4.1</span>
          </div>
          
          <div className="p-lg flex-1 flex flex-col gap-md">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em] ml-1">Core Engine Directives</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-[520px] bg-surface-dim border border-outline-variant rounded-xl p-lg font-mono text-[13px] leading-relaxed text-on-surface-variant focus:border-primary focus:ring-1 focus:ring-primary/40 outline-none transition-all resize-none shadow-inner"
              spellCheck="false"
            />
          </div>

          <div className="px-lg py-md bg-surface-container-high/30 border-t border-outline-variant flex justify-end gap-md">
            <button className="px-lg py-sm text-sm font-bold text-on-surface border border-outline-variant rounded-xl hover:bg-surface-container-highest transition-all active:scale-95">
              Revert
            </button>
            <button 
              onClick={handleSave}
              className="px-lg py-sm text-sm font-bold bg-primary text-on-primary rounded-xl hover:bg-primary-fixed transition-all shadow-lg shadow-primary/10 flex items-center gap-sm active:scale-95"
            >
              <Save size={18} />
              Save Config
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-gutter">
          <div className="bg-surface-container rounded-2xl border border-outline-variant shadow-2xl overflow-hidden">
            <div className="px-md py-md border-b border-outline-variant flex items-center gap-sm bg-surface-container-high/50">
              <FlaskConical size={20} className="text-primary" />
              <h3 className="text-md font-bold text-on-surface">Playground Console</h3>
            </div>
            <div className="p-xl space-y-md">
              <form onSubmit={handleTest} className="space-y-sm">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em] ml-1">Test Trace Query</label>
                <div className="flex gap-sm">
                  <input 
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    className="flex-1 bg-surface-dim border border-outline-variant rounded-xl px-md py-sm text-sm text-on-surface focus:border-primary outline-none focus:ring-0 transition-all font-medium" 
                    placeholder="e.g. ephemeral"
                    autoComplete="off"
                  />
                  <button 
                    type="submit"
                    disabled={isTesting}
                    className="bg-primary text-on-primary p-sm rounded-xl hover:bg-primary-fixed transition-all active:scale-95 shadow-lg shadow-primary/10 disabled:grayscale"
                  >
                    {isTesting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="bg-surface-container rounded-2xl border border-outline-variant flex-1 flex flex-col shadow-2xl overflow-hidden min-h-[460px]">
            <div className="px-md py-sm border-b border-outline-variant flex justify-between items-center bg-surface-container-high/50">
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">Raw JSON Output</span>
              {testStats && (
                <div className={cn("flex items-center gap-sm font-bold text-[11px]", testStats.status.includes('200') ? "text-secondary" : "text-error")}>
                  {testStats.status.includes('200') ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>{testStats.status} ({testStats.time})</span>
                </div>
              )}
            </div>
            <div className="p-xl bg-surface-dim flex-1 relative group overflow-hidden">
              <button 
                onClick={() => testResult && navigator.clipboard.writeText(testResult)}
                className="absolute top-4 right-4 bg-surface-container border border-outline-variant text-on-surface-variant p-sm rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:text-primary hover:border-primary shadow-lg z-10" 
                title="Copy JSON"
              >
                <Copy size={16} />
              </button>
              <div className="h-[460px] overflow-auto p-xl text-[12px] font-mono leading-relaxed text-tertiary-fixed custom-scrollbar bg-surface-dim/50">
                {testResult ? (
                  <pre><code className="block">{testResult}</code></pre>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 italic font-display">
                    <Terminal size={32} className="mb-md" />
                    <p>Awaiting engine trace output...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
