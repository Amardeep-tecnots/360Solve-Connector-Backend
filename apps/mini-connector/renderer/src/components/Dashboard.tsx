import React from 'react';
import { ActivityLog } from './ActivityLog';
import { 
  Wifi, 
  ShieldCheck, 
  Activity, 
  Database,
  ArrowUpRight,
  ArrowDownLeft,
  Server
} from 'lucide-react';

interface DashboardProps {
  connectionState: {
    connected: boolean;
    authenticated: boolean;
    lastHeartbeat: Date | null;
  };
}

export function Dashboard({ connectionState }: DashboardProps) {
  return (
    <div className="h-full flex flex-col gap-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h2>
        <p className="text-sm text-foreground-secondary mt-1">Monitor your connector status and connections at a glance.</p>
      </div>

      <div className="grid grid-cols-12 gap-6 min-h-0 flex-1">
        {/* Main Content */}
        <div className="col-span-8 flex flex-col gap-6">
          {/* Status Overview Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`card relative overflow-hidden group border-l-4 ${connectionState.connected ? 'border-l-success' : 'border-l-danger'}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Wifi className="w-24 h-24" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-2 rounded-lg ${connectionState.connected ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                    <Wifi className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground-secondary uppercase tracking-wider">Tunnel Status</span>
                </div>
                <div className="text-2xl font-bold text-foreground mb-1">
                  {connectionState.connected ? 'Online' : 'Offline'}
                </div>
                <p className="text-xs text-foreground-tertiary">
                  {connectionState.connected 
                    ? 'Secure tunnel established with cloud' 
                    : 'Disconnected from relay server'}
                </p>
              </div>
            </div>

            <div className={`card relative overflow-hidden group border-l-4 ${connectionState.authenticated ? 'border-l-primary' : 'border-l-warning'}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <ShieldCheck className="w-24 h-24" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-2 rounded-lg ${connectionState.authenticated ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground-secondary uppercase tracking-wider">Authentication</span>
                </div>
                <div className="text-2xl font-bold text-foreground mb-1">
                  {connectionState.authenticated ? 'Verified' : 'Pending'}
                </div>
                <p className="text-xs text-foreground-tertiary">
                  {connectionState.authenticated 
                    ? 'Identity confirmed via API Key' 
                    : 'Waiting for credential verification'}
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4 hover:border-primary/50 transition-colors group">
              <div className="flex justify-between items-start mb-2">
                <div className="p-1.5 rounded bg-background-elevated text-foreground-tertiary group-hover:text-primary transition-colors">
                  <Activity className="w-4 h-4" />
                </div>
                {connectionState.lastHeartbeat && (
                  <span className="text-[10px] text-success bg-success/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-success animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <div className="text-xs font-medium text-foreground-secondary uppercase tracking-wider mb-1">Last Heartbeat</div>
              <div className="text-lg font-bold text-foreground font-mono">
                {connectionState.lastHeartbeat
                  ? new Date(connectionState.lastHeartbeat).toLocaleTimeString()
                  : '--:--:--'}
              </div>
            </div>

            <div className="card p-4 hover:border-primary/50 transition-colors group">
              <div className="flex justify-between items-start mb-2">
                <div className="p-1.5 rounded bg-background-elevated text-foreground-tertiary group-hover:text-primary transition-colors">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xs font-medium text-foreground-secondary uppercase tracking-wider mb-1">Data Sent</div>
              <div className="text-lg font-bold text-foreground">1.2 MB</div>
            </div>

            <div className="card p-4 hover:border-primary/50 transition-colors group">
              <div className="flex justify-between items-start mb-2">
                <div className="p-1.5 rounded bg-background-elevated text-foreground-tertiary group-hover:text-primary transition-colors">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xs font-medium text-foreground-secondary uppercase tracking-wider mb-1">Data Received</div>
              <div className="text-lg font-bold text-foreground">845 KB</div>
            </div>
          </div>

          {/* Quick Actions or Recent Connections could go here */}
          <div className="card flex-1 min-h-[200px] flex flex-col justify-center items-center text-center p-8 border-dashed">
            <div className="w-12 h-12 rounded-full bg-background-elevated flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-foreground-tertiary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">Active Connections</h3>
            <p className="text-sm text-foreground-secondary max-w-sm mb-4">
              You have 0 active database connections configured. Add a connection to start syncing data.
            </p>
            <button className="btn btn-primary">
              Add Connection
            </button>
          </div>
        </div>

        {/* Sidebar - Activity Log */}
        <div className="col-span-4 h-full min-h-0">
          <ActivityLog />
        </div>
      </div>
    </div>
  );
}
