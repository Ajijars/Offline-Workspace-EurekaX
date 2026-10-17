'use client';

/**
 * RAGPanel — Inline document manager panel that appears beside the chat input
 * when RAG mode is active. Shows upload zone + indexed documents list.
 */

import { useState } from 'react';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import DocumentUpload from './DocumentUpload';
import DocumentList from './DocumentList';
import { useDocuments } from '@/hooks/useDocuments';

export default function RAGPanel() {
  const { documents, uploading, uploadProgress, upload, remove } = useDocuments();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`rag-panel ${collapsed ? 'rag-panel-collapsed' : ''}`}>
      {/* Toggle button */}
      <button
        className="rag-panel-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand document panel' : 'Collapse document panel'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {collapsed ? (
        <div className="rag-panel-collapsed-content" onClick={() => setCollapsed(false)}>
          <FileText size={20} />
          <span className="rag-panel-collapsed-badge">{documents.length}</span>
        </div>
      ) : (
        <div className="rag-panel-content">
          <div className="rag-panel-header">
            <FileText size={16} />
            <span>Documents</span>
            <span className="rag-panel-count">{documents.length}</span>
          </div>

          <DocumentUpload
            onUpload={upload}
            uploading={uploading}
            uploadProgress={uploadProgress}
          />

          <div className="rag-panel-docs">
            <DocumentList documents={documents} onDelete={remove} />
          </div>
        </div>
      )}
    </div>
  );
}
