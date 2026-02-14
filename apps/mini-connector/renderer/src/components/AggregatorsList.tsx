import { useState, useEffect } from 'react';

interface Aggregator {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

interface AggregatorsListProps {
  onAddNew: () => void;
  onEdit: (aggregator: Aggregator) => void;
}

function AggregatorsList({ onAddNew, onEdit }: AggregatorsListProps) {
  const [aggregators, setAggregators] = useState<Aggregator[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  useEffect(() => {
    loadAggregators();
  }, []);

  const loadAggregators = async () => {
    try {
      setLoading(true);
      const list = await window.electronAPI?.aggregators.list();
      setAggregators(list || []);
    } catch (err) {
      console.error('Failed to load aggregators:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (id: string) => {
    try {
      setTestingId(id);
      const result = await window.electronAPI?.aggregators.test(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      console.error('Test failed:', err);
      setTestResults((prev) => ({ ...prev, [id]: { success: false, error: 'Test failed' } }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this aggregator?')) {
      return;
    }
    try {
      await window.electronAPI?.aggregators.delete(id);
      await loadAggregators();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete aggregator');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'mysql': return '🐬';
      case 'postgresql': return '🐘';
      case 'mssql': return '🗄️';
      case 'sqlite': return '📁';
      case 'oracle': return '🏛️';
      default: return '🗄️';
    }
  };

  const getStatusBadge = (id: string) => {
    if (testingId === id) {
      return <span className="agg-status-badge testing">Testing…</span>;
    }
    const result = testResults[id];
    if (result) {
      return (
        <span className={`agg-status-badge ${result.success ? 'success' : 'error'}`}>
          {result.success ? '✓ Connected' : `✗ ${result.error || 'Failed'}`}
        </span>
      );
    }
    return <span className="agg-status-badge unknown">Not tested</span>;
  };

  if (loading) {
    return (
      <div className="aggregators-list">
        <div className="loading">Loading aggregators…</div>
      </div>
    );
  }

  return (
    <div className="aggregators-list">
      <div className="aggregators-header">
        <h2>Database Connections</h2>
        <button onClick={onAddNew} className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="2" x2="8" y2="14" />
            <line x1="2" y1="8" x2="14" y2="8" />
          </svg>
          Add Connection
        </button>
      </div>

      {aggregators.length === 0 ? (
        <div className="empty-state fade-in">
          <p>No database connections configured yet.</p>
          <button onClick={onAddNew} className="btn btn-primary">
            Add Your First Connection
          </button>
        </div>
      ) : (
        <div className="aggregator-cards fade-in">
          {aggregators.map((aggregator) => (
            <div key={aggregator.id} className="aggregator-card">
              <div className="aggregator-card-header">
                <div className="aggregator-type-icon">
                  {getTypeIcon(aggregator.type)}
                </div>
                <div className="aggregator-card-title">
                  <h3>{aggregator.name}</h3>
                  <span className="agg-type-label">{aggregator.type}</span>
                </div>
              </div>

              <div className="aggregator-card-meta">
                <div className="agg-meta-row">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="8" cy="8" r="6" />
                    <circle cx="8" cy="8" r="1" />
                  </svg>
                  <span className="mono">{aggregator.host}:{aggregator.port}</span>
                </div>
                <div className="agg-meta-row">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <ellipse cx="8" cy="4" rx="5" ry="2" />
                    <path d="M3 4v3.5c0 1.1 2.24 2 5 2s5-.9 5-2V4" />
                    <path d="M3 7.5V11c0 1.1 2.24 2 5 2s5-.9 5-2V7.5" />
                  </svg>
                  <span>{aggregator.database}</span>
                </div>
              </div>

              <div className="aggregator-card-footer">
                {getStatusBadge(aggregator.id)}
                <div className="agg-actions">
                  <button
                    onClick={() => handleTest(aggregator.id)}
                    disabled={testingId === aggregator.id}
                    className="btn btn-sm btn-secondary"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => onEdit(aggregator)}
                    className="btn btn-sm btn-secondary"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(aggregator.id)}
                    className="btn btn-sm btn-danger"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AggregatorsList;
