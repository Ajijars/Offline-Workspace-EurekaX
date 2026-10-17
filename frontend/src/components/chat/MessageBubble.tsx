'use client';

/**
 * MessageBubble — renders a single chat message (user or assistant).
 *
 * User messages: gradient background, right-aligned, plain text.
 * Assistant messages: glass card, avatar, markdown content, optional stats/sources.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [userToggledOpen, setUserToggledOpen] = useState<boolean | null>(null);
  const thinkContainerRef = useRef<HTMLDivElement>(null);

  const toggleSpeech = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      const textToSpeak = message.content
        .replace(/```[\s\S]*?```/g, 'Code block omitted for brevity.')
        .replace(/[#*`_]/g, '');

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    }
  }, [message.content, isPlaying]);

  // Parse `<think>` tags from reasoning models
  const rawContent = message.content || '';
  let thinkContent = '';
  let mainContent = rawContent;

  const thinkMatch = rawContent.match(/<think>([\s\S]*?)(<\/think>|$)/i);
  if (thinkMatch) {
    // Preserve trailing whitespace while streaming so words don't bunch up
    thinkContent = message.isStreaming ? thinkMatch[1].replace(/^\s+/, '') : thinkMatch[1].trim();
    const afterThink = rawContent.replace(/<think>[\s\S]*?(<\/think>|$)/i, '');
    mainContent = message.isStreaming ? afterThink.replace(/^\s+/, '') : afterThink.trim();
  }

  // Auto-collapse think block only when streaming finishes (unless user toggled)
  const isStillThinking = message.isStreaming && thinkContent && !mainContent;
  const isThinkOpen = userToggledOpen !== null ? userToggledOpen : (message.isStreaming || !mainContent);

  // Auto-scroll thinking container to bottom as words arrive live
  useEffect(() => {
    if (isStillThinking && thinkContainerRef.current) {
      thinkContainerRef.current.scrollTop = thinkContainerRef.current.scrollHeight;
    }
  }, [thinkContent, isStillThinking]);

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
          {(thinkContent || mainContent) && (
            <div className="agent-answer">
              {thinkContent && (
                <details 
                  className="think-block" 
                  style={{ marginBottom: mainContent ? '12px' : '0' }}
                  open={isThinkOpen}
                  onToggle={(e) => setUserToggledOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', userSelect: 'none' }}>
                    <span style={{ marginLeft: 6 }}>
                      {isStillThinking ? '🧠 Thinking...' : '▶ Thinking Process'}
                    </span>
                  </summary>
                  <div ref={thinkContainerRef} style={{ marginTop: 8, padding: '8px 12px', borderLeft: '2px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
                    {thinkContent}
                    {isStillThinking && <span className="thinking-cursor">▌</span>}
                  </div>
                </details>
              )}
              {mainContent && <MarkdownRenderer content={mainContent} />}
              
              {!message.isStreaming && mainContent && (
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
          {message.isStreaming && !thinkContent && !mainContent && (
            <div className="agent-answer" style={{ opacity: 0.5, display: 'flex', gap: '4px', alignItems: 'center' }}>
              <div className="typing-dot"></div><div className="typing-dot"></div><div className="typing-dot"></div>
              <span style={{ marginLeft: 8 }}>Thinking...</span>
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
          {thinkContent && (
            <details 
              className="think-block" 
              style={{ marginBottom: mainContent ? '12px' : '0' }}
              open={isThinkOpen}
              onToggle={(e) => setUserToggledOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', userSelect: 'none' }}>
                <span style={{ marginLeft: 6 }}>
                  {isStillThinking ? '🧠 Thinking...' : '▶ Thinking Process'}
                </span>
              </summary>
              <div ref={thinkContainerRef} style={{ marginTop: 8, padding: '8px 12px', borderLeft: '2px solid var(--border)', color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
                {thinkContent}
                {isStillThinking && <span className="thinking-cursor">▌</span>}
              </div>
            </details>
          )}

          {mainContent ? (
            <MarkdownRenderer content={mainContent} />
          ) : message.isStreaming && !thinkContent ? (
            <div className="typing-indicator-small" style={{ opacity: 0.5, display: 'flex', gap: '4px', alignItems: 'center' }}>
              <div className="typing-dot"></div><div className="typing-dot"></div><div className="typing-dot"></div>
              <span style={{ marginLeft: 8 }}>Thinking...</span>
            </div>
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
