import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import {
  PageHeader,
  Button,
  Badge,
  StatusBadge,
  Alert
} from './ui/index.js';
import {
  Send,
  Bot,
  User,
  Wrench,
  Sparkles,
  ShoppingBag,
  ClipboardList,
  ArrowRightLeft,
  Loader2
} from 'lucide-react';

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
      <PageHeader
        title="Enterprise Chat Assistant"
        description="Multi-step natural language tool loop routed through gateway with server-side identity attribution."
        badge={<Badge variant="info">Gateway Aggregator Active</Badge>}
      />

      {/* Quick Demo Prompts */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleSendMessage("Create a product named 'Vintage Leather Jacket' with price 89.99")}
          disabled={isLoading}
          leftIcon={<ShoppingBag size={13} style={{ color: '#f472b6' }} />}
          style={{ borderRadius: '9999px', fontSize: '12px' }}
        >
          Create Product ($89.99)
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => handleSendMessage('What orders came in today?')}
          disabled={isLoading}
          leftIcon={<ClipboardList size={13} style={{ color: 'var(--accent-success)' }} />}
          style={{ borderRadius: '9999px', fontSize: '12px' }}
        >
          What orders came in today?
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => handleSendMessage('Check stock for SKU-HOODIE-M and estimate shipping to CA')}
          disabled={isLoading}
          leftIcon={<ArrowRightLeft size={13} style={{ color: 'var(--accent-primary)' }} />}
          style={{ borderRadius: '9999px', fontSize: '12px' }}
        >
          Stock + Shipping (CA)
        </Button>
      </div>

      {/* Chat Messages Container */}
      <div
        className="console-card"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '16px',
          background: 'var(--bg-canvas)'
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
                {isUser ? <User size={12} /> : <Bot size={12} />}
                <span>{isUser ? 'You' : 'Gateway Agent'} • {new Date(msg.timestamp).toLocaleTimeString()}</span>
                {!isUser && msg.isDemoMode && (
                  <Badge variant="warning">
                    Demo Mode: Mock LLM
                  </Badge>
                )}
              </div>

              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: isUser ? 'var(--accent-primary)' : 'var(--bg-surface)',
                  border: isUser ? 'none' : '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  boxShadow: isUser ? 'var(--shadow-sm)' : 'none'
                }}
              >
                {msg.content}
              </div>

              {/* EXPLICIT TOOLS CALLED TRACE */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div
                  style={{
                    marginTop: '4px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontWeight: 600 }}>
                      <Wrench size={13} style={{ color: 'var(--accent-primary)' }} />
                      <span>Tools Executed via Gateway ({msg.toolCalls.length})</span>
                    </div>
                    {msg.stepCount && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Steps: {msg.stepCount}
                      </span>
                    )}
                  </div>

                  {msg.toolCalls.map((tc, idx) => (
                    <div key={idx} style={{ marginTop: idx > 0 ? '10px' : '0', borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: idx > 0 ? '8px' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {tc.upstreamSlug && (
                          <Badge variant="accent">
                            {tc.upstreamSlug}
                          </Badge>
                        )}
                        <code style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{tc.toolName}</code>
                        <StatusBadge status={tc.status === 'error' ? 'error' : 'success'} />
                        {tc.durationMs !== undefined && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {tc.durationMs}ms
                          </span>
                        )}
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                          attributed to {user?.email}
                        </span>
                      </div>

                      {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Args: <code style={{ color: 'var(--text-primary)', background: 'var(--bg-canvas)', padding: '1px 5px', borderRadius: '3px' }}>{JSON.stringify(tc.arguments)}</code>
                        </div>
                      )}

                      <pre
                        style={{
                          marginTop: '6px',
                          padding: '8px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          borderRadius: 'var(--radius-sm)',
                          color: tc.status === 'error' ? 'var(--accent-danger)' : 'var(--accent-success)',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          overflowX: 'auto',
                          maxHeight: '120px',
                          border: '1px solid var(--border-subtle)'
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
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <Loader2 size={14} className="spin" style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Agent orchestrating MCP tools...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error state banner */}
      {error && (
        <Alert
          variant="danger"
          title="Agent Dispatch Error"
          onDismiss={() => setError(null)}
          style={{ marginBottom: '12px' }}
        >
          {error}
        </Alert>
      )}

      {/* Input Bar */}
      <form onSubmit={handleFormSubmit} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question or request a tool action (e.g., 'check stock for SKU-HOODIE-M')..."
          disabled={isLoading}
          aria-label="Chat message prompt"
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.2)';
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading || !input.trim()}
          isLoading={isLoading}
          leftIcon={<Send size={14} />}
          style={{ paddingLeft: '20px', paddingRight: '20px' }}
        >
          Send
        </Button>
      </form>
    </div>
  );
};
