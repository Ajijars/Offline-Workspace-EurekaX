'use client';

/**
 * ChatInput — auto-resizing textarea with send button, and keyboard shortcuts.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Mic, MicOff } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { MAX_MESSAGE_LENGTH } from '@/lib/constants';

interface ChatInputProps {
  onSend: (text: string) => void;
}

const MODE_PLACEHOLDER = {
  chat: 'Type your message...',
  rag: 'Ask a question about your documents...',
  agent: 'Ask anything — agents will handle it automatically...',
} as const;

export default function ChatInput({ onSend }: ChatInputProps) {
  const mode = useAppStore((s) => s.mode);
  const isStreaming = useAppStore((s) => s.isStreaming);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Voice state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize Web Speech API
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }
          if (finalTranscript && textareaRef.current) {
            // Append with a space if there's already text
            const currentVal = textareaRef.current.value;
            textareaRef.current.value = currentVal ? `${currentVal} ${finalTranscript}` : finalTranscript;
            autoResize();
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

  const toggleListen = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (textareaRef.current) {
        textareaRef.current.value = ''; // clear before listening optionally
        autoResize();
      }
      recognitionRef.current?.start();
      setIsListening(true);
    }
  }, [isListening]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }, []);

  const handleSend = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text || isStreaming) return;
    onSend(text);
    el.value = '';
    el.style.height = 'auto';
  }, [onSend, isStreaming]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="input-area">
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={MODE_PLACEHOLDER[mode]}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          onInput={autoResize}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button
          className={`mic-btn ${isListening ? 'listening' : ''}`}
          onClick={toggleListen}
          title={isListening ? "Stop listening" : "Start voice input"}
          style={{ 
            background: 'none', border: 'none', color: isListening ? '#ef4444' : 'var(--text-muted)', 
            cursor: 'pointer', padding: '0 8px' 
          }}
        >
          {isListening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={isStreaming}
          title="Send"
        >
          <Send size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span className="kbd">Enter</span> Send
          &nbsp;·&nbsp;
          <span className="kbd">Shift+Enter</span> New line
          &nbsp;·&nbsp;
          Mode: <strong style={{ color: 'var(--text-secondary)' }}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</strong>
        </p>
      </div>
    </div>
  );
}
