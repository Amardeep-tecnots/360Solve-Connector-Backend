import React from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  lastHeartbeat: Date | null;
}

interface ConnectionStatusProps {
  state: ConnectionState;
}

function ConnectionStatus({ state }: ConnectionStatusProps) {
  if (!state.connected) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-danger-muted border border-danger/30">
        <WifiOff className="w-3.5 h-3.5 text-danger" />
        <span className="text-xs font-medium text-danger">Disconnected</span>
      </div>
    );
  }

  if (!state.authenticated) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning-muted border border-warning/30">
        <Loader2 className="w-3.5 h-3.5 text-warning animate-spin" />
        <span className="text-xs font-medium text-warning">Authenticating...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success-muted border border-success/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
      </span>
      <span className="text-xs font-medium text-success">Connected</span>
    </div>
  );
}

export default ConnectionStatus;
