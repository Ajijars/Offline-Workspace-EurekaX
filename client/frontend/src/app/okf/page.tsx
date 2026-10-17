'use client';

/**
 * Open Knowledge Format (OKF) Page — Knowledge graph builder, browser, and visualizer.
 * 
 * Features:
 * - Package management (create, browse, delete)
 * - Interactive knowledge graph canvas with nodes and edges
 * - Node creation with typed categories (entity, concept, fact, etc.)
 * - Edge creation with typed relationships
 * - JSON-LD export/import
 * - AI enrichment suggestions
 * - Full-text search
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Trash2, Download, Upload, Brain, Search,
  Network, Tag, FileJson, Sparkles, ChevronRight, X, Eye,
  Circle, ArrowRightLeft, Zap, BookOpen, Globe, Lock,
  Package, Layers, GitBranch, BarChart3, Edit3,
} from 'lucide-react';
import AmbientBackground from '@/components/layout/AmbientBackground';
import Sidebar from '@/components/layout/Sidebar';
import AuthGuard from '@/components/auth/AuthGuard';
import { authFetch } from '@/lib/auth';

// ── Types ──

interface OKFPackage {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  tags: string[];
  schema_version: string;
  is_public: boolean;
  node_count: number;
  edge_count: number;
  created_at: string;
  updated_at: string;
}

interface OKFNode {
  id: string;
  package_id: string;
  node_type: string;
  label: string;
  description: string;
  content: string;
  properties: Record<string, unknown>;
  source_url: string;
  confidence: number;
  position_x: number;
  position_y: number;
  created_at: string;
}

interface OKFEdge {
  id: string;
  package_id: string;
  source_node_id: string;
  target_node_id: string;
  relationship_type: string;
  label: string;
  weight: number;
  properties: Record<string, unknown>;
}

interface AISuggestion {
  suggested_nodes: Array<{ label: string; node_type: string; description: string; confidence: number }>;
  suggested_edges: Array<{ source_label: string; target_label: string; relationship_type: string; label: string }>;
  summary: string;
}

// ── Constants ──

const NODE_TYPES = ['entity', 'concept', 'fact', 'document', 'event', 'metric'] as const;
const RELATIONSHIP_TYPES = ['is_a', 'part_of', 'causes', 'relates_to', 'derived_from', 'depends_on', 'contradicts', 'supports', 'references', 'contains'] as const;

const NODE_COLORS: Record<string, string> = {
  entity: '#6366f1',
  concept: '#22d3ee',
  fact: '#34d399',
  document: '#f59e0b',
  event: '#f87171',
  metric: '#a78bfa',
};

const NODE_ICONS: Record<string, string> = {
  entity: '🔷',
  concept: '💡',
  fact: '✅',
  document: '📄',
  event: '📅',
  metric: '📊',
};

// ══════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════

export default function OKFPage() {
  // ── State ──
  const [packages, setPackages] = useState<OKFPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<OKFPackage | null>(null);
  const [nodes, setNodes] = useState<OKFNode[]>([]);
  const [edges, setEdges] = useState<OKFEdge[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Panels
  const [view, setView] = useState<'packages' | 'graph'>('packages');
  const [showCreatePkg, setShowCreatePkg] = useState(false);
  const [showCreateNode, setShowCreateNode] = useState(false);
  const [showCreateEdge, setShowCreateEdge] = useState(false);
  const [showNodeDetail, setShowNodeDetail] = useState<OKFNode | null>(null);
  const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  // Forms
  const [newPkg, setNewPkg] = useState({ name: '', description: '', author: '', license: 'CC-BY-4.0', tags: '' });
  const [newNode, setNewNode] = useState({ node_type: 'entity', label: '', description: '', content: '', source_url: '', confidence: 1.0 });
  const [newEdge, setNewEdge] = useState({ source_node_id: '', target_node_id: '', relationship_type: 'relates_to', label: '' });

  // Canvas
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // ── Data Loading ──

  const loadPackages = useCallback(async () => {
    try {
      const res = await authFetch(`/api/okf/packages?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setPackages(Array.isArray(data) ? data : []);
    } catch { }
  }, [search]);

  const loadPackageDetail = useCallback(async (pkgId: string) => {
    try {
      setLoading(true);
      const res = await authFetch(`/api/okf/packages/${pkgId}`);
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch { } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await authFetch('/api/okf/stats');
      setStats(await res.json());
    } catch { }
  }, []);

  useEffect(() => { loadPackages(); loadStats(); }, [loadPackages, loadStats]);

  useEffect(() => {
    if (selectedPkg) {
      loadPackageDetail(selectedPkg.id);
    }
  }, [selectedPkg, loadPackageDetail]);

  // ── Package CRUD ──

  const createPackage = async () => {
    try {
      await authFetch('/api/okf/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPkg, tags: newPkg.tags.split(',').map(t => t.trim()).filter(Boolean) }),
      });
      setShowCreatePkg(false);
      setNewPkg({ name: '', description: '', author: '', license: 'CC-BY-4.0', tags: '' });
      loadPackages();
    } catch { }
  };

  const deletePackage = async (pkgId: string) => {
    if (!confirm('Delete this package and all its nodes/edges?')) return;
    try {
      await authFetch(`/api/okf/packages/${pkgId}`, { method: 'DELETE' });
      if (selectedPkg?.id === pkgId) {
        setSelectedPkg(null);
        setView('packages');
      }
      loadPackages();
    } catch { }
  };

  // ── Node CRUD ──

  const createNode = async () => {
    if (!selectedPkg) return;
    try {
      // Auto-position new nodes in a circle
      const angle = (nodes.length * (2 * Math.PI / Math.max(nodes.length + 1, 6)));
      const radius = 200;
      const position_x = 400 + radius * Math.cos(angle);
      const position_y = 300 + radius * Math.sin(angle);

      await authFetch(`/api/okf/packages/${selectedPkg.id}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newNode, position_x, position_y }),
      });
      setShowCreateNode(false);
      setNewNode({ node_type: 'entity', label: '', description: '', content: '', source_url: '', confidence: 1.0 });
      loadPackageDetail(selectedPkg.id);
    } catch { }
  };

  const deleteNode = async (nodeId: string) => {
    if (!selectedPkg) return;
    try {
      await authFetch(`/api/okf/nodes/${nodeId}`, { method: 'DELETE' });
      setShowNodeDetail(null);
      loadPackageDetail(selectedPkg.id);
    } catch { }
  };

  // ── Edge CRUD ──

  const createEdge = async () => {
    if (!selectedPkg) return;
    try {
      await authFetch(`/api/okf/packages/${selectedPkg.id}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEdge),
      });
      setShowCreateEdge(false);
      setNewEdge({ source_node_id: '', target_node_id: '', relationship_type: 'relates_to', label: '' });
      loadPackageDetail(selectedPkg.id);
    } catch { }
  };

  const deleteEdge = async (edgeId: string) => {
    if (!selectedPkg) return;
    try {
      await authFetch(`/api/okf/edges/${edgeId}`, { method: 'DELETE' });
      loadPackageDetail(selectedPkg.id);
    } catch { }
  };

  // ── Export / Import ──

  const exportPackage = async () => {
    if (!selectedPkg) return;
    try {
      const res = await authFetch(`/api/okf/packages/${selectedPkg.id}/export`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `okf_${selectedPkg.name.replace(/\s+/g, '_').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { }
  };

  const importPackage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      await authFetch('/api/okf/import', { method: 'POST', body: formData });
      loadPackages();
    } catch { }
  };

  // ── AI Enrichment ──

  const enrichWithAI = async () => {
    if (!selectedPkg) return;
    setAiLoading(true);
    setShowAISuggestions(true);
    try {
      const res = await authFetch(`/api/okf/packages/${selectedPkg.id}/enrich`, { method: 'POST' });
      setAiSuggestions(await res.json());
    } catch { } finally {
      setAiLoading(false);
    }
  };

  const applySuggestion = async (node: AISuggestion['suggested_nodes'][0]) => {
    if (!selectedPkg) return;
    const angle = (nodes.length * (2 * Math.PI / Math.max(nodes.length + 1, 6)));
    const radius = 250;
    await authFetch(`/api/okf/packages/${selectedPkg.id}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...node,
        position_x: 400 + radius * Math.cos(angle),
        position_y: 300 + radius * Math.sin(angle),
      }),
    });
    loadPackageDetail(selectedPkg.id);
  };

  // ── Canvas Interactions ──

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setDragNode(nodeId);
    setDragOffset({
      x: e.clientX - (node.position_x + canvasOffset.x) * zoom,
      y: e.clientY - (node.position_y + canvasOffset.y) * zoom,
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('okf-canvas-inner')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragNode) {
      const node = nodes.find(n => n.id === dragNode);
      if (!node) return;
      const newX = (e.clientX - dragOffset.x) / zoom - canvasOffset.x;
      const newY = (e.clientY - dragOffset.y) / zoom - canvasOffset.y;
      setNodes(prev => prev.map(n => n.id === dragNode ? { ...n, position_x: newX, position_y: newY } : n));
    } else if (isPanning) {
      setCanvasOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [dragNode, dragOffset, canvasOffset, zoom, isPanning, panStart, nodes]);

  const handleMouseUp = useCallback(async () => {
    if (dragNode) {
      // Persist position
      const node = nodes.find(n => n.id === dragNode);
      if (node) {
        await authFetch(`/api/okf/nodes/${dragNode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ position_x: node.position_x, position_y: node.position_y }),
        }).catch(() => { });
      }
    }
    setDragNode(null);
    setIsPanning(false);
  }, [dragNode, nodes]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => Math.min(2, Math.max(0.3, prev - e.deltaY * 0.001)));
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // ── Helpers ──

  const getNodeById = (id: string) => nodes.find(n => n.id === id);

  const filtered = packages.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  // ══════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════

  return (
    <AuthGuard>
      <AmbientBackground />
      <div className="app-layout">
        <Sidebar />
        <main className="chat-main">
          <div className="dashboard-page">
            {/* Header */}
            <Link href="/chat" className="back-link"><ArrowLeft size={16} /> Back to Chat</Link>

            <div className="okf-header">
              <div className="okf-header-left">
                <div className="okf-logo">
                  <Network size={22} />
                </div>
                <div>
                  <h1 className="dashboard-title" style={{ margin: 0 }}>Open Knowledge Format</h1>
                  <p className="dashboard-subtitle" style={{ margin: 0, marginTop: 2 }}>
                    Build, visualize, and share structured knowledge graphs
                  </p>
                </div>
              </div>
              <div className="okf-header-actions">
                {view === 'graph' && selectedPkg && (
                  <>
                    <button className="okf-action-btn okf-action-export" onClick={exportPackage} title="Export JSON-LD">
                      <Download size={14} /> Export
                    </button>
                    <button className="okf-action-btn okf-action-ai" onClick={enrichWithAI} title="AI Suggestions">
                      <Sparkles size={14} /> AI Enrich
                    </button>
                    <button className="okf-action-btn" onClick={() => { setSelectedPkg(null); setView('packages'); }}>
                      <Package size={14} /> All Packages
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ──────────── PACKAGES VIEW ──────────── */}
            {view === 'packages' && (
              <div className="okf-packages-view">
                {/* Stats Bar */}
                {stats && (
                  <div className="okf-stats-bar">
                    <div className="okf-stat">
                      <Package size={14} />
                      <span>{(stats as any).total_packages || 0}</span>
                      <label>Packages</label>
                    </div>
                    <div className="okf-stat">
                      <Circle size={14} />
                      <span>{(stats as any).total_nodes || 0}</span>
                      <label>Nodes</label>
                    </div>
                    <div className="okf-stat">
                      <ArrowRightLeft size={14} />
                      <span>{(stats as any).total_edges || 0}</span>
                      <label>Edges</label>
                    </div>
                  </div>
                )}

                {/* Search + Actions */}
                <div className="okf-toolbar">
                  <div className="governance-search" style={{ flex: 1 }}>
                    <Search size={16} />
                    <input
                      type="text" placeholder="Search knowledge packages..."
                      value={search} onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <button className="okf-action-btn okf-action-create" onClick={() => setShowCreatePkg(true)}>
                    <Plus size={14} /> New Package
                  </button>
                  <label className="okf-action-btn okf-action-import">
                    <Upload size={14} /> Import
                    <input type="file" accept=".json" style={{ display: 'none' }}
                      onChange={e => { if (e.target.files?.[0]) importPackage(e.target.files[0]); }} />
                  </label>
                </div>

                {/* Create Package Form */}
                {showCreatePkg && (
                  <div className="okf-create-form">
                    <div className="okf-create-form-header">
                      <h3><Package size={16} /> New Knowledge Package</h3>
                      <button className="icon-btn icon-btn-sm" onClick={() => setShowCreatePkg(false)}><X size={14} /></button>
                    </div>
                    <div className="okf-form-grid">
                      <input placeholder="Package name *" value={newPkg.name}
                        onChange={e => setNewPkg({ ...newPkg, name: e.target.value })} />
                      <input placeholder="Author" value={newPkg.author}
                        onChange={e => setNewPkg({ ...newPkg, author: e.target.value })} />
                      <input placeholder="Description" value={newPkg.description}
                        onChange={e => setNewPkg({ ...newPkg, description: e.target.value })} style={{ gridColumn: '1 / -1' }} />
                      <input placeholder="Tags (comma-separated)" value={newPkg.tags}
                        onChange={e => setNewPkg({ ...newPkg, tags: e.target.value })} />
                      <select value={newPkg.license} onChange={e => setNewPkg({ ...newPkg, license: e.target.value })}>
                        <option value="CC-BY-4.0">CC-BY-4.0</option>
                        <option value="MIT">MIT</option>
                        <option value="Apache-2.0">Apache 2.0</option>
                        <option value="Proprietary">Proprietary</option>
                      </select>
                    </div>
                    <button className="login-submit-btn" style={{ marginTop: 12, height: 38 }} onClick={createPackage}
                      disabled={!newPkg.name.trim()}>
                      Create Package
                    </button>
                  </div>
                )}

                {/* Package Grid */}
                <div className="okf-package-grid">
                  {filtered.map(pkg => (
                    <div key={pkg.id} className="okf-package-card" onClick={() => { setSelectedPkg(pkg); setView('graph'); }}>
                      <div className="okf-package-card-header">
                        <div className="okf-package-icon">
                          <Network size={18} />
                        </div>
                        <div className="okf-package-meta">
                          <h3>{pkg.name}</h3>
                          <span className="okf-package-version">v{pkg.version}</span>
                        </div>
                        <button className="icon-btn icon-btn-sm okf-delete-btn"
                          onClick={e => { e.stopPropagation(); deletePackage(pkg.id); }} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <p className="okf-package-desc">{pkg.description || 'No description'}</p>
                      <div className="okf-package-stats">
                        <span><Circle size={10} /> {pkg.node_count} nodes</span>
                        <span><ArrowRightLeft size={10} /> {pkg.edge_count} edges</span>
                      </div>
                      {pkg.tags.length > 0 && (
                        <div className="okf-package-tags">
                          {pkg.tags.slice(0, 3).map((t, i) => (
                            <span key={i} className="governance-tag"><Tag size={9} /> {t}</span>
                          ))}
                        </div>
                      )}
                      <div className="okf-package-footer">
                        <span>{pkg.author || 'Unknown'}</span>
                        <span>{pkg.is_public ? <Globe size={11} /> : <Lock size={11} />}</span>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && !showCreatePkg && (
                    <div className="okf-empty-state">
                      <Network size={48} strokeWidth={1} />
                      <h3>No Knowledge Packages</h3>
                      <p>Create your first knowledge graph or import an existing OKF file.</p>
                      <button className="okf-action-btn okf-action-create" onClick={() => setShowCreatePkg(true)}>
                        <Plus size={14} /> Create Package
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ──────────── GRAPH VIEW ──────────── */}
            {view === 'graph' && selectedPkg && (
              <div className="okf-graph-view">
                {/* Package Info Bar */}
                <div className="okf-pkg-info-bar">
                  <div className="okf-pkg-info-left">
                    <Network size={16} />
                    <strong>{selectedPkg.name}</strong>
                    <span className="okf-package-version">v{selectedPkg.version}</span>
                    <span className="okf-separator">•</span>
                    <span>{nodes.length} nodes</span>
                    <span className="okf-separator">•</span>
                    <span>{edges.length} edges</span>
                  </div>
                  <div className="okf-pkg-info-right">
                    <button className="okf-action-btn okf-action-create" onClick={() => setShowCreateNode(true)}>
                      <Plus size={13} /> Node
                    </button>
                    <button className="okf-action-btn" onClick={() => setShowCreateEdge(true)}
                      disabled={nodes.length < 2}>
                      <GitBranch size={13} /> Edge
                    </button>
                  </div>
                </div>

                <div className="okf-graph-container">
                  {/* Canvas */}
                  <div
                    ref={canvasRef}
                    className="okf-canvas"
                    onMouseDown={handleCanvasMouseDown}
                  >
                    <div className="okf-canvas-inner" style={{
                      transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
                      transformOrigin: '0 0',
                    }}>
                      {/* SVG for edges */}
                      <svg className="okf-edge-svg" width="100%" height="100%"
                        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                        {edges.map(edge => {
                          const src = getNodeById(edge.source_node_id);
                          const tgt = getNodeById(edge.target_node_id);
                          if (!src || !tgt) return null;

                          const midX = (src.position_x + tgt.position_x) / 2;
                          const midY = (src.position_y + tgt.position_y) / 2;

                          return (
                            <g key={edge.id}>
                              <line
                                x1={src.position_x} y1={src.position_y}
                                x2={tgt.position_x} y2={tgt.position_y}
                                stroke="var(--border-hover)"
                                strokeWidth={1.5 + edge.weight}
                                strokeOpacity={0.5}
                                markerEnd="url(#arrowhead)"
                              />
                              <text
                                x={midX} y={midY - 8}
                                fill="var(--text-3)" fontSize={10}
                                textAnchor="middle"
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                onClick={() => { if (confirm(`Delete edge "${edge.relationship_type}"?`)) deleteEdge(edge.id); }}
                              >
                                {edge.relationship_type}
                              </text>
                            </g>
                          );
                        })}
                        <defs>
                          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                            <path d="M0,0 L8,3 L0,6 Z" fill="var(--border-hover)" fillOpacity={0.6} />
                          </marker>
                        </defs>
                      </svg>

                      {/* Nodes */}
                      {nodes.map(node => (
                        <div
                          key={node.id}
                          className={`okf-node ${dragNode === node.id ? 'dragging' : ''} ${showNodeDetail?.id === node.id ? 'selected' : ''}`}
                          style={{
                            left: node.position_x - 50,
                            top: node.position_y - 30,
                            borderColor: NODE_COLORS[node.node_type] || '#6366f1',
                            '--node-color': NODE_COLORS[node.node_type] || '#6366f1',
                          } as React.CSSProperties}
                          onMouseDown={e => handleNodeMouseDown(e, node.id)}
                          onClick={e => { e.stopPropagation(); setShowNodeDetail(node); }}
                        >
                          <div className="okf-node-icon">{NODE_ICONS[node.node_type] || '🔷'}</div>
                          <div className="okf-node-label">{node.label}</div>
                          <div className="okf-node-type">{node.node_type}</div>
                          {node.confidence < 1 && (
                            <div className="okf-node-confidence" style={{
                              background: `conic-gradient(${NODE_COLORS[node.node_type]} ${node.confidence * 360}deg, transparent 0)`,
                            }} />
                          )}
                        </div>
                      ))}

                      {nodes.length === 0 && (
                        <div className="okf-canvas-empty">
                          <Zap size={32} strokeWidth={1.2} />
                          <p>Add your first knowledge node to start building the graph</p>
                        </div>
                      )}
                    </div>

                    {/* Zoom controls */}
                    <div className="okf-zoom-controls">
                      <button onClick={() => setZoom(z => Math.min(2, z + 0.2))}>+</button>
                      <span>{Math.round(zoom * 100)}%</span>
                      <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}>−</button>
                      <button onClick={() => { setZoom(1); setCanvasOffset({ x: 0, y: 0 }); }} title="Reset view">⟲</button>
                    </div>

                    {/* Legend */}
                    <div className="okf-legend">
                      {NODE_TYPES.map(t => (
                        <span key={t} className="okf-legend-item">
                          <span className="okf-legend-dot" style={{ background: NODE_COLORS[t] }} />
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Side Panel */}
                  {(showNodeDetail || showCreateNode || showCreateEdge || showAISuggestions) && (
                    <div className="okf-side-panel">
                      {/* Node Detail */}
                      {showNodeDetail && !showCreateNode && !showCreateEdge && !showAISuggestions && (
                        <div className="okf-panel-content">
                          <div className="okf-panel-header">
                            <h3>{NODE_ICONS[showNodeDetail.node_type]} {showNodeDetail.label}</h3>
                            <button className="icon-btn icon-btn-sm" onClick={() => setShowNodeDetail(null)}><X size={14} /></button>
                          </div>
                          <div className="okf-detail-row">
                            <label>Type</label>
                            <span className="okf-type-badge" style={{ borderColor: NODE_COLORS[showNodeDetail.node_type] }}>
                              {showNodeDetail.node_type}
                            </span>
                          </div>
                          <div className="okf-detail-row">
                            <label>Confidence</label>
                            <div className="okf-confidence-bar">
                              <div style={{ width: `${showNodeDetail.confidence * 100}%`, background: NODE_COLORS[showNodeDetail.node_type] }} />
                            </div>
                            <span>{(showNodeDetail.confidence * 100).toFixed(0)}%</span>
                          </div>
                          {showNodeDetail.description && (
                            <div className="okf-detail-block">
                              <label>Description</label>
                              <p>{showNodeDetail.description}</p>
                            </div>
                          )}
                          {showNodeDetail.content && (
                            <div className="okf-detail-block">
                              <label>Content</label>
                              <pre className="okf-content-pre">{showNodeDetail.content}</pre>
                            </div>
                          )}
                          {showNodeDetail.source_url && (
                            <div className="okf-detail-row">
                              <label>Source</label>
                              <a href={showNodeDetail.source_url} target="_blank" rel="noreferrer" className="okf-source-link">
                                <Globe size={12} /> {showNodeDetail.source_url}
                              </a>
                            </div>
                          )}
                          {Object.keys(showNodeDetail.properties).length > 0 && (
                            <div className="okf-detail-block">
                              <label>Properties</label>
                              <pre className="okf-content-pre">{JSON.stringify(showNodeDetail.properties, null, 2)}</pre>
                            </div>
                          )}
                          {/* Connected edges */}
                          <div className="okf-detail-block">
                            <label>Connections</label>
                            {edges.filter(e => e.source_node_id === showNodeDetail.id || e.target_node_id === showNodeDetail.id).map(e => {
                              const other = getNodeById(e.source_node_id === showNodeDetail.id ? e.target_node_id : e.source_node_id);
                              const direction = e.source_node_id === showNodeDetail.id ? '→' : '←';
                              return (
                                <div key={e.id} className="okf-connection-item">
                                  <span>{direction} {e.relationship_type} → {other?.label || '?'}</span>
                                  <button className="icon-btn icon-btn-sm" onClick={() => deleteEdge(e.id)}>
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              );
                            })}
                            {edges.filter(e => e.source_node_id === showNodeDetail.id || e.target_node_id === showNodeDetail.id).length === 0 && (
                              <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No connections yet</p>
                            )}
                          </div>
                          <button className="okf-action-btn okf-delete-node-btn" onClick={() => deleteNode(showNodeDetail.id)}>
                            <Trash2 size={13} /> Delete Node
                          </button>
                        </div>
                      )}

                      {/* Create Node */}
                      {showCreateNode && (
                        <div className="okf-panel-content">
                          <div className="okf-panel-header">
                            <h3><Plus size={16} /> Add Node</h3>
                            <button className="icon-btn icon-btn-sm" onClick={() => setShowCreateNode(false)}><X size={14} /></button>
                          </div>
                          <div className="okf-form-stack">
                            <label>Type</label>
                            <div className="okf-type-selector">
                              {NODE_TYPES.map(t => (
                                <button key={t}
                                  className={`okf-type-option ${newNode.node_type === t ? 'active' : ''}`}
                                  style={{ '--type-color': NODE_COLORS[t] } as React.CSSProperties}
                                  onClick={() => setNewNode({ ...newNode, node_type: t })}>
                                  {NODE_ICONS[t]} {t}
                                </button>
                              ))}
                            </div>
                            <label>Label *</label>
                            <input placeholder="e.g. Machine Learning" value={newNode.label}
                              onChange={e => setNewNode({ ...newNode, label: e.target.value })} />
                            <label>Description</label>
                            <textarea placeholder="Brief description..." value={newNode.description}
                              onChange={e => setNewNode({ ...newNode, description: e.target.value })} rows={3} />
                            <label>Content</label>
                            <textarea placeholder="Detailed content / notes..." value={newNode.content}
                              onChange={e => setNewNode({ ...newNode, content: e.target.value })} rows={4} />
                            <label>Source URL</label>
                            <input placeholder="https://..." value={newNode.source_url}
                              onChange={e => setNewNode({ ...newNode, source_url: e.target.value })} />
                            <label>Confidence: {(newNode.confidence * 100).toFixed(0)}%</label>
                            <input type="range" min="0" max="1" step="0.05" value={newNode.confidence}
                              onChange={e => setNewNode({ ...newNode, confidence: parseFloat(e.target.value) })} className="range-slider" />
                            <button className="login-submit-btn" style={{ marginTop: 8 }} onClick={createNode}
                              disabled={!newNode.label.trim()}>
                              Add Node
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Create Edge */}
                      {showCreateEdge && (
                        <div className="okf-panel-content">
                          <div className="okf-panel-header">
                            <h3><GitBranch size={16} /> Add Relationship</h3>
                            <button className="icon-btn icon-btn-sm" onClick={() => setShowCreateEdge(false)}><X size={14} /></button>
                          </div>
                          <div className="okf-form-stack">
                            <label>Source Node</label>
                            <select value={newEdge.source_node_id}
                              onChange={e => setNewEdge({ ...newEdge, source_node_id: e.target.value })}>
                              <option value="">Select source...</option>
                              {nodes.map(n => <option key={n.id} value={n.id}>{NODE_ICONS[n.node_type]} {n.label}</option>)}
                            </select>
                            <label>Relationship</label>
                            <select value={newEdge.relationship_type}
                              onChange={e => setNewEdge({ ...newEdge, relationship_type: e.target.value })}>
                              {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                            </select>
                            <label>Target Node</label>
                            <select value={newEdge.target_node_id}
                              onChange={e => setNewEdge({ ...newEdge, target_node_id: e.target.value })}>
                              <option value="">Select target...</option>
                              {nodes.filter(n => n.id !== newEdge.source_node_id).map(n => (
                                <option key={n.id} value={n.id}>{NODE_ICONS[n.node_type]} {n.label}</option>
                              ))}
                            </select>
                            <label>Label (optional)</label>
                            <input placeholder="e.g. is used in" value={newEdge.label}
                              onChange={e => setNewEdge({ ...newEdge, label: e.target.value })} />
                            <button className="login-submit-btn" style={{ marginTop: 8 }} onClick={createEdge}
                              disabled={!newEdge.source_node_id || !newEdge.target_node_id}>
                              Create Relationship
                            </button>
                          </div>
                        </div>
                      )}

                      {/* AI Suggestions */}
                      {showAISuggestions && (
                        <div className="okf-panel-content">
                          <div className="okf-panel-header">
                            <h3><Sparkles size={16} /> AI Suggestions</h3>
                            <button className="icon-btn icon-btn-sm" onClick={() => setShowAISuggestions(false)}><X size={14} /></button>
                          </div>
                          {aiLoading ? (
                            <div className="okf-ai-loading">
                              <div className="okf-ai-spinner" />
                              <p>Analyzing knowledge graph...</p>
                            </div>
                          ) : aiSuggestions ? (
                            <div className="okf-ai-results">
                              {aiSuggestions.summary && (
                                <p className="okf-ai-summary">{aiSuggestions.summary}</p>
                              )}
                              <label>Suggested Nodes</label>
                              {aiSuggestions.suggested_nodes.map((s, i) => (
                                <div key={i} className="okf-suggestion-card">
                                  <div className="okf-suggestion-info">
                                    <span className="okf-suggestion-label">{NODE_ICONS[s.node_type] || '🔷'} {s.label}</span>
                                    <span className="okf-suggestion-type">{s.node_type}</span>
                                  </div>
                                  <p>{s.description}</p>
                                  <button className="okf-action-btn okf-action-apply" onClick={() => applySuggestion(s)}>
                                    <Plus size={12} /> Add
                                  </button>
                                </div>
                              ))}
                              {aiSuggestions.suggested_edges.length > 0 && (
                                <>
                                  <label style={{ marginTop: 16 }}>Suggested Relationships</label>
                                  {aiSuggestions.suggested_edges.map((s, i) => (
                                    <div key={i} className="okf-suggestion-card">
                                      <span>{s.source_label} → {s.relationship_type} → {s.target_label}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          ) : (
                            <p style={{ color: 'var(--text-3)' }}>No suggestions available</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
