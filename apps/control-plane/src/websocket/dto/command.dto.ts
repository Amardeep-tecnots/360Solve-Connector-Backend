export class CommandDto {
  commandId: string;
  command: string;
  payload: any;
  tenantId: string;
}

export class ResponseDto {
  commandId: string;
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
  };
}

export class HeartbeatDto {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
}

export class ConnectionInfoDto {
  socketId: string;
  tenantId: string;
  ip: string;
  userAgent: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

export class ConnectorStatsDto {
  online: number;
  offline: number;
  lastHeartbeat: Date | null;
}
