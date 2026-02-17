import React from 'react';
import { 
  LayoutDashboard, 
  Database, 
  Activity, 
  Settings, 
  Network,
  Server
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: any) => void;
}

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'aggregators', label: 'Connections', icon: Network },
    { id: 'schema', label: 'Schema Browser', icon: Database },
    { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-background-surface border-r border-border-subtle flex flex-col h-full shrink-0 transition-all duration-300">
      <div className="p-6 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-lg shadow-primary/20">
            <Server className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-foreground tracking-tight">Mini Connector</h1>
            <p className="text-[10px] font-medium text-primary uppercase tracking-wider">Enterprise Agent</p>
          </div>
        </div>
      </div>

      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2">
          <span className="text-[10px] font-bold text-foreground-tertiary uppercase tracking-wider">Main Menu</span>
        </div>
        
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-foreground-secondary hover:bg-background-hover hover:text-foreground'
              }`}
            >
              <Icon 
                className={`w-4 h-4 transition-colors duration-200 ${
                  isActive ? 'text-primary' : 'text-foreground-tertiary group-hover:text-foreground'
                }`} 
              />
              {item.label}
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-border-subtle">
        <div className="bg-background-elevated rounded-lg p-3 border border-border-subtle">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-medium text-foreground-secondary">System Online</span>
          </div>
          <div className="text-[10px] text-foreground-tertiary font-mono">v1.0.0-beta</div>
        </div>
      </div>
    </div>
  );
}
