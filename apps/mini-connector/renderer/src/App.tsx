import { useState, useEffect } from 'react';
import SetupWizard from './components/SetupWizard';
import ConnectionStatus from './components/ConnectionStatus';
import Navigation from './components/Navigation';
import AggregatorsList from './components/AggregatorsList';
import AddAggregatorModal from './components/AddAggregatorModal';

interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  lastHeartbeat: Date | null;
}

function App() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'aggregators' | 'settings'>('dashboard');
  const [theme, setTheme] = useState<'default' | 'dracula'>(() => {
    const saved = localStorage.getItem('nia_theme');
    return (saved as 'default' | 'dracula') || 'default';
  });
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    authenticated: false,
    lastHeartbeat: null,
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    checkConfiguration();
    document.body.classList.toggle('theme-dracula', theme === 'dracula');

    if (window.electronAPI) {
      window.electronAPI.on('websocket:connected', () => {
        setConnectionState((prev) => ({ ...prev, connected: true }));
      });

      window.electronAPI.on('websocket:disconnected', () => {
        setConnectionState((prev) => ({ ...prev, connected: false, authenticated: false }));
      });

      window.electronAPI.on('websocket:error', (error: string) => {
        console.error('WebSocket error:', error);
      });
    }
  }, [theme]);

  const checkConfiguration = async () => {
    try {
      const aggregators = await window.electronAPI?.aggregators.list();
      setIsConfigured((aggregators && aggregators.length > 0) || !!localStorage.getItem('vansales_api_key'));
    } catch {
      setIsConfigured(!!localStorage.getItem('vansales_api_key'));
    }
  };

  const handleSetupComplete = async (apiKey: string) => {
    localStorage.setItem('vansales_api_key', apiKey);
    setIsConfigured(true);
  };

  const toggleTheme = () => {
    const next = theme === 'default' ? 'dracula' : 'default';
    setTheme(next);
    localStorage.setItem('nia_theme', next);
    document.body.classList.toggle('theme-dracula', next === 'dracula');
  };

  const renderDashboard = () => (
    <div className="dashboard fade-in">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <p>Monitor your connector status and connections at a glance.</p>
      </div>

      {/* HUD Connection Card */}
      <div className="hud-card">
        <div className="hud-card-content">
          <div className={`hud-status-dot ${connectionState.connected ? 'online' : 'offline'}`} />
          <div className="hud-info">
            <h3>{connectionState.connected ? 'Tunnel Active' : 'Tunnel Offline'}</h3>
            <p>
              {connectionState.connected
                ? connectionState.authenticated
                  ? 'Authenticated & syncing with cloud platform'
                  : 'Connected — verifying credentials…'
                : 'Waiting for cloud connection…'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Connection</div>
          <div className="stat-value">
            {connectionState.connected ? 'Online' : 'Offline'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Authentication</div>
          <div className="stat-value">
            {connectionState.authenticated ? 'Verified' : 'Pending'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Heartbeat</div>
          <div className="stat-value mono">
            {connectionState.lastHeartbeat
              ? new Date(connectionState.lastHeartbeat).toLocaleTimeString()
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAggregators = () => (
    <AggregatorsList
      onAddNew={() => setIsAddModalOpen(true)}
      onEdit={() => { }}
    />
  );

  const renderSettings = () => (
    <div className="settings fade-in">
      <h2>Settings</h2>
      <div className="settings-section">
        <h3>API Configuration</h3>
        <p>Your connector is linked to the VanSales cloud platform.</p>
        <button
          onClick={() => {
            if (confirm('This will reset your configuration. Continue?')) {
              (async () => {
                try {
                  await window.electronAPI?.settings.reset();
                } catch (err) {
                  console.error('Failed to reset settings via IPC', err);
                } finally {
                  localStorage.removeItem('vansales_api_key');
                  localStorage.removeItem('nia_theme');
                  window.location.reload();
                }
              })();
            }
          }}
          className="btn btn-danger"
        >
          Reset Configuration
        </button>
      </div>

      <div className="settings-section" style={{ marginTop: 12 }}>
        <h3>Appearance</h3>
        <p>Choose a UI theme for the connector.</p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${theme === 'default' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setTheme('default');
              localStorage.setItem('nia_theme', 'default');
              document.body.classList.remove('theme-dracula');
            }}
          >
            Midnight
          </button>
          <button
            className={`btn ${theme === 'dracula' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setTheme('dracula');
              localStorage.setItem('nia_theme', 'dracula');
              document.body.classList.add('theme-dracula');
            }}
          >
            Dracula
          </button>
        </div>
      </div>
    </div>
  );

  if (!isConfigured) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  return (
    <div className="app">
      {/* Custom Title Bar */}
      <div className="title-bar">
        <div className="title-bar-left">
          <div className="title-bar-logo">
            <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 2v8M3 5l3-3 3 3" />
            </svg>
          </div>
          <span className="title-bar-text">Nia Mini Connector</span>
        </div>
        <div className="title-bar-controls">
          <button
            className="title-bar-btn theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'default' ? 'Dracula' : 'Midnight'} theme`}
          >
            {theme === 'default' ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 8.5a6 6 0 01-7.5-7.5 6 6 0 107.5 7.5z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="3" />
                <line x1="8" y1="1" x2="8" y2="3" />
                <line x1="8" y1="13" x2="8" y2="15" />
                <line x1="1" y1="8" x2="3" y2="8" />
                <line x1="13" y1="8" x2="15" y2="8" />
                <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
                <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
                <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" />
                <line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* App Body */}
      <div className="app-body">
        <Navigation currentView={currentView} onNavigate={setCurrentView} />

        <div className="app-content">
          <header className="app-header">
            <h1>
              {currentView === 'dashboard' && 'Dashboard'}
              {currentView === 'aggregators' && 'Connections'}
              {currentView === 'settings' && 'Settings'}
            </h1>
            <ConnectionStatus state={connectionState} />
          </header>

          <main className="app-main">
            {currentView === 'dashboard' && renderDashboard()}
            {currentView === 'aggregators' && renderAggregators()}
            {currentView === 'settings' && renderSettings()}
          </main>
        </div>
      </div>

      <AddAggregatorModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaved={() => {
          setIsAddModalOpen(false);
          if (currentView === 'aggregators') {
            setCurrentView('dashboard');
            setTimeout(() => setCurrentView('aggregators'), 0);
          }
        }}
      />
    </div>
  );
}

export default App;
