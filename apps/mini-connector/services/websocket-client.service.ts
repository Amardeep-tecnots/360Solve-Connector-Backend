import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { ApiKeyAuthService } from './api-key-auth.service';
import axios from 'axios';

interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  lastHeartbeat: Date | null;
  reconnectAttempts: number;
  error?: string;
  connectorId?: string;
  tenantId?: string;
}

export class WebSocketService extends EventEmitter {
  private socket: Socket | null = null;
  private apiKey: string | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private state: ConnectionState = {
    connected: false,
    authenticated: false,
    lastHeartbeat: null,
    reconnectAttempts: 0,
  };

  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly RECONNECT_DELAY_BASE = 1000; // 1 second base, exponential backoff

  constructor(private readonly apiKeyAuthService: ApiKeyAuthService) {
    super();
  }

  async connect(apiKey: string): Promise<boolean> {
    this.apiKey = apiKey;

    try {
      // Validate API key format
      if (!this.apiKeyAuthService.validateApiKey(apiKey)) {
        throw new Error('Invalid API key format');
      }

      // Validate API key with backend before connecting
      const validation = await this.validateApiKeyWithBackend(apiKey);
      if (!validation.valid) {
        throw new Error('Invalid API key - not recognized by server');
      }

      this.state.connectorId = validation.connectorId;
      this.state.tenantId = validation.tenantId;

      // Resolve websocket URL (default to connectors namespace on port 3001)
      const wsUrl = process.env.WEBSOCKET_URL || 'ws://localhost:3001/connectors';
      console.log('[WS] Using websocket URL:', wsUrl);

      // Connect to cloud console
      this.socket = io(wsUrl, {
        auth: { apiKey },
        transports: ['websocket'],
        reconnection: false, // We handle reconnection manually
      });

      this.setupEventListeners();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        this.socket?.once('connect', () => {
          clearTimeout(timeout);
          this.state.connected = true;
          this.state.reconnectAttempts = 0;
          this.emit('connected');
          resolve(true);
        });

        this.socket?.once('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.error = errorMessage;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Validate API key with backend server
   */
  private async validateApiKeyWithBackend(apiKey: string): Promise<{ valid: boolean; tenantId?: string; connectorId?: string }> {
    try {
      const apiUrl = process.env.API_URL || 'http://localhost:3001';
      const response = await axios.post(`${apiUrl}/api/public/connectors/validate-api-key`, { apiKey });
      return response.data.data;
    } catch (error) {
      console.error('API key validation failed:', error);
      return { valid: false };
    }
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.state.connected = true;
      this.state.authenticated = false;
    });

    this.socket.on('authenticated', (data) => {
      console.log('Authenticated successfully');
      this.state.authenticated = true;
      this.emit('authenticated', data);
    });

    this.socket.on('authentication_failed', (error) => {
      console.error('Authentication failed:', error);
      this.state.authenticated = false;
      this.state.error = error.message;
      this.emit('authentication_failed', error);
      this.disconnect();
    });

    this.socket.on('command', (command) => {
      console.log('Command received:', command);
      this.emit('command', command);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.state.connected = false;
      this.state.authenticated = false;
      this.emit('disconnected', reason);

      // Attempt reconnection
      if (reason !== 'io client disconnect') {
        this.attemptReconnect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.state.error = error.message;
      this.emit('error', error);
    });

    this.socket.on('heartbeat_ack', () => {
      this.state.lastHeartbeat = new Date();
      console.log('Heartbeat acknowledged');
    });
  }

  sendHeartbeat(payload: Record<string, any>) {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    this.socket.emit('heartbeat', payload);
    this.emit('heartbeat_sent');
  }

  private attemptReconnect() {
    if (this.state.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnect_failed', 'Max attempts reached');
      return;
    }

    this.state.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY_BASE * Math.pow(2, this.state.reconnectAttempts - 1);

    console.log(`Attempting reconnection ${this.state.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.apiKey) {
        this.connect(this.apiKey).catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.state = {
      connected: false,
      authenticated: false,
      lastHeartbeat: null,
      reconnectAttempts: 0,
      connectorId: undefined,
      tenantId: undefined,
    };

    this.emit('disconnected', 'manual_disconnect');
  }

  sendCommandResponse(commandId: string, response: any) {
    if (!this.socket || !this.socket.connected) {
      throw new Error('Not connected to cloud');
    }

    this.socket.emit('command_response', {
      commandId,
      response,
      timestamp: new Date().toISOString(),
    });
  }

  getConnectionState(): ConnectionState {
    return { ...this.state };
  }

  isConnected(): boolean {
    return this.state.connected && this.state.authenticated;
  }

  getConnectorId(): string | undefined {
    return this.state.connectorId;
  }

  getTenantId(): string | undefined {
    return this.state.tenantId;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }
}
