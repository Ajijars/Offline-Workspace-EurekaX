'use client';

/**
 * AgentPanel — Inline file upload panel that appears beside the chat input
 * when Agent mode is active. Shows upload zone for CSV/JSON files.
 */

import { useState } from 'react';
import { Database, ChevronLeft, ChevronRight } from 'lucide-react';
import AgentFileUpload from './AgentFileUpload';
import { useAppStore } from '@/stores/appStore';

export default function AgentPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const agentFiles = useAppStore(s => s.agentFiles);

  return (
    <div className={`rag-panel ${collapsed ? 'rag-panel-collapsed' : ''}`}>
      {/* Toggle button */}
      <button
        className="rag-panel-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand agent panel' : 'Collapse agent panel'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {collapsed ? (
        <div className="rag-panel-collapsed-content" onClick={() => setCollapsed(false)}>
          <Database size={20} />
          <span className="rag-panel-collapsed-badge">{agentFiles.length}</span>
        </div>
      ) : (
        <div className="rag-panel-content">
          <div className="rag-panel-header">
            <Database size={16} />
            <span>Agent Files</span>
            <span className="rag-panel-count">{agentFiles.length}</span>
          </div>

          <div style={{ padding: '0 16px 16px', flex: 1, overflowY: 'auto' }}>
            <AgentFileUpload />
          </div>
        </div>
      )}
    </div>
  );
}
