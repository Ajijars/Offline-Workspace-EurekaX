'use client';

/**
 * System Monitoring Dashboard (/monitoring)
 * Live view of all backend services, system resources, and request metrics.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Server, Database, HardDrive, Cpu, Wifi,
  WifiOff, RefreshCw, Check, X, AlertTriangle,
} from 'lucide-react';
import { authFetch } from '@/lib/auth';
import AuthGuard from '@/components/auth/AuthGuard';

const API_BASE = '/api';

interface HealthData {
  status: string;
  version: string;
  services: {
    ollama?: { status: string; url?: string; model?: string; latency_ms?: number };
    qdrant?: { status: string; latency_ms?: number; vectors?: number; collection?: string };
    langgraph?: { status: string };
    sqlite?: { status: string; path?: string; size_mb?: number };
    system?: { disk_free_gb?: number; disk_total_gb?: number; disk_used_percent?: number; uploads_mb?: number; uploads_count?: number };
  };
  timestamp: string;
}

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'healthy') return <Check size={14} style={{ color: '#22c55e' }} />;
  if (status === 'degraded') return <AlertTriangle size={14} style={{ color: '#f59e0b' }} />;
  return <X size={14} style={{ color: '#ef4444' }} />;
};

const StatusBadge = ({ status }: { status: string }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: status === 'healthy' ? 'rgba(34,197,94,0.15)' :
                status === 'degraded' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
    color: status === 'healthy' ? '#22c55e' :
           status === 'degraded' ? '#f59e0b' : '#ef4444',
  }}>
    <StatusIcon status={status} />
    {status.charAt(0).toUpperCase() + status.slice(1)}
  </span>
);

function ServiceCard({ icon, name, data }: { icon: React.ReactNode; name: string; data: Record<string, any> | undefined }) {
  if (!data) return null;
  const { status, ...rest } = data;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 14, padding: '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: status === 'healthy' ? '#22c55e' : '#ef4444' }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{name}</span>
        </div>
        <StatusBadge status={status} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        {Object.entries(rest).map(([key, val]) => (
          <div key={key} style={{
            background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
              {key.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>
              {typeof val === 'number' ? (key.includes('mb') ? `${val} MB` : key.includes('gb') ? `${val} GB` : key.includes('ms') ? `${val}ms` : key.includes('percent') ? `${val}%` : val.toLocaleString()) : String(val)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonitoringContent() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/health`);
      if (res.ok) {
        setData(await res.json());
        setLastRefresh(new Date());
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 10_000); // refresh every 10s
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '32px 28px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Activity size={22} /> System Monitor
            </h1>
            {lastRefresh && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                Last updated: {lastRefresh.toLocaleTimeString()}
                {autoRefresh && ' · Auto-refresh every 10s'}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="icon-btn icon-btn-md"
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? 'Pause auto-refresh' : 'Enable auto-refresh'}
              style={{
                color: autoRefresh ? '#22c55e' : 'var(--text-muted)',
              }}
            >
              {autoRefresh ? <Wifi size={16} /> : <WifiOff size={16} />}
            </button>
            <button
              className="icon-btn icon-btn-md"
              onClick={() => { setLoading(true); load(); }}
              title="Refresh now"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Overall Status */}
        {data && (
          <div style={{
            background: data.status === 'healthy'
              ? 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.04))'
              : 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.04))',
            border: `1px solid ${data.status === 'healthy' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
            borderRadius: 14, padding: '18px 24px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                EurekaX v{data.version}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Overall system status
              </div>
            </div>
            <StatusBadge status={data.status} />
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div style={{ display: 'grid', gap: 14 }}>
            {[1,2,3,4].map((i) => <div key={i} className="skeleton skeleton-card" style={{ height: 140 }} />)}
          </div>
        )}

        {/* Service Cards */}
        {data && (
          <div style={{ display: 'grid', gap: 14 }}>
            <ServiceCard icon={<Cpu size={18} />} name="Ollama LLM" data={data.services.ollama} />
            <ServiceCard icon={<Database size={18} />} name="Qdrant Vectors" data={data.services.qdrant} />
            <ServiceCard icon={<Server size={18} />} name="LangGraph Agents" data={data.services.langgraph} />
            <ServiceCard icon={<Database size={18} />} name="SQLite Database" data={data.services.sqlite} />
            <ServiceCard icon={<HardDrive size={18} />} name="System Resources" data={data.services.system ? { status: 'healthy', ...data.services.system } : undefined} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  return <AuthGuard><MonitoringContent /></AuthGuard>;
}
