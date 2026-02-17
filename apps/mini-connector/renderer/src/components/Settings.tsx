import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { 
  Moon, 
  Sun, 
  Monitor, 
  Trash2, 
  Shield, 
  Key, 
  RefreshCw,
  LogOut
} from 'lucide-react';

export function Settings() {
  const { theme, setTheme, availableThemes } = useTheme();

  const handleReset = async () => {
    if (confirm('This will reset your configuration. Continue?')) {
      try {
        await window.electronAPI?.settings.reset();
      } catch (err) {
        console.error('Failed to reset settings via IPC', err);
      } finally {
        localStorage.removeItem('vansales_api_key');
        localStorage.removeItem('nia_theme');
        window.location.reload();
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-foreground-secondary mt-1">Manage application preferences and configurations.</p>
      </div>

      <div className="space-y-6">
        {/* Appearance Section */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
              <p className="text-sm text-foreground-secondary">Customize the interface theme.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {availableThemes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`group relative p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center gap-3 ${
                  theme === t.id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border-subtle hover:border-border hover:bg-background-elevated'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  theme === t.id ? 'bg-primary text-white' : 'bg-background-elevated text-foreground-secondary group-hover:bg-background-hover'
                }`}>
                  {t.id === 'midnight' && <Moon className="w-5 h-5" />}
                  {t.id === 'dracula' && <span className="text-lg">🧛</span>}
                  {t.id === 'light' && <Sun className="w-5 h-5" />}
                </div>
                <span className={`font-medium ${theme === t.id ? 'text-primary' : 'text-foreground'}`}>
                  {t.name}
                </span>
                {theme === t.id && (
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* API Configuration Section */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Key className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">API Configuration</h3>
              <p className="text-sm text-foreground-secondary">Manage your connection to the cloud platform.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-background-elevated border border-border-subtle">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-success" />
                <div>
                  <div className="font-medium text-foreground">Connection Status</div>
                  <div className="text-xs text-success font-medium">Active & Secure</div>
                </div>
              </div>
              <button className="btn btn-secondary text-xs">
                <RefreshCw className="w-3 h-3 mr-2" />
                Test Connection
              </button>
            </div>

            <div className="flex justify-end pt-4 border-t border-border-subtle">
              <button
                onClick={handleReset}
                className="btn btn-danger"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Reset Configuration
              </button>
            </div>
          </div>
        </div>

        {/* Application Info */}
        <div className="card">
           <div className="flex items-center gap-3 mb-4">
             <div className="w-8 h-8 rounded-lg bg-background-elevated flex items-center justify-center">
               <span className="font-bold text-foreground-tertiary">i</span>
             </div>
             <h3 className="text-md font-semibold text-foreground">About</h3>
           </div>
           
           <div className="grid grid-cols-2 gap-4 text-sm">
             <div>
               <span className="block text-foreground-tertiary text-xs uppercase tracking-wider mb-1">Version</span>
               <span className="font-mono text-foreground">1.0.0</span>
             </div>
             <div>
               <span className="block text-foreground-tertiary text-xs uppercase tracking-wider mb-1">Build</span>
               <span className="font-mono text-foreground">2026.02.16</span>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
