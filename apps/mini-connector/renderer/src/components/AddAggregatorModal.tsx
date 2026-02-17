import { useState } from 'react';
import { 
  X, 
  CheckCircle, 
  AlertCircle, 
  Database, 
  Server, 
  FileCode,
  Box,
  ChevronRight
} from 'lucide-react';

interface AddAggregatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function AddAggregatorModal({ isOpen, onClose, onSaved }: AddAggregatorModalProps) {
  const [step, setStep] = useState(1); // 1: Select Type, 2: Details
  const [formData, setFormData] = useState({
    name: '',
    type: 'postgresql' as 'postgresql' | 'mysql' | 'mssql' | 'sqlite',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
  };

  const handleTypeSelect = (type: string) => {
    let defaultPort = 5432;
    if (type === 'mysql') defaultPort = 3306;
    if (type === 'mssql') defaultPort = 1433;
    if (type === 'sqlite') defaultPort = 0;

    setFormData((prev) => ({
      ...prev,
      type: type as any,
      port: defaultPort,
    }));
    setTestResult(null);
    setStep(2);
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    try {
      const result = await window.electronAPI?.setup.testDatabase({
        type: formData.type,
        host: formData.host,
        port: formData.port,
        database: formData.database,
        username: formData.username,
        password: formData.password,
      });
      setTestResult(result || { success: false, error: 'No result' });
    } catch (err) {
      setTestResult({ success: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    if (!testResult?.success) {
      setError('Please test the connection before saving');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await window.electronAPI?.aggregators.add({
        name: formData.name || `${formData.type} - ${formData.host}`,
        type: formData.type,
        host: formData.host,
        port: formData.port,
        database: formData.database,
        username: formData.username,
        password: formData.password,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const isSqlite = formData.type === 'sqlite';

  const DB_TYPES = [
    { id: 'postgresql', name: 'PostgreSQL', icon: <Database className="w-6 h-6 text-[#336791]" />, bg: 'bg-[#336791]/10' },
    { id: 'mysql', name: 'MySQL / MariaDB', icon: <Database className="w-6 h-6 text-[#00758F]" />, bg: 'bg-[#00758F]/10' },
    { id: 'mssql', name: 'SQL Server', icon: <Server className="w-6 h-6 text-[#CC2927]" />, bg: 'bg-[#CC2927]/10' },
    { id: 'sqlite', name: 'SQLite', icon: <FileCode className="w-6 h-6 text-[#003B57]" />, bg: 'bg-[#003B57]/10' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-background-surface border border-border-default rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-background-elevated/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {step === 1 ? 'Select Database Type' : 'Connection Details'}
              </h2>
              <p className="text-xs text-foreground-secondary">
                {step === 1 ? 'Choose the database you want to connect to' : `Configure ${formData.type} connection`}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-md text-foreground-tertiary hover:bg-background-hover hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {step === 1 ? (
            <div className="grid grid-cols-2 gap-4">
              {DB_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleTypeSelect(type.id)}
                  className="flex flex-col items-center gap-3 p-6 rounded-xl border border-border-subtle hover:border-primary/50 hover:bg-background-hover transition-all group text-center"
                >
                  <div className={`w-12 h-12 rounded-full ${type.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    {type.icon}
                  </div>
                  <span className="font-medium text-foreground">{type.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
               {error && (
                <div className="bg-danger-muted border border-danger/30 text-danger text-sm px-4 py-3 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Connection Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Production DB"
                  className="input"
                  autoFocus
                />
              </div>

              {!isSqlite && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Host</label>
                    <input
                      type="text"
                      value={formData.host}
                      onChange={(e) => handleChange('host', e.target.value)}
                      placeholder="localhost"
                      className="input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Port</label>
                      <input
                        type="number"
                        value={formData.port}
                        onChange={(e) => handleChange('port', parseInt(e.target.value))}
                        className="input"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Database Name</label>
                      <input
                        type="text"
                        value={formData.database}
                        onChange={(e) => handleChange('database', e.target.value)}
                        placeholder="database"
                        className="input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Username</label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => handleChange('username', e.target.value)}
                        placeholder="user"
                        className="input"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wider text-foreground-tertiary">Password</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleChange('password', e.target.value)}
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
                    value={formData.database}
                    onChange={(e) => handleChange('database', e.target.value)}
                    placeholder="C:\data\db.sqlite"
                    className="input"
                  />
                </div>
              )}

              {testResult && (
                <div className={`text-sm px-4 py-3 rounded-lg flex items-center gap-2 border ${
                  testResult.success 
                    ? 'bg-success-muted border-success/30 text-success' 
                    : 'bg-danger-muted border-danger/30 text-danger'
                }`}>
                  {testResult.success ? (
                    <>
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      Connection successful!
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Connection failed: {testResult.error}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle bg-background-surface flex justify-between items-center">
          {step === 2 ? (
            <button 
              onClick={() => {
                setStep(1);
                setTestResult(null);
                setError('');
              }}
              className="text-sm text-foreground-secondary hover:text-foreground underline decoration-dotted"
            >
              Change Type
            </button>
          ) : <div />}

          <div className="flex gap-3">
            <button 
              onClick={onClose} 
              className="btn btn-secondary"
            >
              Cancel
            </button>
            
            {step === 2 && (
              <>
                <button
                  onClick={handleTest}
                  disabled={testing || loading || (!isSqlite && (!formData.host || !formData.database))}
                  className="btn btn-secondary"
                >
                  {testing ? 'Testing…' : 'Test Connection'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !testResult?.success}
                  className="btn btn-primary"
                >
                  {loading ? 'Saving…' : 'Save Connection'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddAggregatorModal;
