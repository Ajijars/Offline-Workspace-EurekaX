'use client';

/**
 * Chat History Page (/history) — persistent conversation list.
 * Lists all past conversations with search, delete, and new chat actions.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Plus, Trash2, Search, Bot, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { authFetch } from '@/lib/auth';
import { useAppStore } from '@/stores/appStore';
import { useToast } from '@/hooks/useToast';
import AuthGuard from '@/components/auth/AuthGuard';

const API_BASE = '/api';

interface Conversation {
  id: string;
  title: string;
  mode: 'chat' | 'rag' | 'agent';
  model?: string;
  message_count: number;
  updated_at: string;
}

const MODE_ICONS: Record<string, React.ReactNode> = {
  chat: <MessageSquare size={14} />,
  rag: <FileText size={14} />,
  agent: <Bot size={14} />,
};

const MODE_COLORS: Record<string, string> = {
  chat: '#3b82f6',
  rag: '#22c55e',
  agent: '#a855f7',
};

function formatRelative(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function SkeletonRow() {
  return (
    <div className="skeleton-message" style={{ borderRadius: 12, padding: '14px 18px' }}>
      <div className="skeleton skeleton-avatar" style={{ borderRadius: 8, width: 34, height: 34 }} />
      <div className="skeleton-message-body">
        <div className="skeleton skeleton-title" style={{ width: '50%' }} />
        <div className="skeleton skeleton-text" style={{ width: '30%' }} />
      </div>
    </div>
  );
}

function HistoryContent() {
  const router = useRouter();
  const clearMessages = useAppStore((s) => s.clearMessages);
  const setMode = useAppStore((s) => s.setMode);
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<{ total_conversations: number; total_messages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        authFetch(`${API_BASE}/conversations?limit=100`),
        authFetch(`${API_BASE}/conversations/stats`),
      ]);
      if (cRes.ok) setConversations((await cRes.json()).conversations ?? []);
      if (sRes.ok) setStats(await sRes.json());
    } catch {
      toast.error('Failed to load history', 'Make sure the backend is running');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNew = async () => {
    try {
      await authFetch(`${API_BASE}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Conversation', mode: 'chat' }),
      });
    } finally {
      clearMessages();
      setMode('chat');
      router.push('/');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      const res = await authFetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations((p) => p.filter((c) => c.id !== id));
        toast.success('Deleted');
      } else {
        toast.error('Delete failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setDeleting(null);
    }
  };

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '32px 24px', maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Chat History</h1>
          {stats && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {stats.total_conversations} conversations · {stats.total_messages} messages
            </p>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={handleNew}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <Plus size={15} /> New Chat
        </button>
      </div>

      {/* Stats strip */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          {(['chat', 'rag', 'agent'] as const).map((m) => (
            <div key={m} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ color: MODE_COLORS[m] }}>{MODE_ICONS[m]}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {conversations.filter((c) => c.mode === m).length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m} sessions</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          className="form-input"
          placeholder="Search conversations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: 34, width: '100%' }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1,2,3,4,5].map((i) => <SkeletonRow key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
          <MessageSquare size={42} style={{ marginBottom: 14, opacity: 0.25 }} />
          <p style={{ fontSize: 14 }}>
            {search ? 'No matching conversations' : 'No history yet — start your first chat!'}
          </p>
          <button className="btn btn-primary" onClick={handleNew} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Start Chat
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {filtered.map((conv) => (
            <div
              key={conv.id}
              onClick={() => router.push('/')}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 16px', background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)', borderRadius: 12,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: 'var(--bg-secondary)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                color: MODE_COLORS[conv.mode],
              }}>
                {MODE_ICONS[conv.mode]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontWeight: 600, fontSize: 14,
                  color: 'var(--text-primary)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {conv.title}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {conv.message_count} msgs · <span style={{ textTransform: 'capitalize' }}>{conv.mode}</span> · {formatRelative(conv.updated_at)}
                </p>
              </div>
              {conv.model && (
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 20,
                  background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                  fontFamily: 'monospace', flexShrink: 0,
                }}>
                  {conv.model.split(':')[0]}
                </span>
              )}
              <button
                onClick={(e) => handleDelete(conv.id, e)}
                disabled={deleting === conv.id}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 5, borderRadius: 6, flexShrink: 0,
                  color: 'var(--text-muted)', opacity: deleting === conv.id ? 0.3 : 0.6,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#ef4444'; b.style.opacity = '1'; }}
                onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--text-muted)'; b.style.opacity = '0.6'; }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, marginTop: 32 }}>
        <span className="kbd">Ctrl+Shift+N</span> &nbsp;New chat &nbsp;·&nbsp; <span className="kbd">Ctrl+/</span> &nbsp;Toggle sidebar
      </p>
    </div>
  );
}

export default function HistoryPage() {
  return <AuthGuard><HistoryContent /></AuthGuard>;
}
