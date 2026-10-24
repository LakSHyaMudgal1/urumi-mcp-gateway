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
        toolCalls: res.toolCalls
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
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Enterprise Chat Assistant
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
          Natural language tool execution loop with full user attribution and audit logging.
        </p>
      </div>

      {/* Quick Demo Prompts */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          onClick={() => handleSendMessage('Check stock for SKU-HOODIE-M')}
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
          🔍 Check stock for SKU-HOODIE-M
        </button>

        <button
          onClick={() => handleSendMessage('Estimate shipping to US')}
          disabled={isLoading}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            borderRadius: '999px',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          📦 Estimate shipping to US
        </button>

        <button
          onClick={() => handleSendMessage('What store tools are available?')}
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
          🛠 List available tools
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
                  alignSelf: isUser ? 'flex-end' : 'flex-start'
                }}
              >
                {isUser ? 'You' : 'Gateway Agent'} • {new Date(msg.timestamp).toLocaleTimeString()}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a5b4fc', fontWeight: 600, marginBottom: '6px' }}>
                    <span>⚙️</span>
                    <span>Tools Executed ({msg.toolCalls.length})</span>
                  </div>

                  {msg.toolCalls.map((tc, idx) => (
                    <div key={idx} style={{ marginTop: idx > 0 ? '8px' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ color: '#38bdf8', fontWeight: 600 }}>{tc.toolName}</code>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>attributed to {user?.email}</span>
                      </div>
                      <pre
                        style={{
                          marginTop: '4px',
                          padding: '8px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          borderRadius: '4px',
                          color: '#34d399',
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
