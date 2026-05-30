import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Save, RefreshCw, AlertTriangle, Smartphone, Bell, Shield, Database, Eye, EyeOff, Wifi, Users, Zap, Sparkles } from 'lucide-react';
import type { AppConfig } from '../types';

export default function AppControl() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = () => {
    setLoading(true);
    fetch(`${window.location.origin}/api/app-config`)
      .then(r => r.json())
      .then(data => { setConfig(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const update = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${window.location.origin}/api/app-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Loading...</div>;
  }

  if (!config) {
    return <div className="flex items-center justify-center h-64 text-[#897365]">Failed to load config.</div>;
  }

  const Toggle = ({ value, onChange }) => (
    <button onClick={() => onChange(!value)}
      className={`w-10 h-6 rounded-full transition-all duration-200 ${value ? 'bg-green-500' : 'bg-[#E8DDD0]'} relative`}>
      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all duration-200 shadow-sm ${value ? 'left-5' : 'left-1'}`} />
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2A170F]">App Control</h1>
          <p className="text-sm text-[#897365] mt-0.5">Manage app behavior, versioning, and feature flags</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadConfig} className="btn-ghost inline-flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary inline-flex items-center gap-1.5">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E8DDD0]">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-[#2A170F]">Kill Switch & Maintenance</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#2A170F]">App Alive</p>
              <p className="text-xs text-[#897365]">Kill switch — disables the app completely</p>
            </div>
            <Toggle value={config.isAppAlive} onChange={v => update('isAppAlive', v)} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#2A170F]">Under Maintenance</p>
              <p className="text-xs text-[#897365]">Show maintenance screen to all users</p>
            </div>
            <Toggle value={config.underMaintenance} onChange={v => update('underMaintenance', v)} />
          </div>

          {config.underMaintenance && (
            <div className="bg-red-50 rounded-lg p-3 space-y-2 border border-red-200">
              <p className="text-xs font-medium text-red-700">Maintenance Mode Preview</p>
              <input type="text" placeholder="Title" value={config.maintenanceTitle || ''}
                onChange={e => update('maintenanceTitle', e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-red-200 bg-white text-xs text-[#2A170F] outline-none focus:border-red-400" />
              <textarea placeholder="Message" value={config.maintenanceMessage || ''}
                onChange={e => update('maintenanceMessage', e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-red-200 bg-white text-xs text-[#2A170F] outline-none focus:border-red-400 resize-none h-16" />
              <input type="text" placeholder="Estimated time (e.g., 2 hours)" value={config.maintenanceEstimatedTime || ''}
                onChange={e => update('maintenanceEstimatedTime', e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-red-200 bg-white text-xs text-[#2A170F] outline-none focus:border-red-400" />
            </div>
          )}
        </div>

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E8DDD0]">
            <Smartphone className="w-4 h-4 text-[#AA7137]" />
            <h2 className="text-sm font-bold text-[#2A170F]">Version Control</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#897365] font-medium">Current Version</label>
              <input type="text" value={config.currentVersion || ''}
                onChange={e => update('currentVersion', e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
            </div>
            <div>
              <label className="text-xs text-[#897365] font-medium">Min Required Version</label>
              <input type="text" value={config.minRequiredVersion || ''}
                onChange={e => update('minRequiredVersion', e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
            </div>
          </div>

          <div>
            <label className="text-xs text-[#897365] font-medium">Update URL (APK)</label>
            <input type="text" value={config.updateUrl || ''}
              onChange={e => update('updateUrl', e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
          </div>

          <div>
            <label className="text-xs text-[#897365] font-medium">Update Message</label>
            <textarea value={config.updateMessage || ''}
              onChange={e => update('updateMessage', e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A] resize-none h-16" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 bg-[#F5F0EB] rounded-lg">
              <div>
                <p className="text-xs font-medium text-[#2A170F]">Force Update</p>
                <p className="text-[10px] text-[#897365]">Block old versions</p>
              </div>
              <Toggle value={config.forceUpdate} onChange={v => update('forceUpdate', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-[#F5F0EB] rounded-lg">
              <div>
                <p className="text-xs font-medium text-[#2A170F]">Soft Update</p>
                <p className="text-[10px] text-[#897365]">Suggest update</p>
              </div>
              <Toggle value={config.softUpdate} onChange={v => update('softUpdate', v)} />
            </div>
          </div>
        </div>

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E8DDD0]">
            <Zap className="w-4 h-4 text-purple-500" />
            <h2 className="text-sm font-bold text-[#2A170F]">Feature Flags</h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {[
              { key: 'enableNotifications', label: 'Push Notifications', desc: 'Send push notifications to users', icon: Bell },
              { key: 'enableLeaderboard', label: 'Leaderboard', desc: 'Enable competitive leaderboard', icon: Users },
              { key: 'enableBackup', label: 'Cloud Backup', desc: 'Enable automatic cloud backup', icon: Database },
              { key: 'adsEnabled', label: 'Ads', desc: 'Show ads in the app', icon: Eye },
            ].map(({ key, label, desc, icon: Icon }) => (
              <div key={key} className="flex items-center justify-between p-3 bg-[#F5F0EB] rounded-lg">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-[#897365]" />
                  <div>
                    <p className="text-sm font-medium text-[#2A170F]">{label}</p>
                    <p className="text-xs text-[#897365]">{desc}</p>
                  </div>
                </div>
                <Toggle value={config[key]} onChange={v => update(key, v)} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E8DDD0]">
            <Shield className="w-4 h-4 text-green-500" />
            <h2 className="text-sm font-bold text-[#2A170F]">Limits</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#897365] font-medium">Daily Quiz Limit</label>
              <input type="number" value={config.dailyQuizLimit ?? 3}
                onChange={e => update('dailyQuizLimit', parseInt(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
            </div>
            <div>
              <label className="text-xs text-[#897365] font-medium">Daily Word Limit</label>
              <input type="number" value={config.dailyWordLimit ?? 20}
                onChange={e => update('dailyWordLimit', parseInt(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-green-700">Config Status</p>
                <p className="text-[10px] text-green-600 mt-0.5">
                  {config.forceUpdate ? `Force updating to v${config.currentVersion}. ` : ''}
                  {config.underMaintenance ? 'Maintenance mode is ON. ' : 'App is live. '}
                  {config.isAppAlive ? 'Kill switch is OFF.' : 'KILL SWITCH IS ON!'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E8DDD0]">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-[#2A170F]">AI Enrichment</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#2A170F]">AI Enrichment</p>
              <p className="text-xs text-[#897365]">Generate synonyms, antonyms & sentences via AI</p>
            </div>
            <Toggle value={config.aiEnabled !== false} onChange={v => update('aiEnabled', v)} />
          </div>

          <div>
            <label className="text-xs text-[#897365] font-medium">AI Provider</label>
            <select value={config.aiProvider || 'groq'}
              onChange={e => update('aiProvider', e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]">
              <option value="groq">Groq only</option>
              <option value="gemini">Gemini only</option>
              <option value="groq_first">Groq → Gemini (fallback)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#897365] font-medium">Groq Model</label>
              <input type="text" value={config.aiModel || 'llama-3.3-70b-versatile'}
                onChange={e => update('aiModel', e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
            </div>
            <div>
              <label className="text-xs text-[#897365] font-medium">Gemini Model</label>
              <input type="text" value={config.aiGeminiModel || 'gemini-2.0-flash'}
                onChange={e => update('aiGeminiModel', e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-[#E8DDD0] bg-white text-sm text-[#2A170F] outline-none focus:border-[#D48A4A]" />
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-indigo-700">AI Service Status</p>
                <p className="text-[10px] text-indigo-600 mt-0.5">
                  API keys are set via Render environment variables (GROQ_API_KEY, GROQ_API_KEY_2, GEMINI_API_KEY).
                  Provider and model can be changed here. Save after editing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
