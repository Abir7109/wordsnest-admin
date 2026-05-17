import { Settings, Save, RotateCcw, Smartphone, AlertTriangle, Wrench, Download, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/src/lib/utils";

interface AppControlProps {
  onNotify: (message: string, type: 'info' | 'success' | 'error') => void;
}

interface AppConfig {
  current_version: string;
  min_required_version: string;
  force_update: boolean;
  soft_update: boolean;
  update_url: string;
  update_message: string;
  under_maintenance: boolean;
  maintenance_title: string;
  maintenance_message: string;
  maintenance_estimated_time: string;
  is_app_alive: boolean;
}

const defaultConfig: AppConfig = {
  current_version: "1.0.0",
  min_required_version: "1.0.0",
  force_update: false,
  soft_update: false,
  update_url: "",
  update_message: "A new version is available!",
  under_maintenance: false,
  maintenance_title: "Under Maintenance",
  maintenance_message: "We'll be back soon!",
  maintenance_estimated_time: "",
  is_app_alive: true
};

export default function AppControl({ onNotify }: AppControlProps) {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load config from Firestore
    const loadConfig = async () => {
      try {
        // TODO: Replace with actual Firestore listener
        // For now, using placeholder - will connect to Firestore when SDK is added
        const response = await fetch('/api/app-config');
        if (response.ok) {
          const data = await response.json();
          if (data.config) {
            setConfig(data.config);
          }
        }
      } catch (err) {
        console.log('Using default config');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/app-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });

      if (response.ok) {
        onNotify('App configuration saved. Changes apply immediately.', 'success');
      } else {
        onNotify('Failed to save configuration.', 'error');
      }
    } catch (err) {
      onNotify('Error saving configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetConfig = () => {
    setConfig(defaultConfig);
    onNotify('Configuration reset to defaults.', 'info');
  };

  const toggleMaintenance = () => {
    const newConfig = { ...config, under_maintenance: !config.under_maintenance };
    setConfig(newConfig);
    saveConfigDirect(newConfig);
  };

  const toggleForceUpdate = () => {
    const newConfig = { ...config, force_update: !config.force_update };
    setConfig(newConfig);
    saveConfigDirect(newConfig);
  };

  const toggleSoftUpdate = () => {
    const newConfig = { ...config, soft_update: !config.soft_update };
    setConfig(newConfig);
    saveConfigDirect(newConfig);
  };

  const toggleAppAlive = () => {
    const newConfig = { ...config, is_app_alive: !config.is_app_alive };
    setConfig(newConfig);
    saveConfigDirect(newConfig);
  };

  const saveConfigDirect = async (configToSave: AppConfig) => {
    try {
      await fetch('/api/app-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configToSave })
      });
    } catch (err) {
      console.log('Auto-save failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-md">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Smartphone className="text-primary" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">App Control Center</h2>
            <p className="text-sm text-on-surface-variant">Manage app behavior in real-time</p>
          </div>
        </div>
        <div className="flex gap-sm">
          <button
            onClick={resetConfig}
            className="flex items-center gap-sm px-md py-sm rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-sm px-md py-sm rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-on-primary border-t-transparent" />
            ) : (
              <Save size={16} />
            )}
            Save Changes
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div className={cn(
        "p-md rounded-xl border flex items-center gap-md",
        config.is_app_alive 
          ? "bg-secondary/10 border-secondary/30" 
          : "bg-error/10 border-error/30"
      )}>
        {config.is_app_alive ? (
          <>
            <div className="w-3 h-3 rounded-full bg-secondary animate-pulse" />
            <span className="text-secondary font-medium">App is live and operational</span>
          </>
        ) : (
          <>
            <AlertTriangle className="text-error" size={20} />
            <span className="text-error font-medium">App is currently disabled - users will see unavailable message</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
        {/* App Status Controls */}
        <div className="bg-surface-container rounded-xl p-lg space-y-md">
          <h3 className="text-lg font-semibold text-on-surface flex items-center gap-sm">
            <Settings size={20} />
            App Status
          </h3>

          {/* Kill Switch */}
          <div className="flex items-center justify-between p-md bg-surface-container-low rounded-lg">
            <div>
              <p className="font-medium text-on-surface">App Alive</p>
              <p className="text-sm text-on-surface-variant">Kill switch - disables app completely</p>
            </div>
            <button
              onClick={toggleAppAlive}
              className={cn(
                "w-14 h-8 rounded-full transition-colors relative",
                config.is_app_alive ? "bg-secondary" : "bg-error"
              )}
            >
              <div className={cn(
                "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                config.is_app_alive ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>

          {/* Maintenance Mode */}
          <div className="flex items-center justify-between p-md bg-surface-container-low rounded-lg">
            <div>
              <p className="font-medium text-on-surface flex items-center gap-sm">
                <Wrench size={16} />
                Maintenance Mode
              </p>
              <p className="text-sm text-on-surface-variant">Show maintenance overlay to all users</p>
            </div>
            <button
              onClick={toggleMaintenance}
              className={cn(
                "w-14 h-8 rounded-full transition-colors relative",
                config.under_maintenance ? "bg-warning" : "bg-outline"
              )}
            >
              <div className={cn(
                "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                config.under_maintenance ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>

          {/* Maintenance Settings */}
          {config.under_maintenance && (
            <div className="space-y-sm p-md bg-warning/10 rounded-lg border border-warning/30">
              <div>
                <label className="text-sm font-medium text-on-surface">Title</label>
                <input
                  type="text"
                  value={config.maintenance_title}
                  onChange={e => setConfig(prev => ({ ...prev, maintenance_title: e.target.value }))}
                  onBlur={() => saveConfigDirect(config)}
                  className="w-full mt-1 px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface">Message</label>
                <input
                  type="text"
                  value={config.maintenance_message}
                  onChange={e => setConfig(prev => ({ ...prev, maintenance_message: e.target.value }))}
                  onBlur={() => saveConfigDirect(config)}
                  className="w-full mt-1 px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface">Estimated Time (optional)</label>
                <input
                  type="text"
                  value={config.maintenance_estimated_time}
                  onChange={e => setConfig(prev => ({ ...prev, maintenance_estimated_time: e.target.value }))}
                  onBlur={() => saveConfigDirect(config)}
                  placeholder="e.g., 2 hours"
                  className="w-full mt-1 px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface"
                />
              </div>
            </div>
          )}
        </div>

        {/* Update Controls */}
        <div className="bg-surface-container rounded-xl p-lg space-y-md">
          <h3 className="text-lg font-semibold text-on-surface flex items-center gap-sm">
            <Download size={20} />
            Update Management
          </h3>

          {/* Force Update */}
          <div className="flex items-center justify-between p-md bg-surface-container-low rounded-lg">
            <div>
              <p className="font-medium text-on-surface flex items-center gap-sm">
                <AlertTriangle size={16} />
                Force Update
              </p>
              <p className="text-sm text-on-surface-variant">Users must update to continue using</p>
            </div>
            <button
              onClick={toggleForceUpdate}
              className={cn(
                "w-14 h-8 rounded-full transition-colors relative",
                config.force_update ? "bg-error" : "bg-outline"
              )}
            >
              <div className={cn(
                "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                config.force_update ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>

          {/* Soft Update */}
          <div className="flex items-center justify-between p-md bg-surface-container-low rounded-lg">
            <div>
              <p className="font-medium text-on-surface flex items-center gap-sm">
                <RefreshCw size={16} />
                Soft Update
              </p>
              <p className="text-sm text-on-surface-variant">Optional update - users can skip</p>
            </div>
            <button
              onClick={toggleSoftUpdate}
              className={cn(
                "w-14 h-8 rounded-full transition-colors relative",
                config.soft_update ? "bg-primary" : "bg-outline"
              )}
            >
              <div className={cn(
                "absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform",
                config.soft_update ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>

          {/* Version & URL Settings */}
          <div className="space-y-sm">
            <div className="grid grid-cols-2 gap-sm">
              <div>
                <label className="text-sm font-medium text-on-surface">Current Version</label>
                <input
                  type="text"
                  value={config.current_version}
                  onChange={e => setConfig(prev => ({ ...prev, current_version: e.target.value }))}
                  onBlur={() => saveConfigDirect(config)}
                  className="w-full mt-1 px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface">Min Required</label>
                <input
                  type="text"
                  value={config.min_required_version}
                  onChange={e => setConfig(prev => ({ ...prev, min_required_version: e.target.value }))}
                  onBlur={() => saveConfigDirect(config)}
                  className="w-full mt-1 px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface">Update URL (Play Store)</label>
              <input
                type="text"
                value={config.update_url}
                onChange={e => setConfig(prev => ({ ...prev, update_url: e.target.value }))}
                onBlur={() => saveConfigDirect(config)}
                placeholder="https://play.google.com/store/apps/..."
                className="w-full mt-1 px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface">Update Message</label>
              <input
                type="text"
                value={config.update_message}
                onChange={e => setConfig(prev => ({ ...prev, update_message: e.target.value }))}
                onBlur={() => saveConfigDirect(config)}
                className="w-full mt-1 px-md py-sm bg-surface border border-outline-variant rounded-lg text-on-surface"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}