import React, { useState } from 'react';
import { 
  Database, 
  Key, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft, 
  Server,
  ShieldCheck,
  Zap,
  Lock,
  FileCode,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Step {
  id: number;
  title: string;
}

const STEPS: Step[] = [
  { id: 1, title: 'Welcome' },
  { id: 2, title: 'API Key' },
  { id: 3, title: 'Database' },
  { id: 4, title: 'Schema' },
  { id: 5, title: 'Complete' },
];

interface SetupWizardProps {
  onComplete: (apiKey: string) => void;
}

function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [dbConfig, setDbConfig] = useState({
    type: 'postgresql' as 'postgresql' | 'mysql' | 'mssql' | 'sqlite',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schema, setSchema] = useState<any>(null);

  const handleNext = async () => {
    setError('');

    if (currentStep === 2) {
      // Validate API key
      setLoading(true);
      try {
        if (!window.electronAPI?.setup) {
          setError('Electron bridge not available (preload not loaded)');
          setLoading(false);
          return;
        }
        
        const validation = await window.electronAPI.setup.validateApiKey(apiKey);
        if (!validation?.valid) {
          setError(validation?.reason || 'Invalid API key format');
          setLoading(false);
          return;
        }

        // Connect to cloud
        const connected = await window.electronAPI.setup.connectToCloud(apiKey);
        if (!connected) {
          setError('Failed to connect to cloud');
          setLoading(false);
          return;
        }

        setCurrentStep(3);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
      } finally {
        setLoading(false);
      }
    } else if (currentStep === 3) {
      // Test database connection
      setLoading(true);
      try {
        const result = await window.electronAPI?.setup.testDatabase(dbConfig);
        if (!result?.success) {
          setError(result?.error || 'Database connection failed');
          setLoading(false);
          return;
        }

        // Discover schema
        const schemaData = await window.electronAPI?.setup.discoverSchema(dbConfig);
        setSchema(schemaData);
        setCurrentStep(4);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Schema discovery failed');
      } finally {
        setLoading(false);
      }
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // Call setup:complete to save aggregator #1
      await window.electronAPI?.setup.complete({
        apiKey,
        dbConfig,
        schema,
      });

      onComplete(apiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete setup');
    } finally {
      setLoading(false);
    }
  };

  const handleTypeSelect = (type: string) => {
    let defaultPort = 5432;
    if (type === 'mysql') defaultPort = 3306;
    if (type === 'mssql') defaultPort = 1433;
    if (type === 'sqlite') defaultPort = 0;

    setDbConfig(prev => ({
      ...prev,
      type: type as any,
      port: defaultPort
    }));
  };

  const DB_TYPES = [
    { id: 'postgresql', name: 'PostgreSQL', icon: <Database className="w-6 h-6 text-[#336791]" />, bg: 'bg-[#336791]/10' },
    { id: 'mysql', name: 'MySQL', icon: <Database className="w-6 h-6 text-[#00758F]" />, bg: 'bg-[#00758F]/10' },
    { id: 'mssql', name: 'SQL Server', icon: <Server className="w-6 h-6 text-[#CC2927]" />, bg: 'bg-[#CC2927]/10' },
    { id: 'sqlite', name: 'SQLite', icon: <FileCode className="w-6 h-6 text-[#003B57]" />, bg: 'bg-[#003B57]/10' },
  ];

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="animate-fade-in max-w-2xl mx-auto text-center">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-purple-600 mx-auto mb-8 flex items-center justify-center shadow-2xl shadow-primary/30">
              <Server className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-foreground mb-4 tracking-tight">Nia Mini Connector</h2>
            <p className="text-foreground-secondary mb-12 text-lg max-w-lg mx-auto leading-relaxed">
              The secure bridge between your on-premise data and the cloud. 
              Set up in minutes, sync in real-time.
            </p>
            
            <div className="grid grid-cols-2 gap-6 text-left max-w-xl mx-auto">
              <div className="p-5 rounded-2xl bg-background-elevated border border-border-subtle hover:border-primary/30 transition-colors">
                <Lock className="w-6 h-6 text-primary mb-3" />
                <h3 className="font-semibold text-foreground text-sm">Secure by Default</h3>
                <p className="text-xs text-foreground-secondary mt-1.5 leading-relaxed">
                  Credentials never leave your machine. AES-256 encryption for local storage.
                </p>
              </div>
              <div className="p-5 rounded-2xl bg-background-elevated border border-border-subtle hover:border-primary/30 transition-colors">
                <Zap className="w-6 h-6 text-warning mb-3" />
                <h3 className="font-semibold text-foreground text-sm">Real-time Sync</h3>
                <p className="text-xs text-foreground-secondary mt-1.5 leading-relaxed">
                  Changes propagate instantly via persistent WebSocket tunnels.
                </p>
              </div>
            </div>
            
            <p className="mt-12 text-sm text-foreground-tertiary font-medium">
              Click "Next" to begin configuration
            </p>
          </div>
        );

      case 2:
        return (
          <div className="animate-fade-in max-w-md mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4 flex items-center justify-center">
                <Key className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Authentication</h2>
              <p className="text-foreground-secondary mt-2">
                Enter your unique API key to link this connector.
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">API Key</label>
                <div className="relative">
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="vmc_..."
                      className="input font-mono text-sm pl-10"
                      autoFocus
                    />
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary" />
                </div>
                <p className="text-xs text-foreground-tertiary mt-2">
                  Found in your Cloud Console under <span className="text-foreground font-medium">Settings &gt; Connectors</span>.
                </p>
              </div>
            </div>
          </div>
        );

      case 3:
        const isSqlite = dbConfig.type === 'sqlite';
        return (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">Database Configuration</h2>
              <p className="text-foreground-secondary mt-2">Select and configure your primary database connection.</p>
            </div>

            <div className="space-y-8">
              {/* Type Selection */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {DB_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleTypeSelect(type.id)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${
                      dbConfig.type === type.id 
                        ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                        : 'border-border-subtle hover:border-primary/50 hover:bg-background-hover'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full ${type.bg} flex items-center justify-center`}>
                      {type.icon}
                    </div>
                    <span className={`text-sm font-medium ${dbConfig.type === type.id ? 'text-primary' : 'text-foreground'}`}>
                      {type.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Form */}
              <div className="bg-background-surface border border-border-subtle rounded-xl p-6 space-y-4">
                 {!isSqlite && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Host</label>
                        <input
                          type="text"
                          value={dbConfig.host}
                          onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                          placeholder="localhost"
                          className="input"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Port</label>
                          <input
                            type="number"
                            value={dbConfig.port}
                            onChange={(e) =>
                              setDbConfig({ ...dbConfig, port: parseInt(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Database Name</label>
                          <input
                            type="text"
                            value={dbConfig.database}
                            onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                            placeholder="my_database"
                            className="input"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Username</label>
                          <input
                            type="text"
                            value={dbConfig.username}
                            onChange={(e) => setDbConfig({ ...dbConfig, username: e.target.value })}
                            placeholder="db_user"
                            className="input"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Password</label>
                          <input
                            type="password"
                            value={dbConfig.password}
                            onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                            placeholder="••••••••"
                            className="input"
                          />
                        </div>
                      </div>
                    </>
                 )}

                 {isSqlite && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Database File Path</label>
                      <input
                        type="text"
                        value={dbConfig.database}
                        onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                        placeholder="C:\data\mydb.sqlite"
                        className="input"
                      />
                    </div>
                 )}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-success/10 mx-auto mb-4 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Discovery Successful</h2>
              <p className="text-foreground-secondary mt-2">
                We found <span className="font-bold text-foreground">{schema?.tables?.length || 0} tables</span> in your database.
              </p>
            </div>

            <div className="bg-background-surface border border-border-subtle rounded-xl overflow-hidden shadow-sm">
              <div className="bg-background-elevated px-4 py-3 border-b border-border-subtle flex justify-between items-center">
                <h3 className="text-sm font-semibold text-foreground">Schema Overview</h3>
                <span className="text-xs text-foreground-tertiary font-mono">public</span>
              </div>
              <div className="p-4 max-h-80 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 custom-scrollbar">
                {schema && schema.tables ? (
                  schema.tables.map((table: any) => (
                    <div key={table.name} className="p-3 bg-background border border-border-subtle rounded-lg flex items-center gap-3 hover:border-primary/30 transition-colors">
                      <div className="w-8 h-8 rounded bg-primary/5 flex items-center justify-center shrink-0">
                          <Database className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-medium text-foreground truncate">{table.name}</h4>
                        <p className="text-xs text-foreground-tertiary flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success/50" />
                            {table.columns.length} columns
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-foreground-tertiary col-span-full text-center py-8">No tables found</p>
                )}
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="animate-fade-in max-w-lg mx-auto text-center">
             <div className="w-24 h-24 rounded-full bg-success/10 mx-auto mb-8 flex items-center justify-center shadow-lg shadow-success/20 animate-pulse-slow">
              <CheckCircle className="w-12 h-12 text-success" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-4">You're All Set!</h2>
            <p className="text-foreground-secondary mb-10 text-lg">
              The Mini Connector is configured and ready to sync.
            </p>
            
            <div className="bg-background-elevated border border-border-subtle rounded-xl p-6 text-left mb-8">
              <h3 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-warning" /> Next Steps
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-background-surface border border-border-subtle flex items-center justify-center shrink-0 text-xs font-bold text-foreground-secondary">1</div>
                    <p className="text-sm text-foreground-secondary">Your connector will automatically establish a secure tunnel to the cloud.</p>
                </div>
                <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-background-surface border border-border-subtle flex items-center justify-center shrink-0 text-xs font-bold text-foreground-secondary">2</div>
                    <p className="text-sm text-foreground-secondary">Go to the Schema Browser to verify your tables and preview data.</p>
                </div>
                <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-background-surface border border-border-subtle flex items-center justify-center shrink-0 text-xs font-bold text-foreground-secondary">3</div>
                    <p className="text-sm text-foreground-secondary">Use the Cloud Console to build workflows using your local data.</p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return true;
      case 2: return apiKey.length > 0;
      case 3: return (dbConfig.type === 'sqlite' && dbConfig.database) || (dbConfig.host && dbConfig.database && dbConfig.username && dbConfig.password);
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col font-sans">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border-subtle bg-background-surface/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
             <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-primary" />
                 Setup Wizard
             </h1>
             <span className="text-xs text-foreground-tertiary font-mono">v2.0.0</span>
          </div>
          
          <div className="flex items-center justify-between relative">
            {/* Connector Line */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-border-subtle -z-10" />
            
            {STEPS.map((step) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              
              return (
                <div key={step.id} className="flex flex-col items-center gap-2 bg-background-surface px-2">
                  <div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      isActive 
                        ? 'bg-primary text-white ring-4 ring-primary/20 scale-110 shadow-lg shadow-primary/30' 
                        : isCompleted 
                          ? 'bg-success text-white' 
                          : 'bg-background-elevated text-foreground-tertiary border border-border-subtle'
                    }`}
                  >
                    {isCompleted ? <CheckCircle className="w-4 h-4" /> : step.id}
                  </div>
                  <span className={`text-xs font-medium transition-colors hidden sm:block ${
                    isActive ? 'text-primary' : isCompleted ? 'text-success' : 'text-foreground-tertiary'
                  }`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {renderStep()}
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-danger-muted border border-danger/30 text-danger px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-in z-50">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Footer */}
      <div className="px-8 py-4 border-t border-border-subtle bg-background-surface">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div>
                {currentStep > 1 && currentStep < 5 && (
                    <button
                    onClick={() => {
                        setCurrentStep(currentStep - 1);
                        setError('');
                    }}
                    className="btn btn-secondary text-foreground-secondary hover:text-foreground"
                    >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                    </button>
                )}
            </div>
            
          {currentStep < 5 ? (
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="btn btn-primary px-8"
            >
              {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
              ) : (
                  <>
                    {currentStep === 4 ? 'Finish Setup' : 'Continue'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
              )}
            </button>
          ) : (
            <button onClick={handleComplete} disabled={loading} className="btn btn-primary w-full sm:w-auto px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
              {loading ? (
                   <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving Configuration...
                  </>
              ) : 'Start Using Connector'}
              {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SetupWizard;
