interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  lastHeartbeat: Date | null;
}

interface ConnectionStatusProps {
  state: ConnectionState;
}

function ConnectionStatus({ state }: ConnectionStatusProps) {
  const getStatusClass = () => {
    if (!state.connected) return 'disconnected';
    if (!state.authenticated) return 'authenticating';
    return 'connected';
  };

  const getStatusText = () => {
    if (!state.connected) return 'Disconnected';
    if (!state.authenticated) return 'Authenticating…';
    return 'Connected';
  };

  const getSubLabel = () => {
    if (!state.connected) return 'No tunnel';
    if (!state.authenticated) return 'Verifying credentials';
    return 'Secure tunnel active';
  };

  return (
    <div className="connection-status">
      <div className={`status-indicator ${getStatusClass()}`} />
      <div className="status-text-group">
        <span className="status-label">{getStatusText()}</span>
        <span className="status-sublabel">{getSubLabel()}</span>
      </div>
    </div>
  );
}

export default ConnectionStatus;
