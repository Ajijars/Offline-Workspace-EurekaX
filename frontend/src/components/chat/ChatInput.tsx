'use client';

/**
 * ChatInput — auto-resizing textarea with send button, and keyboard shortcuts.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Mic, MicOff, ImagePlus, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { MAX_MESSAGE_LENGTH } from '@/lib/constants';

interface ChatInputProps {
  onSend: (text: string, images?: string[]) => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>([]);
  
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

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
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
  }, [isListening, autoResize]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          // Keep only the base64 part, e.g. "iVBORw0KGgo..."
          const b64 = (ev.target.result as string).split(',')[1];
          setImages(prev => [...prev, b64]);
        }
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text && !images.length) return;
    if (isStreaming) return;
    onSend(text, images);
    el.value = '';
    el.style.height = 'auto';
    setImages([]);
  }, [onSend, isStreaming, images]);

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
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexWrap: 'wrap' }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={`data:image/jpeg;base64,${img}`} alt="upload" style={{ height: 60, borderRadius: 4 }} />
              <button onClick={() => removeImage(i)} style={{ position: 'absolute', top: -4, right: -4, background: 'var(--bg-card)', borderRadius: '50%', padding: 2, cursor: 'pointer', border: '1px solid var(--border)' }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
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
        <input 
          type="file" 
          accept="image/*" 
          multiple 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleImageUpload} 
        />
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach Image"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 8px' }}
        >
          <ImagePlus size={18} />
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
