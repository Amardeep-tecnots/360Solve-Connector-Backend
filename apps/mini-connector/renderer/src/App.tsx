import { useState, useEffect } from 'react';
import SetupWizard from './components/SetupWizard';
import ConnectionStatus from './components/ConnectionStatus';
import { Sidebar } from './components/Sidebar';
import AggregatorsList from './components/AggregatorsList';
import AddAggregatorModal from './components/AddAggregatorModal';
import { Dashboard } from './components/Dashboard';
import { SchemaBrowser } from './components/SchemaBrowser';
import { Diagnostics } from './components/Diagnostics';
import { Settings } from './components/Settings';
import { ThemeProvider } from './context/ThemeContext';
import { Bell, Search, User } from 'lucide-react';

interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  lastHeartbeat: Date | null;
}

function AppContent() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    authenticated: false,
    lastHeartbeat: null,
  });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    checkConfiguration();

    if (window.electronAPI) {
      // Get initial state
      window.electronAPI.status.getConnectionState().then((state) => {
        setConnectionState(state);
      });

      window.electronAPI.on('websocket:connected', () => {
        setConnectionState((prev) => ({ ...prev, connected: true, authenticated: true }));
      });

      window.electronAPI.on('websocket:disconnected', () => {
        setConnectionState((prev) => ({ ...prev, connected: false, authenticated: false }));
      });

      window.electronAPI.on('websocket:error', (error: string) => {
        console.error('WebSocket error:', error);
      });

      window.electronAPI.on('heartbeat:sent', (date: Date) => {
        setConnectionState((prev) => ({ ...prev, lastHeartbeat: date }));
      });
    }
  }, []);

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

  if (!isConfigured) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard connectionState={connectionState} />;
      case 'aggregators':
        return (
          <div className="h-full flex flex-col animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Connections</h2>
                <p className="text-sm text-foreground-secondary">Manage your database connections.</p>
              </div>
            </div>
            <AggregatorsList
              onAddNew={() => setIsAddModalOpen(true)}
              onEdit={() => { }}
            />
          </div>
        );
      case 'schema':
        return <SchemaBrowser />;
      case 'diagnostics':
        return <Diagnostics />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard connectionState={connectionState} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar currentView={currentView} onNavigate={setCurrentView} />

      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <header className="h-16 px-8 border-b border-border-subtle flex items-center justify-between bg-background/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full pl-9 pr-4 py-1.5 bg-background-elevated border border-border-subtle rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-foreground-tertiary transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ConnectionStatus state={connectionState} />
            <div className="h-6 w-px bg-border-subtle mx-2" />
            <button className="relative p-2 rounded-full hover:bg-background-elevated transition-colors text-foreground-secondary hover:text-foreground">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-danger border-2 border-background" />
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-primary/20">
              AD
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {renderContent()}
        </main>
      </div>

      <AddAggregatorModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaved={() => {
          setIsAddModalOpen(false);
          if (currentView === 'aggregators') {
            // Force refresh hack or just let it re-render if it fetches on mount
            const prev = currentView;
            setCurrentView('dashboard');
            setTimeout(() => setCurrentView(prev), 0);
          }
        }}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
