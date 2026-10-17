'use client';

/**
 * ChatHeader — top bar with mode indicator, inline model selector,
 * keyboard shortcut hints, and action buttons.
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Menu, Trash2, ChevronDown, Cpu } from 'lucide-react';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { getModels } from '@/lib/api';

const MODE_CONFIG = {
  chat: {
    title: 'Local LLM Chat',
    badge: 'Chat',
    badgeClass: 'badge-chat',
  },
  rag: {
    title: 'RAG Document Q&A',
    badge: 'RAG',
    badgeClass: 'badge-rag',
  },
  agent: {
    title: 'Multi-Agent Workflow',
    badge: 'Agent',
    badgeClass: 'badge-agent',
  },
} as const;

interface ModelInfo {
  name: string;
  size?: number | null;
  modified_at?: string | null;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)}GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)}MB`;
}

export default function ChatHeader() {
  const mode = useAppStore((s) => s.mode);
  const currentModel = useAppStore((s) => s.currentModel);
  const setCurrentModel = useAppStore((s) => s.setCurrentModel);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const clearMessages = useAppStore((s) => s.clearMessages);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const config = MODE_CONFIG[mode];

  useEffect(() => {
    let mounted = true;
    getModels()
      .then((data) => {
        if (mounted && data.models) setModels(data.models);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const handleModelSelect = (name: string) => {
    setCurrentModel(name);
    setShowDropdown(false);
  };

  return (
    <header className="chat-header">
      <div className="header-left">
        <button
          className="icon-btn icon-btn-md"
          onClick={toggleSidebar}
          title="Toggle Sidebar (Ctrl+/)"
        >
          <Menu size={18} />
        </button>
        <span className={`header-mode-badge ${config.badgeClass}`}>
          {config.badge}
        </span>
        <span className="header-title">{config.title}</span>

        {/* ── Inline Model Selector ── */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 8, fontSize: 12,
              fontFamily: 'var(--font-mono, monospace)',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            title="Switch model"
          >
            <Cpu size={12} />
            {currentModel || 'qwen3:8b'}
            <ChevronDown size={11} />
          </button>

          {showDropdown && (
            <>
              {/* backdrop */}
              <div
                onClick={() => setShowDropdown(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 998 }}
              />
              <div
                style={{
                  position: 'absolute', top: '110%', left: 0, zIndex: 999,
                  minWidth: 220, maxHeight: 300, overflowY: 'auto',
                  background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                  borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  padding: '6px 0',
                }}
              >
                <div style={{
                  padding: '6px 14px', fontSize: 10, fontWeight: 700,
                  color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  Installed Models
                </div>
                {models.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                    No models found — is Ollama running?
                  </div>
                ) : (
                  models.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => handleModelSelect(m.name)}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center',
                        justifyContent: 'space-between', gap: 10,
                        padding: '8px 14px', border: 'none', cursor: 'pointer',
                        background: m.name === currentModel
                          ? 'var(--bg-hover)' : 'transparent',
                        color: m.name === currentModel
                          ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontSize: 13, textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = m.name === currentModel ? 'var(--bg-hover)' : 'transparent')}
                    >
                      <span style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: m.name === currentModel ? 600 : 400,
                      }}>
                        {m.name === currentModel && '• '}
                        {m.name}
                      </span>
                      {m.size && (
                        <span style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          padding: '1px 6px', borderRadius: 6,
                          background: 'var(--bg-secondary)',
                        }}>
                          {formatSize(m.size)}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="header-right">
        <ThemeToggle />
        <button
          className="icon-btn icon-btn-md"
          onClick={() => { clearMessages(); }}
          title="New chat (Ctrl+Shift+N)"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </header>
  );
}
