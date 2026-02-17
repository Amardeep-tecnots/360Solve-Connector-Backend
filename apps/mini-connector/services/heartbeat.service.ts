import * as os from 'os';
import axios from 'axios';
import { WebSocketService } from './websocket-client.service';
import { CommandOrchestratorService } from './command-orchestrator.service';

export class HeartbeatService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private commandOrchestratorService: CommandOrchestratorService | null = null;

  constructor(private readonly webSocketService: WebSocketService) {}

  setCommandOrchestrator(service: CommandOrchestratorService) {
    this.commandOrchestratorService = service;
  }

  start() {
    this.stop();

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);

    this.sendHeartbeat();
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async sendHeartbeat() {
    if (!this.webSocketService.isConnected()) {
      return;
    }

    const connectorId = this.webSocketService.getConnectorId();
    if (!connectorId) {
      console.warn('Skipping heartbeat: connectorId unknown');
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      status: this.getStatus(),
      activeCommands: this.commandOrchestratorService?.getActiveCommandCount() || 0,
      cpuUsage: this.getCpuUsage(),
      memoryUsage: this.getMemoryUsagePercent(), // percentage 0-100
      maxConcurrentJobs: 5, // TODO: source from config
      supportedAggregators: ['mysql', 'postgresql', 'mssql'],
      os: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      version: this.getConnectorVersion(),
      ipAddress: await this.getOutboundIp(),
    };

    try {
      this.webSocketService.sendHeartbeat(payload);
      console.log('Heartbeat sent:', payload);
      await this.sendRestHeartbeat(connectorId, payload);
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  private getStatus(): 'online' | 'busy' | 'offline' {
    const cpuUsage = this.getCpuUsage();
    const memoryUsage = this.getMemoryUsagePercent();

    if (cpuUsage > 80 || memoryUsage > 80) {
      return 'busy';
    }
    return 'online';
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / totalTick;
    const usage = Math.round((1 - idle) * 100);

    return usage;
  }

  private getMemoryUsagePercent(): number {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usage = Math.round((usedMemory / totalMemory) * 100);

    return usage;
  }

  private getConnectorVersion(): string {
    return process.env.npm_package_version || 'unknown';
  }

  private async getOutboundIp(): Promise<string | undefined> {
    try {
      const res = await axios.get('https://api.ipify.org?format=json', { timeout: 2000 });
      return res.data?.ip;
    } catch (err) {
      return undefined;
    }
  }

  private async sendRestHeartbeat(connectorId: string, payload: Record<string, any>) {
    try {
      const apiUrl = process.env.API_URL || 'http://localhost:3001';
      await axios.post(`${apiUrl}/api/connectors/${connectorId}/heartbeat`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.webSocketService.getApiKey()
            ? `Bearer ${this.webSocketService.getApiKey()}`
            : undefined,
        },
      });
    } catch (err) {
      console.warn('REST heartbeat failed (will retry next interval):', err instanceof Error ? err.message : err);
    }
  }
}
