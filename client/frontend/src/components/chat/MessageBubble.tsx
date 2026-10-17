'use client';

/**
 * MessageBubble — renders a single chat message (user or assistant).
 *
 * User messages: gradient background, right-aligned, plain text.
 * Assistant messages: glass card, avatar, markdown content, optional stats/sources.
 */

import { useState, useCallback } from 'react';
import { Layers, Play, Square } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import MarkdownRenderer from './MarkdownRenderer';
import SourceChips from '@/components/rag/SourceChips';
import AgentTrace from '@/components/agent/AgentTrace';

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove?: (id: string) => void;
}

export default function MessageBubble({ message, onApprove }: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleSpeech = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      // Strip basic markdown syntax for speech
      const textToSpeak = message.content
        .replace(/```[\s\S]*?```/g, 'Code block omitted for brevity.') // remove code blocks
        .replace(/[#*`_]/g, ''); // remove markdown formatting characters

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  }, [message.content, isPlaying]);

  if (message.role === 'user') {
    return (
      <div className="message user">
        <div className="message-bubble">{message.content}</div>
      </div>
    );
  }

  // Agent-specific message layout
  if (message.mode === 'agent' && (message.agentSteps?.length || message.intent)) {
    return (
      <div className="message assistant agent-message">
        <div className="message-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        </div>
        <div className="message-body">
          {/* Intent + Agent badges */}
          <div className="agent-header">
            <span className="agent-badge agent-badge-supervisor">
              Intent: {message.intent || 'detecting...'}
            </span>
            <span className="agent-badge agent-badge-active">
              Agent: {message.activeAgent || 'routing...'}
            </span>
          </div>

          {/* Execution trace */}
          {message.agentSteps && message.agentSteps.length > 0 && (
            <AgentTrace steps={message.agentSteps} />
          )}

          {/* Answer */}
          {message.content && (
            <div className="agent-answer">
              <MarkdownRenderer content={message.content} />
              
              {!message.isStreaming && (
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={toggleSpeech}
                    className="action-btn"
                    title={isPlaying ? "Stop speech" : "Read aloud"}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    {isPlaying ? <Square size={14} /> : <Play size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Streaming placeholder */}
          {message.isStreaming && !message.content && (
            <div className="agent-answer" style={{ opacity: 0.5 }}>
              <span>Processing...</span>
            </div>
          )}

          {/* HITL Pause Action */}
          {message.isPaused && (
            <div className="hitl-actions" style={{ marginTop: '12px', padding: '12px', background: 'rgba(255, 165, 0, 0.1)', border: '1px solid orange', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 8px 0', color: 'orange', fontSize: '13px' }}>
                ⚠️ Human-in-the-loop: Agent is paused and waiting for your approval to proceed with: <strong>{message.pendingNode}</strong>
              </p>
              <button
                onClick={() => onApprove?.(message.id)}
                style={{ background: 'orange', color: '#000', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Approve & Continue
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Standard assistant message (Chat / RAG)
  return (
    <div className="message assistant">
      <div className="message-avatar">
        <Layers size={16} />
      </div>
      <div className="message-body">
        <div className="message-bubble">
          {message.content ? (
            <MarkdownRenderer content={message.content} />
          ) : message.isStreaming ? (
            <span style={{ opacity: 0.4 }}>Thinking...</span>
          ) : null}
        </div>

        {/* RAG sources */}
        {message.sources && message.sources.length > 0 && (
          <SourceChips sources={message.sources} />
        )}

        {/* Stats row */}
        {message.stats && (
          <div className="message-stats">
            {message.stats.tokens_per_second && (
              <span className="stat-item">
                ⚡ {message.stats.tokens_per_second.toFixed(1)} tok/s
              </span>
            )}
            {message.stats.model && (
              <span className="stat-item">📝 {message.stats.model}</span>
            )}
            {message.sources && message.sources.length > 0 && (
              <span className="stat-item">📚 {message.sources.length} sources</span>
            )}
            
            <button
              onClick={toggleSpeech}
              title={isPlaying ? "Stop speech" : "Read aloud"}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}
            >
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
            </button>
          </div>
        )}
        
        {/* Play button when no stats */}
        {!message.stats && !message.isStreaming && message.content && (
          <div className="message-stats" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={toggleSpeech}
              title={isPlaying ? "Stop speech" : "Read aloud"}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
            >
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
