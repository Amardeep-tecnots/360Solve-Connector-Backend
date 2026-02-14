import { useState } from 'react';

interface AddAggregatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function AddAggregatorModal({ isOpen, onClose, onSaved }: AddAggregatorModalProps) {
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

  const handleTypeChange = (type: string) => {
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

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Add Database Connection</h2>
          <button onClick={onClose} className="btn-close" aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>Connection Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Production MySQL"
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label>Database Type</label>
            <select
              value={formData.type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="input-field"
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL / MariaDB</option>
              <option value="mssql">SQL Server</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>

          {!isSqlite && (
            <>
              <div className="form-group">
                <label>Host</label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => handleChange('host', e.target.value)}
                  placeholder="localhost or IP address"
                  className="input-field"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => handleChange('port', parseInt(e.target.value))}
                    className="input-field"
                  />
                </div>

                <div className="form-group">
                  <label>Database Name</label>
                  <input
                    type="text"
                    value={formData.database}
                    onChange={(e) => handleChange('database', e.target.value)}
                    placeholder="database name"
                    className="input-field"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleChange('username', e.target.value)}
                    placeholder="username"
                    className="input-field"
                  />
                </div>

                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    placeholder="password"
                    className="input-field"
                  />
                </div>
              </div>
            </>
          )}

          {isSqlite && (
            <div className="form-group">
              <label>Database File Path</label>
              <input
                type="text"
                value={formData.database}
                onChange={(e) => handleChange('database', e.target.value)}
                placeholder="/path/to/database.db"
                className="input-field"
              />
            </div>
          )}

          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success
                ? '✓ Connection successful!'
                : `✗ Connection failed: ${testResult.error}`}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
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
        </div>
      </div>
    </div>
  );
}

export default AddAggregatorModal;
