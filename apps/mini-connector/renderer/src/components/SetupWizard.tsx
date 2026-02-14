import { useState } from 'react';

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
    type: 'postgresql' as 'postgresql' | 'mysql',
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
          console.log('[RENDERER] electronAPI bridge missing:', window.electronAPI);
          setError('Electron bridge not available (preload not loaded)');
          setLoading(false);
          return;
        }
        console.log('[RENDERER] Calling validateApiKey with:', apiKey.substring(0, 20) + '...');
        const validation = await window.electronAPI.setup.validateApiKey(apiKey);
        console.log('[RENDERER] Received validation:', validation);
        if (!validation?.valid) {
          console.log('[RENDERER] Validation failed, reason:', validation?.reason);
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

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="step-content fade-in">
            <h2>Welcome to Nia Mini Connector</h2>
            <p>
              This connector allows you to securely bridge your on-premise databases to the VanSales cloud platform through encrypted tunnels.
            </p>
            <ul className="feature-list">
              <li>Secure, encrypted credential storage</li>
              <li>Real-time data synchronization</li>
              <li>Support for MySQL, PostgreSQL, SQL Server & SQLite</li>
              <li>Firewall-friendly outbound connections</li>
            </ul>
            <p>
              <strong>Setup takes about 5 minutes.</strong>
            </p>
          </div>
        );

      case 2:
        return (
          <div className="step-content fade-in">
            <h2>Enter Your API Key</h2>
            <p>
              Enter the API key from your VanSales cloud console. You can find it in the
              Connectors section.
            </p>
            <div className="form-group">
              <label>API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="vmc_abc123_x7f9k2p5w8q1_c4e2a"
                className="input-field"
              />
              <small className="hint">
                Format: vmc_&lt;tenant&gt;_&lt;random&gt;_&lt;checksum&gt;
              </small>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="step-content fade-in">
            <h2>Configure Database</h2>
            <p>Enter your database connection details.</p>
            <div className="form-group">
              <label>Database Type</label>
              <select
                value={dbConfig.type}
                onChange={(e) =>
                  setDbConfig({ ...dbConfig, type: e.target.value as 'postgresql' | 'mysql' })
                }
                className="input-field"
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>
            <div className="form-group">
              <label>Host</label>
              <input
                type="text"
                value={dbConfig.host}
                onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                placeholder="localhost"
                className="input-field"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Port</label>
                <input
                  type="number"
                  value={dbConfig.port}
                  onChange={(e) =>
                    setDbConfig({ ...dbConfig, port: parseInt(e.target.value) })
                  }
                  className="input-field"
                />
              </div>
              <div className="form-group">
                <label>Database Name</label>
                <input
                  type="text"
                  value={dbConfig.database}
                  onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                  placeholder="my_database"
                  className="input-field"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={dbConfig.username}
                  onChange={(e) => setDbConfig({ ...dbConfig, username: e.target.value })}
                  placeholder="db_user"
                  className="input-field"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={dbConfig.password}
                  onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                  placeholder="••••••••"
                  className="input-field"
                />
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="step-content fade-in">
            <h2>Schema Discovery</h2>
            <p>We found the following tables in your database:</p>
            {schema && schema.tables ? (
              <div className="schema-list">
                {schema.tables.map((table: any) => (
                  <div key={table.name} className="schema-item">
                    <h3>{table.name}</h3>
                    <p>{table.columns.length} columns</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>No tables found</p>
            )}
          </div>
        );

      case 5:
        return (
          <div className="step-content fade-in">
            <h2>Setup Complete!</h2>
            <p>Your Nia Mini Connector is now configured and ready to use.</p>
            <div className="success-message">
              <h3>What's Next?</h3>
              <ul>
                <li>Your connector will automatically connect to the cloud</li>
                <li>Heartbeat signals will be sent every 30 seconds</li>
                <li>You can create workflows in the VanSales console</li>
                <li>Your credentials are stored securely on this machine</li>
              </ul>
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
      case 3: return dbConfig.host && dbConfig.database && dbConfig.username && dbConfig.password;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  return (
    <div className="setup-wizard">
      <div className="wizard-header">
        <h1>Nia Mini Connector Setup</h1>
        <div className="steps-indicator">
          {STEPS.map((step, index) => (
            <>
              <div
                key={step.id}
                className={`step ${step.id === currentStep ? 'active' : ''} ${step.id < currentStep ? 'completed' : ''
                  }`}
              >
                <div className="step-number">
                  {step.id < currentStep ? '✓' : step.id}
                </div>
                <div className="step-title">{step.title}</div>
              </div>
              {index < STEPS.length - 1 && <div className="step-connector" />}
            </>
          ))}
        </div>
      </div>

      <div className="wizard-content">{renderStep()}</div>

      {error && <div className="error-message" style={{ margin: '0 32px' }}>{error}</div>}

      <div className="wizard-footer">
        {currentStep > 1 && currentStep < 5 && (
          <button
            onClick={() => {
              setCurrentStep(currentStep - 1);
              setError('');
            }}
            className="btn btn-secondary"
          >
            Back
          </button>
        )}
        {currentStep < 5 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="btn btn-primary"
          >
            {loading ? 'Processing…' : currentStep === 4 ? 'Finish' : 'Next'}
          </button>
        ) : (
          <button onClick={handleComplete} disabled={loading} className="btn btn-primary">
            {loading ? 'Saving…' : 'Start Using Connector'}
          </button>
        )}
      </div>
    </div>
  );
}

export default SetupWizard;
