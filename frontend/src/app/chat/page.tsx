'use client';

/**
 * Main Chat Page — assembles Sidebar + ChatHeader + Messages + ChatInput.
 * Renders WelcomeScreen when no messages exist.
 * In RAG mode, shows a collapsible document panel beside the chat area.
 * Protected by AuthGuard — redirects to /login if unauthenticated.
 */

import { useEffect, useRef } from 'react';
import AmbientBackground from '@/components/layout/AmbientBackground';
import Sidebar from '@/components/layout/Sidebar';
import ChatHeader from '@/components/layout/ChatHeader';
import WelcomeScreen from '@/components/chat/WelcomeScreen';
import MessageBubble from '@/components/chat/MessageBubble';
import TypingIndicator from '@/components/chat/TypingIndicator';
import ChatInput from '@/components/chat/ChatInput';
import AuthGuard from '@/components/auth/AuthGuard';
import RAGPanel from '@/components/rag/RAGPanel';
import AgentPanel from '@/components/agent/AgentPanel';
import { useChat } from '@/hooks/useChat';
import { useHealth } from '@/hooks/useHealth';
import { useAppStore } from '@/stores/appStore';

export default function HomePage() {
  const { messages, isStreaming, sendMessage, clearMessages, resumeAgentMessage } = useChat();
  const mode = useAppStore((s) => s.mode);
  useHealth(); // Start health polling

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter messages to isolate each mode's conversation (Chat vs RAG vs Agent)
  const currentMessages = messages.filter((m) => m.mode === mode);
  const hasMessages = currentMessages.length > 0;

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  return (
    <AuthGuard>
      <AmbientBackground />
      <div className="app-layout">
        <Sidebar />
        <div className="chat-with-panel" style={{ display: 'flex', flex: 1, minWidth: 0 }}>
          {/* RAG Document Panel — only in RAG mode */}
          {mode === 'rag' && <RAGPanel />}
          
          {/* Agent File Panel — only in Agent mode */}
          {mode === 'agent' && <AgentPanel />}

          <main className="chat-main">
            <ChatHeader />

            <div className="messages-area">
              {!hasMessages ? (
                <WelcomeScreen onSend={sendMessage} />
              ) : (
                <>
                  {currentMessages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} onApprove={resumeAgentMessage} />
                  ))}
                  {isStreaming && !currentMessages.some((m) => m.isStreaming) && (
                    <TypingIndicator />
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <ChatInput onSend={sendMessage} />
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
