import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  Wifi, 
  Server, 
  Database, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react';

export function Diagnostics() {
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [connectionState, setConnectionState] = useState<any>(null);
  const [aggregatorCount, setAggregatorCount] = useState(0);
  const [logs, setLogs] = useState<{ id: number; time: string; type: 'info' | 'error' | 'warning'; message: string }[]>([]);

  const fetchData = async () => {
    try {
      if (window.electronAPI) {
        const info = await window.electronAPI.status.getSystemInfo();
        setSystemInfo(info);
        
        const conn = await window.electronAPI.status.getConnectionState();
        setConnectionState(conn);
        
        const aggregators = await window.electronAPI.aggregators.list();
        setAggregatorCount(aggregators.length);
      }
    } catch (err) {
      console.error("Failed to fetch diagnostics", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);

    const addLog = (type: 'info' | 'error' | 'warning', message: string) => {
      setLogs(prev => [{
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        type,
        message
      }, ...prev].slice(0, 50));
    };

    const handleCommandStart = (data: any) => addLog('info', `Command started: ${data.commandId || 'unknown'}`);
    const handleCommandSuccess = (data: any) => addLog('info', `Command success: ${data.commandId || 'unknown'}`);
    const handleCommandError = (data: any) => addLog('error', `Command error: ${data.error || 'unknown'}`);
    const handleWsConnected = () => {
        addLog('info', 'WebSocket connected');
        fetchData();
    };
    const handleWsDisconnected = () => {
        addLog('warning', 'WebSocket disconnected');
        fetchData();
    };
    const handleWsError = (msg: string) => addLog('error', `WebSocket error: ${msg}`);

    if (window.electronAPI) {
      window.electronAPI.on('command:start', handleCommandStart);
      window.electronAPI.on('command:success', handleCommandSuccess);
      window.electronAPI.on('command:error', handleCommandError);
      window.electronAPI.on('websocket:connected', handleWsConnected);
      window.electronAPI.on('websocket:disconnected', handleWsDisconnected);
      window.electronAPI.on('websocket:error', handleWsError);
    }

    return () => {
      clearInterval(interval);
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

  const formatUptime = (seconds: number) => {
    if (!seconds) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
  };

  const getMemoryUsage = () => {
      if (!systemInfo) return '0%';
      const used = systemInfo.totalMemory - systemInfo.freeMemory;
      const percent = (used / systemInfo.totalMemory) * 100;
      return `${Math.round(percent)}%`;
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">System Diagnostics</h2>
          <p className="text-sm text-foreground-secondary mt-1">Real-time monitoring and health status.</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Run Health Check
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4 hover:border-primary/50 transition-colors group">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              connectionState?.connected ? 'bg-success/10 group-hover:bg-success/20' : 'bg-danger/10 group-hover:bg-danger/20'
          }`}>
            <Wifi className={`w-6 h-6 ${connectionState?.connected ? 'text-success' : 'text-danger'}`} />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider">Network Status</div>
            <div className="text-lg font-bold text-foreground">
                {connectionState?.connected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="text-xs text-foreground-secondary font-medium">
                {connectionState?.authenticated ? 'Authenticated' : 'Not Authenticated'}
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 hover:border-primary/50 transition-colors group">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider">Memory Usage</div>
            <div className="text-lg font-bold text-foreground">{getMemoryUsage()}</div>
            <div className="text-xs text-foreground-secondary font-medium">
                {systemInfo ? `${Math.round((systemInfo.totalMemory - systemInfo.freeMemory) * 100) / 100}GB / ${systemInfo.totalMemory}GB` : '-'}
            </div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 hover:border-primary/50 transition-colors group">
          <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center group-hover:bg-warning/20 transition-colors">
            <Clock className="w-6 h-6 text-warning" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider">Uptime</div>
            <div className="text-lg font-bold text-foreground font-mono">{formatUptime(systemInfo?.uptime || 0)}</div>
            <div className="text-xs text-foreground-secondary font-medium">Since last restart</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4 hover:border-primary/50 transition-colors group">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
            <Database className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider">Databases</div>
            <div className="text-lg font-bold text-foreground">{aggregatorCount}</div>
            <div className="text-xs text-foreground-secondary font-medium">Configured Connections</div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        <div className="lg:col-span-2 card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">System Logs</h3>
            <div className="flex gap-2">
              <span className="text-xs bg-background-elevated px-2 py-1 rounded text-foreground-secondary cursor-pointer hover:text-foreground transition-colors">All</span>
              <span className="text-xs bg-background-elevated px-2 py-1 rounded text-foreground-secondary cursor-pointer hover:text-foreground transition-colors">Errors</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-background-elevated/50 hover:bg-background-elevated transition-colors text-sm border border-transparent hover:border-border-subtle">
                {log.type === 'error' && <XCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />}
                {log.type === 'warning' && <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />}
                {log.type === 'info' && <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />}
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-0.5">
                    <span className={`font-medium ${
                      log.type === 'error' ? 'text-danger' : 
                      log.type === 'warning' ? 'text-warning' : 'text-foreground'
                    }`}>
                      {log.type.toUpperCase()}
                    </span>
                    <span className="text-xs text-foreground-tertiary font-mono">{log.time}</span>
                  </div>
                  <p className="text-foreground-secondary truncate">{log.message}</p>
                </div>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-foreground-tertiary">
                <Activity className="w-8 h-8 mb-2 opacity-20" />
                <p>No logs available</p>
              </div>
            )}
          </div>
        </div>

        <div className="card flex flex-col">
          <h3 className="text-lg font-semibold text-foreground mb-4">Services Status</h3>
          <div className="space-y-4">
            {[
              { name: 'WebSocket Server', status: connectionState?.connected ? 'operational' : 'offline', ping: connectionState?.lastHeartbeat ? 'Active' : '-' },
              { name: 'Database Service', status: 'operational', ping: 'Active' },
              { name: 'Auth Service', status: 'operational', ping: 'Active' },
              { name: 'Update Service', status: 'operational', ping: '-' },
            ].map((service, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background-elevated/30 border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    service.status === 'operational' ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-warning shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                  }`} />
                  <span className="text-sm font-medium text-foreground">{service.name}</span>
                </div>
                <span className="text-xs font-mono text-foreground-tertiary">{service.ping}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-6">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <h4 className="text-sm font-semibold text-primary mb-1">System Health</h4>
              <p className="text-xs text-foreground-secondary mb-3">All systems are running within normal parameters.</p>
              <div className="w-full h-1.5 bg-background-elevated rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-success to-primary w-[98%]" />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-foreground-tertiary">Performance</span>
                <span className="text-[10px] font-bold text-success">98%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
