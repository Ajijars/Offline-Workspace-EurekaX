'use client';

/**
 * SQL Editor Page — execute queries with syntax-highlighted editor, results table, history.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Clock, Save, Download, Table2, AlertCircle, Bookmark, Database, Sparkles, GitBranch } from 'lucide-react';
import AmbientBackground from '@/components/layout/AmbientBackground';
import Sidebar from '@/components/layout/Sidebar';
import AuthGuard from '@/components/auth/AuthGuard';
import { authFetch } from '@/lib/auth';

interface QueryResult {
  success: boolean; columns: string[]; rows: Record<string, unknown>[];
  row_count?: number; duration_ms?: number; truncated?: boolean; error?: string;
}

interface HistoryItem {
  id: number; query_text: string; status: string; row_count?: number;
  duration_ms?: number; created_at: string; source_name: string;
}

interface SavedItem {
  id: number; name: string; query_text: string; description: string;
}

export default function SQLEditorPage() {
  const [sql, setSql] = useState('SELECT 1 as test_value, "hello" as greeting;');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [activeTab, setActiveTab] = useState<'results' | 'history' | 'saved'>('results');
  const [saveName, setSaveName] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingSql, setGeneratingSql] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Schema Explorer State
  const [sources, setSources] = useState<any[]>([{ id: 'local', name: 'Local SQLite (Default)' }]);
  const [selectedSource, setSelectedSource] = useState<string>('local');
  const [schema, setSchema] = useState<any[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadHistory();
    loadSaved();
    loadSources();
  }, []);

  useEffect(() => {
    loadSchema(selectedSource);
  }, [selectedSource]);

  const loadSources = async () => {
    try {
      const res = await authFetch('/api/governance/sources');
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        // Filter out non-SQL sources for the SQL editor if needed, but we'll show them all
        const sqlSources = data.filter((s: any) => s.source_type === 'sql' || s.source_type === 'csv');
        setSources([{ id: 'local', name: 'Local SQLite (Default)' }, ...sqlSources]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadSchema = async (sourceId: string) => {
    setLoadingSchema(true);
    setSchema([]);
    try {
      const res = await authFetch(`/api/query/schema?source_id=${sourceId}`);
      if (res.ok) {
        const data = await res.json();
        setSchema(data.schema || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingSchema(false);
  };

  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => ({ ...prev, [tableName]: !prev[tableName] }));
  };

  const runQuery = async () => {
    if (!sql.trim()) return;
    setRunning(true);
    setActiveTab('results');
    try {
      const res = await authFetch('/api/query/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, source_name: selectedSource }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, columns: [], rows: [], error: data.detail || 'Query failed' });
      } else {
        setResult(data);
      }
      loadHistory();
    } catch (err) {
      setResult({ success: false, columns: [], rows: [], error: 'Network error' });
    }
    setRunning(false);
  };

  const generateSql = async () => {
    if (!aiPrompt.trim()) return;
    setGeneratingSql(true);
    try {
      // Pass the schema context so Ollama knows the exact tables/columns
      const res = await authFetch('/api/query/generate-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: aiPrompt, schema_context: schema }),
      });
      
      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          alert(`API Error: ${data.detail || 'Failed to generate SQL'}`);
        } else {
          // If it's not JSON, it's likely a Next.js proxy timeout (504) or crash (500)
          alert(`Timeout Error (${res.status}): The AI model took too long to respond. This usually happens on the first request while Ollama is loading the model into memory. Please wait a moment and try again!`);
        }
        setGeneratingSql(false);
        return;
      }

      const data = await res.json();
      if (data.sql) {
        setSql(data.sql);
      } else {
        alert('Received empty response from the AI model.');
      }
    } catch (err) {
      alert(`Network connection failed. Make sure your local server is running. (${err instanceof Error ? err.message : 'Unknown error'})`);
    }
    setGeneratingSql(false);
  };

  const loadHistory = async () => {
    try {
      const res = await authFetch('/api/query/history');
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      } else if (data && Array.isArray(data.history)) {
        setHistory(data.history);
      } else {
        setHistory([]);
      }
    } catch {
      setHistory([]);
    }
  };

  const loadSaved = async () => {
    try {
      const res = await authFetch('/api/query/saved');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSaved(data);
      } else if (data && Array.isArray(data.saved)) {
        setSaved(data.saved);
      } else {
        setSaved([]);
      }
    } catch {
      setSaved([]);
    }
  };

  const saveQuery = async () => {
    if (!saveName.trim()) return;
    await authFetch('/api/query/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saveName, query_text: sql }),
    });
    setSaveName('');
    loadSaved();
  };

  const createPipelineFromQuery = async () => {
    if (!sql.trim()) return;
    const pipeName = saveName.trim() ? saveName : 'New SQL Pipeline';
    try {
      const res = await authFetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: pipeName, 
          description: 'Created from SQL Editor', 
          steps: [{ type: 'query', sql: sql, source: selectedSource }] 
        }),
      });
      if (res.ok) {
        router.push('/pipelines');
      } else {
        alert('Failed to create pipeline.');
      }
    } catch (e) {
      alert(`Network error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const exportCSV = () => {
    if (!result?.columns.length) return;
    const header = result.columns.join(',') + '\n';
    const rows = result.rows.map(r => result.columns.map(c => `"${r[c] ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'query_results.csv'; a.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  };

  return (
    <AuthGuard>
      <AmbientBackground />
      <div className="app-layout">
        <Sidebar />
        <main className="chat-main">
          <div className="dashboard-page">
            <Link href="/chat" className="back-link"><ArrowLeft size={16} /> Back to Chat</Link>
            <h1 className="dashboard-title">SQL Editor</h1>
            <p className="dashboard-subtitle">Execute queries against local or connected data sources</p>

            <div style={{ display: 'flex', gap: '20px', marginTop: '24px' }}>
              
              {/* Schema Explorer Sidebar */}
              <div className="schema-sidebar" style={{ 
                width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px',
                background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', maxHeight: 'calc(100vh - 180px)', overflowY: 'auto'
              }}>
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={16} /> Schema Explorer
                </h3>
                
                <select 
                  value={selectedSource} 
                  onChange={e => setSelectedSource(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text-1)' }}
                >
                  {sources.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>

                <div className="schema-tree" style={{ flex: 1 }}>
                  {loadingSchema ? (
                    <div style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Loading schema...</div>
                  ) : schema.length === 0 ? (
                    <div style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No tables found.</div>
                  ) : (
                    schema.map(table => (
                      <div key={table.table_name} style={{ marginBottom: '8px' }}>
                        <div 
                          onClick={() => toggleTable(table.table_name)}
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', 
                            cursor: 'pointer', color: 'var(--text-1)', fontWeight: 500, padding: '4px 0'
                          }}
                        >
                          <Table2 size={14} style={{ color: 'var(--primary)' }} /> 
                          {table.table_name}
                        </div>
                        {expandedTables[table.table_name] && (
                          <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            {table.columns.map((col: any) => (
                              <div key={col.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--text-2)' }}>{col.name}</span>
                                <span style={{ color: 'var(--text-4)', fontSize: '0.75rem' }}>{col.type.toLowerCase()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Main Editor Area */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Ask AI */}
                <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                placeholder="Ask AI to generate a query (e.g., 'Show me all records from amazon')" 
                value={aiPrompt} 
                onChange={e => setAiPrompt(e.target.value)} 
                onKeyDown={e => { if (e.key === 'Enter') generateSql(); }}
                style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)' }}
              />
              <button 
                className="sql-run-btn" 
                onClick={generateSql} 
                disabled={generatingSql || !aiPrompt.trim()}
                style={{ background: 'var(--primary)', padding: '0 16px' }}
              >
                {generatingSql ? <div className="login-btn-spinner" /> : <><Sparkles size={14} /> Generate SQL</>}
              </button>
            </div>

            {/* Editor */}
            <div className="sql-editor-wrap">
              <textarea
                ref={textareaRef}
                className="sql-textarea"
                value={sql}
                onChange={e => setSql(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write your SQL query here..."
                spellCheck={false}
                rows={8}
              />
              <div className="sql-editor-actions">
                <button className="sql-run-btn" onClick={runQuery} disabled={running || !sql.trim()}>
                  {running ? <div className="login-btn-spinner" /> : <><Play size={14} /> Run (Ctrl+Enter)</>}
                </button>
                <div className="sql-save-group">
                  <input placeholder="Query name..." value={saveName} onChange={e => setSaveName(e.target.value)} className="sql-save-input" />
                  <button className="governance-add-btn" onClick={saveQuery} disabled={!saveName.trim()}>
                    <Save size={14} /> Save Query
                  </button>
                  <button className="governance-add-btn" onClick={createPipelineFromQuery} disabled={!sql.trim()} title="Create Pipeline from Query">
                    <GitBranch size={14} /> Create Pipeline
                  </button>
                </div>
              </div>
            </div>

            {/* Tab Bar */}
            <div className="sql-tabs">
              <button className={`sql-tab ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
                <Table2 size={14} /> Results {result && result.success && <span className="sql-tab-count">{result.row_count}</span>}
              </button>
              <button className={`sql-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                <Clock size={14} /> History <span className="sql-tab-count">{history.length}</span>
              </button>
              <button className={`sql-tab ${activeTab === 'saved' ? 'active' : ''}`} onClick={() => setActiveTab('saved')}>
                <Bookmark size={14} /> Saved <span className="sql-tab-count">{saved.length}</span>
              </button>
              {result?.success && result.columns.length > 0 && (
                <button className="governance-add-btn" style={{ marginLeft: 'auto' }} onClick={exportCSV}><Download size={14} /> Export</button>
              )}
            </div>

            {/* Results Area */}
            {activeTab === 'results' && (
              <div className="sql-results">
                {!result ? (
                  <div className="sql-empty-state">
                    <Database size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
                    <p style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>No results to display.</p>
                    <p style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>Write and run a query to see the output here.</p>
                  </div>
                ) : !result.success ? (
                  <div className="sql-error"><AlertCircle size={16} /> {result.error}</div>
                ) : result.columns.length > 0 ? (
                  <>
                    <div className="sql-result-meta">
                      {result.row_count} rows · {result.duration_ms}ms{result.truncated ? ' · truncated' : ''}
                    </div>
                    <div className="audit-table-wrap">
                      <table className="audit-table">
                        <thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                        <tbody>
                          {result.rows.map((row, i) => (
                            <tr key={i}>{result.columns.map(c => <td key={c}>{String(row[c] ?? 'NULL')}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="sql-result-meta">Query executed successfully · {result.row_count ?? 0} rows affected · {result.duration_ms}ms</div>
                )}
              </div>
            )}

            {/* History */}
            {activeTab === 'history' && (
              <div className="sql-history-list">
                {history.map(h => (
                  <div key={h.id} className="sql-history-item" onClick={() => { setSql(h.query_text); setActiveTab('results'); }}>
                    <div className="sql-history-query">{h.query_text.slice(0, 100)}</div>
                    <div className="sql-history-meta">
                      <span className={`audit-action-badge ${h.status === 'error' ? 'danger' : ''}`}>{h.status}</span>
                      {h.row_count != null && <span>{h.row_count} rows</span>}
                      {h.duration_ms != null && <span>{h.duration_ms}ms</span>}
                      <span>{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '0.82rem', padding: 16 }}>No query history</p>}
              </div>
            )}

            {/* Saved */}
            {activeTab === 'saved' && (
              <div className="sql-history-list">
                {saved.map(s => (
                  <div key={s.id} className="sql-history-item" onClick={() => { setSql(s.query_text); setActiveTab('results'); }}>
                    <div className="governance-catalog-name"><Bookmark size={14} /> {s.name}</div>
                    <div className="sql-history-query">{s.query_text.slice(0, 100)}</div>
                  </div>
                ))}
                {saved.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '0.82rem', padding: 16 }}>No saved queries</p>}
              </div>
            )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
