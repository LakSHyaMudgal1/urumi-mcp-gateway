import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

export const ChatAgentView: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello ${user?.name || 'there'}! I'm the Urumi MCP Gateway chat assistant. I have aggregated access to all internal cluster tools across WooCommerce, Inventory, and Shipping. How can I help you today?`,
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      // Build lightweight conversation history
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await api.sendChatMessage(text.trim(), history);

      const assistantMessage: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        timestamp: res.timestamp || new Date().toISOString(),
        toolCalls: res.toolCalls,
        stepCount: res.stepCount,
        provider: res.provider,
        model: res.model,
        isDemoMode: res.isDemoMode
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'Chat agent failed to respond');
      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Error: Unable to complete your request. (${err.message})`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 24px 48px', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Enterprise Chat Assistant
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Multi-step natural language tool loop routed through gateway with server-side identity attribution.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            Gateway Aggregator Active
          </span>
        </div>
      </div>

      {/* Quick Demo Prompts */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          onClick={() => handleSendMessage("Create a product named 'Vintage Leather Jacket' with price 89.99")}
          disabled={isLoading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '999px',
            background: 'rgba(236, 72, 153, 0.1)',
            border: '1px solid rgba(236, 72, 153, 0.3)',
            color: '#f472b6',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          🛍️ Create Product ($89.99)
        </button>

        <button
          onClick={() => handleSendMessage('What orders came in today?')}
          disabled={isLoading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '999px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          📋 What orders came in today?
        </button>

        <button
          onClick={() => handleSendMessage('Check stock for SKU-HOODIE-M and estimate shipping to CA')}
          disabled={isLoading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '999px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#a5b4fc',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          🔄 Combined: Stock + Shipping (CA)
        </button>
      </div>

      {/* Chat Messages Container */}
      <div
        className="glass-panel"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          borderRadius: '14px',
          marginBottom: '16px'
        }}
      >
        {messages.map(msg => {
          const isUser = msg.role === 'user';

          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{isUser ? 'You' : 'Gateway Agent'} • {new Date(msg.timestamp).toLocaleTimeString()}</span>
                {!isUser && msg.isDemoMode && (
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      background: 'rgba(234, 179, 8, 0.15)',
                      color: '#facc15',
                      border: '1px solid rgba(234, 179, 8, 0.3)',
                      fontWeight: 600
                    }}
                  >
                    Demo Mode: Mock LLM
                  </span>
                )}
              </div>

              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: isUser ? 'var(--accent-primary)' : 'rgba(15, 23, 42, 0.7)',
                  border: isUser ? 'none' : '1px solid var(--border-subtle)',
                  color: '#ffffff',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  boxShadow: isUser ? '0 4px 12px var(--accent-glow)' : 'none'
                }}
              >
                {msg.content}
              </div>

              {/* EXPLICIT TOOLS CALLED TRACE */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div
                  style={{
                    marginTop: '4px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a5b4fc', fontWeight: 600 }}>
                      <span>⚙️</span>
                      <span>Tools Executed via Gateway ({msg.toolCalls.length})</span>
                    </div>
                    {msg.stepCount && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Steps: {msg.stepCount}
                      </span>
                    )}
                  </div>

                  {msg.toolCalls.map((tc, idx) => (
                    <div key={idx} style={{ marginTop: idx > 0 ? '10px' : '0', borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none', paddingTop: idx > 0 ? '8px' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {tc.upstreamSlug && (
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              background: 'rgba(99, 102, 241, 0.2)',
                              color: '#a5b4fc',
                              textTransform: 'uppercase',
                              fontWeight: 700
                            }}
                          >
                            {tc.upstreamSlug}
                          </span>
                        )}
                        <code style={{ color: '#38bdf8', fontWeight: 600 }}>{tc.toolName}</code>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: tc.status === 'error' ? '#f87171' : '#34d399'
                          }}
                        >
                          ● {tc.status || 'success'}
                        </span>
                        {tc.durationMs !== undefined && (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {tc.durationMs}ms
                          </span>
                        )}
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          attributed to {user?.email}
                        </span>
                      </div>

                      {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Args: <code style={{ color: '#e2e8f0', background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px' }}>{JSON.stringify(tc.arguments)}</code>
                        </div>
                      )}

                      <pre
                        style={{
                          marginTop: '6px',
                          padding: '8px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          borderRadius: '4px',
                          color: tc.status === 'error' ? '#fca5a5' : '#34d399',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          overflowX: 'auto',
                          maxHeight: '120px'
                        }}
                      >
                        {JSON.stringify(tc.result?.content || tc.result, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '14px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Agent orchestrating MCP tools...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error state banner */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            marginBottom: '12px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>⚠️ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleFormSubmit} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question or request a tool action (e.g., 'check stock for SKU-HOODIE-M')..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 18px',
            borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: '12px 24px',
            borderRadius: '10px',
            background: 'var(--accent-primary)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '14px',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !input.trim() ? 0.6 : 1,
            boxShadow: '0 4px 12px var(--accent-glow)'
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
};
