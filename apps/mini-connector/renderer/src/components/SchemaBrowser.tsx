import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Table, 
  ChevronRight, 
  ChevronDown, 
  Key, 
  Search,
  RefreshCw,
  Loader2,
  Cloud,
  Eye,
  AlertCircle
} from 'lucide-react';

interface SchemaTable {
    name: string;
    columns: {
        name: string;
        type: string;
        nullable: boolean;
        primaryKey: boolean;
    }[];
}

interface Schema {
    name: string;
    tables: SchemaTable[];
}

export function SchemaBrowser() {
  const [aggregators, setAggregators] = useState<any[]>([]);
  const [selectedAggregatorId, setSelectedAggregatorId] = useState<string>('');
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedSchemas, setExpandedSchemas] = useState<string[]>(['default']);
  const [expandedTables, setExpandedTables] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Preview State
  const [activeTable, setActiveTable] = useState<SchemaTable | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [transferring, setTransferring] = useState(false);

  const fetchAggregators = async () => {
      if (!window.electronAPI) return;
      try {
          const list = await window.electronAPI.aggregators.list();
          setAggregators(list);
          if (list.length > 0 && !selectedAggregatorId) {
              setSelectedAggregatorId(list[0].id);
          }
      } catch (err) {
          console.error("Failed to fetch aggregators", err);
      }
  };

  const fetchSchema = async () => {
      if (!selectedAggregatorId || !window.electronAPI) return;
      setLoading(true);
      setActiveTable(null);
      setPreviewData([]);
      try {
          const schemaInfo = await window.electronAPI.aggregators.discoverSchema(selectedAggregatorId);
          setSchemas([{
              name: 'default',
              tables: schemaInfo.tables
          }]);
      } catch (err) {
          console.error("Failed to fetch schema", err);
      } finally {
          setLoading(false);
      }
  };

  const syncToCloud = async () => {
      if (!selectedAggregatorId || !schemas.length || !window.electronAPI) return;
      setSyncing(true);
      try {
          const schemaPayload = {
              tables: schemas[0].tables
          };
          await window.electronAPI.aggregators.syncSchema(selectedAggregatorId, schemaPayload);
          console.log("Schema synced to cloud");
      } catch (err) {
          console.error("Failed to sync schema", err);
      } finally {
          setSyncing(false);
      }
  };

  const handlePreview = async () => {
    if (!activeTable || !selectedAggregatorId || !window.electronAPI) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewData([]);
    try {
        const result = await window.electronAPI.aggregators.previewTable(selectedAggregatorId, activeTable.name);
        setPreviewData(result.data || []);
    } catch (e) {
        setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
        setPreviewLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!activeTable || !selectedAggregatorId || !window.electronAPI) return;
    if (!confirm(`Are you sure you want to transfer data from ${activeTable.name} to the cloud? This might take a while.`)) return;
    
    setTransferring(true);
    try {
        const result = await window.electronAPI.aggregators.transferTable(selectedAggregatorId, activeTable.name);
        alert(`Successfully transferred ${result.count} rows to cloud buffer.`);
    } catch (e) {
        alert(`Transfer failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        setTransferring(false);
    }
  };

  useEffect(() => {
      fetchAggregators();
  }, []);

  useEffect(() => {
      if (selectedAggregatorId) {
          fetchSchema();
      }
  }, [selectedAggregatorId]);

  const toggleSchema = (name: string) => {
    setExpandedSchemas(prev => 
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const toggleTable = (name: string) => {
    setExpandedTables(prev => 
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  };

  const handleTableSelect = (table: SchemaTable) => {
      setActiveTable(table);
      setPreviewData([]);
      setPreviewError('');
  };

  return (
    <div className="h-full flex flex-col animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Schema Browser</h2>
          <p className="text-sm text-foreground-secondary">Explore your database structure and metadata.</p>
        </div>
        <div className="flex gap-2">
            {aggregators.length > 0 && (
                <select 
                    className="bg-background-elevated border border-border-subtle rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={selectedAggregatorId}
                    onChange={(e) => setSelectedAggregatorId(e.target.value)}
                >
                    {aggregators.map(agg => (
                        <option key={agg.id} value={agg.id}>{agg.name}</option>
                    ))}
                </select>
            )}
          <button className="btn btn-secondary" onClick={fetchSchema} disabled={loading || !selectedAggregatorId}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </button>
          <button className="btn btn-secondary" onClick={syncToCloud} disabled={syncing || !selectedAggregatorId || schemas.length === 0}>
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
            Sync
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-full min-h-0">
        {/* Sidebar / Tree View */}
        <div className="col-span-4 bg-background-surface border border-border-subtle rounded-xl flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-border-subtle">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-tertiary" />
              <input 
                type="text" 
                placeholder="Search tables..." 
                className="w-full pl-9 pr-4 py-2 bg-background-elevated border border-border-subtle rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-foreground-tertiary transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {schemas.map(schema => (
              <div key={schema.name} className="select-none">
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background-hover cursor-pointer text-sm font-medium text-foreground-secondary transition-colors"
                  onClick={() => toggleSchema(schema.name)}
                >
                  {expandedSchemas.includes(schema.name) ? (
                    <ChevronDown className="w-4 h-4 text-foreground-tertiary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-foreground-tertiary" />
                  )}
                  <Database className="w-4 h-4 text-primary" />
                  <span className="text-foreground">{schema.name}</span>
                  <span className="ml-auto text-xs text-foreground-tertiary bg-background-elevated px-1.5 py-0.5 rounded-full">
                    {schema.tables.length}
                  </span>
                </div>

                {expandedSchemas.includes(schema.name) && (
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-border-subtle pl-2">
                    {schema.tables.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(table => (
                      <div key={table.name}>
                        <div 
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer text-sm transition-colors group ${
                              activeTable?.name === table.name 
                              ? 'bg-primary/10 text-primary' 
                              : 'hover:bg-background-hover text-foreground-secondary'
                          }`}
                          onClick={() => {
                              toggleTable(table.name);
                              handleTableSelect(table);
                          }}
                        >
                          {expandedTables.includes(table.name) ? (
                            <ChevronDown className="w-3 h-3 text-foreground-tertiary" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-foreground-tertiary" />
                          )}
                          <Table className={`w-3.5 h-3.5 ${activeTable?.name === table.name ? 'text-primary' : 'text-foreground-tertiary group-hover:text-primary'} transition-colors`} />
                          <span className={`group-hover:text-foreground transition-colors ${activeTable?.name === table.name ? 'font-medium' : ''}`}>{table.name}</span>
                        </div>

                        {expandedTables.includes(table.name) && (
                          <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border-subtle pl-2">
                            {table.columns.map(col => (
                              <div key={col.name} className="flex items-center gap-2 px-3 py-1 rounded hover:bg-background-hover/50 text-xs text-foreground-tertiary group">
                                {col.primaryKey ? (
                                  <Key className="w-3 h-3 text-warning" />
                                ) : (
                                  <div className="w-3 h-3" />
                                )}
                                <span className="text-foreground-secondary font-mono">{col.name}</span>
                                <span className="ml-auto text-[10px] text-foreground-tertiary opacity-50">{col.type}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {schemas.length === 0 && !loading && (
                <div className="text-center p-4 text-foreground-tertiary text-sm">
                    {aggregators.length === 0 ? "No connections configured." : "No schema loaded."}
                </div>
            )}
          </div>
        </div>

        {/* Detail View */}
        <div className="col-span-8 bg-background-surface border border-border-subtle rounded-xl flex flex-col h-full overflow-hidden">
            {activeTable ? (
                <div className="flex flex-col h-full">
                    {/* Table Header */}
                    <div className="p-6 border-b border-border-subtle flex items-start justify-between bg-background-elevated/30">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Table className="w-5 h-5 text-primary" />
                                <h3 className="text-lg font-bold text-foreground">{activeTable.name}</h3>
                            </div>
                            <p className="text-sm text-foreground-secondary">
                                {activeTable.columns.length} columns • Primary Key: {activeTable.columns.find(c => c.primaryKey)?.name || 'None'}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                className="btn btn-secondary"
                                onClick={handleTransfer}
                                disabled={transferring || previewLoading}
                            >
                                {transferring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
                                Transfer Data
                            </button>
                            <button 
                                className="btn btn-primary"
                                onClick={handlePreview}
                                disabled={previewLoading}
                            >
                                {previewLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                                Preview Data
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {previewError ? (
                            <div className="p-8 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
                                    <AlertCircle className="w-6 h-6 text-danger" />
                                </div>
                                <h4 className="text-foreground font-medium mb-1">Preview Failed</h4>
                                <p className="text-danger text-sm max-w-md">{previewError}</p>
                            </div>
                        ) : previewData.length > 0 ? (
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-background-elevated sticky top-0 z-10">
                                        <tr>
                                            {Object.keys(previewData[0]).map(key => (
                                                <th key={key} className="px-4 py-3 font-medium text-foreground-secondary border-b border-border-subtle whitespace-nowrap">
                                                    {key}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {previewData.map((row, i) => (
                                            <tr key={i} className="hover:bg-background-hover transition-colors">
                                                {Object.values(row).map((val: any, j) => (
                                                    <td key={j} className="px-4 py-2.5 text-foreground truncate max-w-[200px]">
                                                        {val === null ? <span className="text-foreground-tertiary italic">null</span> : String(val)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-foreground-tertiary p-8">
                                <Table className="w-12 h-12 mb-3 opacity-20" />
                                <p>Click "Preview Data" to view the first 10 rows.</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col h-full items-center justify-center text-center p-8">
                    <div className="w-16 h-16 rounded-full bg-background-elevated flex items-center justify-center mb-4 border border-border-subtle">
                        <Database className="w-8 h-8 text-foreground-tertiary" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Select a table to view details</h3>
                    <p className="text-sm text-foreground-secondary max-w-sm">
                        Browse your database schema, view column types, relationships, and sample data.
                    </p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
