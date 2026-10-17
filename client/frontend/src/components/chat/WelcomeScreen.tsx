'use client';

/**
 * WelcomeScreen — premium enterprise hero with capability cards,
 * keyboard hints, and quick-start prompts.
 */

import { MessageSquare, FileText, Code, Bot, Layers, Zap, Search, BarChart3, Image } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';

interface CapCard {
  icon: React.ElementType;
  title: string;
  desc: string;
  prompt: string;
  mode: 'chat' | 'rag' | 'agent';
  gradient: string;
}

const CAPABILITIES: CapCard[] = [
  {
    icon: MessageSquare,
    title: 'Ask Anything',
    desc: 'General Q&A powered by local LLM',
    prompt: 'What is machine learning and how does it work?',
    mode: 'chat',
    gradient: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))',
  },
  {
    icon: Search,
    title: 'Search Documents',
    desc: 'RAG-powered document intelligence',
    prompt: 'What does the document say about the main topic?',
    mode: 'rag',
    gradient: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
  },
  {
    icon: Code,
    title: 'Run Code',
    desc: 'Generate & execute Python in sandbox',
    prompt: 'Write Python to calculate the first 20 Fibonacci numbers and print them',
    mode: 'agent',
    gradient: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0.04))',
  },
  {
    icon: BarChart3,
    title: 'Analyze Data',
    desc: 'CSV, Excel & database analysis',
    prompt: 'Analyze the uploaded data file and give me a statistical summary',
    mode: 'agent',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))',
  },
  {
    icon: Bot,
    title: 'File Manager',
    desc: 'Read, write & manage workspace files',
    prompt: 'List the files in the workspace directory',
    mode: 'agent',
    gradient: 'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(236,72,153,0.04))',
  },
  {
    icon: Image,
    title: 'Read Images',
    desc: 'Extract text from images with OCR',
    prompt: 'Extract and summarize the text from the uploaded image',
    mode: 'agent',
    gradient: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(14,165,233,0.04))',
  },
];

interface WelcomeScreenProps {
  onSend: (text: string) => void;
}

export default function WelcomeScreen({ onSend }: WelcomeScreenProps) {
  const setMode = useAppStore((s) => s.setMode);
  const currentModel = useAppStore((s) => s.currentModel);

  const handleClick = (card: CapCard) => {
    setMode(card.mode);
    setTimeout(() => onSend(card.prompt), 80);
  };

  return (
    <div className="welcome-screen">
      {/* Hero */}
      <div className="welcome-icon">
        <Layers size={28} />
      </div>
      <h2 className="welcome-title">EurekaX AI Assistant</h2>
      <p className="welcome-subtitle">
        Enterprise AI platform — 100% offline, powered by <code style={{
          fontSize: '0.8em', padding: '1px 6px', borderRadius: 4,
          background: 'var(--bg-secondary)', fontFamily: 'var(--font-mono, monospace)',
        }}>{currentModel || 'qwen3:8b'}</code>
      </p>

      {/* Capability Cards */}
      <div className="welcome-prompts" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 10,
        maxWidth: 680,
        margin: '0 auto',
      }}>
        {CAPABILITIES.map((card) => (
          <button
            key={card.title}
            className="welcome-prompt-btn"
            onClick={() => handleClick(card)}
            style={{
              background: card.gradient,
              transition: 'all 0.2s',
              border: '1px solid transparent',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <card.icon size={16} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{card.title}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{card.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Keyboard hints */}
      <div style={{
        marginTop: 28, display: 'flex', gap: 20, justifyContent: 'center',
        flexWrap: 'wrap',
      }}>
        {[
          { keys: 'Enter', desc: 'Send' },
          { keys: 'Shift+Enter', desc: 'New line' },
          { keys: 'Ctrl+/', desc: 'Sidebar' },
          { keys: 'Ctrl+Shift+N', desc: 'New chat' },
        ].map(({ keys, desc }) => (
          <span key={keys} className="shortcut-hint">
            <span className="kbd">{keys}</span>
            <span>{desc}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
