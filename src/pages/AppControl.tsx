import { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Power, Wrench, RefreshCw, AlertTriangle, Save } from 'lucide-react';
import type { AppConfig } from '../types';

const defaultConfig: AppConfig = {
  isAppAlive: true,
  underMaintenance: false,
  maintenanceTitle: '',
  maintenanceMessage: '',
  maintenanceEstimatedTime: '',
  forceUpdate: false,
  softUpdate: false,
  currentVersion: '',
  minRequiredVersion: '',
  updateUrl: '',
  updateMessage: '',
};

interface Toast {
  type: 'success' | 'error';
  message: string;
}

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border border-[#E8DDD0] transition-colors duration-200 cursor-pointer ${active ? 'bg-[#AA7137] border-[#AA7137]' : 'bg-[#F5F0EB]'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${active ? 'translate-x-5' : 'translate-x-1'}`}
      />
    </div>
  );
}

export default function AppControl() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    fetch(`${window.location.origin}/api/app-config`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.data) setConfig(data.data);
        else if (data?.isAppAlive !== undefined) setConfig(data);
      })
      .catch(() => showToast({ type: 'error', message: 'Failed to load config' }))
      .finally(() => setLoading(false));
  }, [showToast]);

  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${window.location.origin}/api/app-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast({ type: 'success', message: 'Configuration saved successfully' });
    } catch {
      showToast({ type: 'error', message: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[#D48A4A] border-t-transparent rounded-full" />
      </div>
    );
  }

  const toggles = [
    {
      key: 'isAppAlive' as const,
      icon: Power,
      label: 'Kill Switch',
      desc: 'When disabled, the app will be completely shut down and users will see a shutdown message.',
      value: config.isAppAlive,
    },
    {
      key: 'underMaintenance' as const,
      icon: Wrench,
      label: 'Maintenance Mode',
      desc: 'When enabled, users will see a maintenance screen with a custom title and message.',
      value: config.underMaintenance,
    },
    {
      key: 'forceUpdate' as const,
      icon: RefreshCw,
      label: 'Force Update',
      desc: 'When enabled, users with an older version than the minimum required will be forced to update before using the app.',
      value: config.forceUpdate,
    },
    {
      key: 'softUpdate' as const,
      icon: AlertTriangle,
      label: 'Soft Update',
      desc: 'When enabled, users will see a prompt suggesting they update, but they can still use the app.',
      value: config.softUpdate,
    },
  ];

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.35 },
    }),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Power className="w-6 h-6 text-[#AA7137]" />
          <h1 className="text-2xl font-bold text-[#2A170F]">App Control</h1>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
          }`}
        >
          {toast.message}
        </motion.div>
      )}

      <div className="space-y-4">
        {toggles.map((t, i) => (
          <motion.div
            key={t.key}
            custom={i}
            variants={cardVariants}
            initial="hidden"
            animate="show"
            className="bg-[#FFFBF5] rounded-xl border border-[#E8DDD0] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <t.icon className="w-5 h-5 text-[#897365] mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-[#2A170F]">{t.label}</h3>
                  <p className="text-xs text-[#897365] mt-1">{t.desc}</p>
                </div>
              </div>
              <Toggle active={t.value} onChange={() => update(t.key, !t.value)} />
            </div>

            {t.key === 'underMaintenance' && config.underMaintenance && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-4 pt-4 border-t border-[#E8DDD0] grid grid-cols-1 md:grid-cols-3 gap-3 overflow-hidden"
              >
                <div>
                  <label className="block text-xs font-medium text-[#897365] mb-1.5">Maintenance Title</label>
                  <input className="input-field" value={config.maintenanceTitle} onChange={(e) => update('maintenanceTitle', e.target.value)} placeholder="e.g. Scheduled Maintenance" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#897365] mb-1.5">Maintenance Message</label>
                  <input className="input-field" value={config.maintenanceMessage} onChange={(e) => update('maintenanceMessage', e.target.value)} placeholder="e.g. We'll be back soon!" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#897365] mb-1.5">Estimated Time</label>
                  <input className="input-field" value={config.maintenanceEstimatedTime} onChange={(e) => update('maintenanceEstimatedTime', e.target.value)} placeholder="e.g. 2 hours" />
                </div>
              </motion.div>
            )}

            {t.key === 'forceUpdate' && config.forceUpdate && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-4 pt-4 border-t border-[#E8DDD0] grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden"
              >
                <div>
                  <label className="block text-xs font-medium text-[#897365] mb-1.5">Current Version</label>
                  <input className="input-field" value={config.currentVersion} onChange={(e) => update('currentVersion', e.target.value)} placeholder="e.g. 2.1.0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#897365] mb-1.5">Min Required Version</label>
                  <input className="input-field" value={config.minRequiredVersion} onChange={(e) => update('minRequiredVersion', e.target.value)} placeholder="e.g. 2.0.0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#897365] mb-1.5">Update URL</label>
                  <input className="input-field" value={config.updateUrl} onChange={(e) => update('updateUrl', e.target.value)} placeholder="e.g. https://play.google.com/..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#897365] mb-1.5">Update Message</label>
                  <input className="input-field" value={config.updateMessage} onChange={(e) => update('updateMessage', e.target.value)} placeholder="e.g. Please update to continue" />
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
