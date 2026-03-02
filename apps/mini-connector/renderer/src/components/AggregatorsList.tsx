import { useState, useEffect } from 'react';
import { 
  Database, 
  Server, 
  Trash2, 
  Edit, 
  RefreshCw, 
  Plus,
  MoreVertical,
  CheckCircle,
  AlertCircle,
  Clock,
  FileCode,
  Box
} from 'lucide-react';

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

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'postgresql':
        return { icon: <Database className="w-5 h-5 text-[#336791]" />, label: 'PostgreSQL', bg: 'bg-[#336791]/10' };
      case 'mysql':
        return { icon: <Database className="w-5 h-5 text-[#00758F]" />, label: 'MySQL', bg: 'bg-[#00758F]/10' };
      case 'mssql':
        return { icon: <Server className="w-5 h-5 text-[#CC2927]" />, label: 'SQL Server', bg: 'bg-[#CC2927]/10' };
      case 'sqlite':
        return { icon: <FileCode className="w-5 h-5 text-[#003B57]" />, label: 'SQLite', bg: 'bg-[#003B57]/10' };
      default:
        return { icon: <Box className="w-5 h-5 text-foreground-tertiary" />, label: type, bg: 'bg-background-elevated' };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-foreground-secondary">
        <RefreshCw className="w-8 h-8 animate-spin mb-4 text-primary" />
        <p>Loading connections...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button onClick={onAddNew} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Connection
          </button>
        </div>
      </div>

      {aggregators.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-border-subtle rounded-xl bg-background-elevated/30 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-background-elevated flex items-center justify-center mb-4">
            <Database className="w-8 h-8 text-foreground-tertiary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Connections</h3>
          <p className="text-foreground-secondary mb-6 max-w-sm">
            You haven't configured any database connections yet. Add one to start syncing data.
          </p>
          <button onClick={onAddNew} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Connection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
          {aggregators.map((aggregator) => {
            const config = getTypeConfig(aggregator.type);
            return (
              <div key={aggregator.id} className="card group hover:border-primary/50 transition-all duration-200">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                      {config.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground truncate max-w-[150px]">{aggregator.name}</h3>
                      <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider bg-background-elevated px-1.5 py-0.5 rounded">
                        {config.label}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                     <button 
                       onClick={() => handleDelete(aggregator.id)}
                       className="p-1.5 text-foreground-tertiary hover:text-danger hover:bg-danger/10 rounded transition-colors"
                       title="Delete"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-foreground-secondary">
                    <Server className="w-4 h-4 text-foreground-tertiary" />
                    <span className="font-mono text-xs">{aggregator.host}:{aggregator.port}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-foreground-secondary">
                    <Database className="w-4 h-4 text-foreground-tertiary" />
                    <span className="truncate">{aggregator.database}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                  <div className="flex items-center gap-2">
                    {testingId === aggregator.id ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Testing...
                      </span>
                    ) : testResults[aggregator.id] ? (
                       testResults[aggregator.id].success ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                          <CheckCircle className="w-3 h-3" />
                          Connected
                        </span>
                       ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-danger" title={testResults[aggregator.id].error}>
                          <AlertCircle className="w-3 h-3" />
                          Failed
                        </span>
                       )
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-foreground-tertiary">
                        <Clock className="w-3 h-3" />
                        Not tested
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTest(aggregator.id)}
                      disabled={testingId === aggregator.id}
                      className="btn btn-secondary px-3 py-1.5 text-xs h-auto"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => onEdit(aggregator)}
                      className="btn btn-secondary px-3 py-1.5 text-xs h-auto"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AggregatorsList;
