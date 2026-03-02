import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Clock, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
  timestamp: Date;
}

export function ActivityLog() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    const addActivity = (type: ActivityItem['type'], message: string, details?: string) => {
      setActivities(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        type,
        message,
        details,
        timestamp: new Date()
      }, ...prev].slice(0, 50));
    };

    // Listeners
    const handleCommandStart = (data: any) => 
      addActivity('info', `Executing: ${data.commandId || 'unknown'}`, data.query?.sql);
    
    const handleCommandSuccess = (data: any) => 
      addActivity('success', `Completed: ${data.commandId || 'unknown'}`, `${data.rowCount || 0} rows`);
      
    const handleCommandError = (data: any) => 
      addActivity('error', `Failed: ${data.commandId || 'unknown'}`, data.error);

    const handleWsConnected = () => addActivity('info', 'System connected to cloud');
    const handleWsDisconnected = () => addActivity('warning', 'System disconnected from cloud');
    const handleWsError = (msg: string) => addActivity('error', 'Connection error', msg);

    window.electronAPI.on('command:start', handleCommandStart);
    window.electronAPI.on('command:success', handleCommandSuccess);
    window.electronAPI.on('command:error', handleCommandError);
    window.electronAPI.on('websocket:connected', handleWsConnected);
    window.electronAPI.on('websocket:disconnected', handleWsDisconnected);
    window.electronAPI.on('websocket:error', handleWsError);
    
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeListener('command:start', handleCommandStart);
        window.electronAPI.removeListener('command:success', handleCommandSuccess);
        window.electronAPI.removeListener('command:error', handleCommandError);
        window.electronAPI.removeListener('websocket:connected', handleWsConnected);
        window.electronAPI.removeListener('websocket:disconnected', handleWsDisconnected);
        window.electronAPI.removeListener('websocket:error', handleWsError);
      }
    };
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-3 h-3 text-success" />;
      case 'error': return <AlertTriangle className="w-3 h-3 text-danger" />;
      case 'warning': return <AlertTriangle className="w-3 h-3 text-warning" />;
      default: return <Info className="w-3 h-3 text-primary" />;
    }
  };

  return (
    <div className="card h-full flex flex-col overflow-hidden bg-background-surface border-border-subtle p-0">
      <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-background-elevated/30">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-foreground-secondary" />
          <h3 className="font-semibold text-sm text-foreground">Live Activity</h3>
        </div>
        <span className="bg-background-elevated text-foreground-secondary text-xs px-2 py-0.5 rounded-full border border-border-subtle font-mono">
          {activities.length}
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-0 custom-scrollbar" ref={scrollRef}>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-foreground-tertiary p-8 text-center">
            <Clock className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {activities.map((item) => (
              <div key={item.id} className="p-3 hover:bg-background-hover/50 transition-colors group">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    {getIcon(item.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium text-foreground truncate">{item.message}</p>
                      <span className="text-[10px] text-foreground-tertiary font-mono shrink-0">
                        {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    {item.details && (
                      <p className="text-[10px] text-foreground-secondary font-mono mt-0.5 truncate opacity-70 group-hover:opacity-100 transition-opacity">
                        {item.details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
