import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../api/queryClient.js';
import { motion } from 'motion/react';
import { ChatMessage, ToolDefinition } from '../types/index.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { usePrefersReducedMotion, motionTokens } from '../theme/motion.js';
import {
  PageHeader,
  Button,
  Badge
} from './ui/index.js';
import {
  Bot,
  User,
  ShoppingBag,
  ClipboardList,
  ArrowRightLeft,
  Package,
  Layers,
  ArrowDown,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  Activity
} from 'lucide-react';
import {
  SafeMarkdown,
  ToolStepCard,
  ChatStatusIndicator,
  ChatErrorBanner,
  ChatComposer,
  classifyChatError,
  deriveStarterPrompts,
  isScrolledNearBottom,
  ClassifiedError
} from './chat/index.js';

export const ChatAgentView: React.FC = () => {
  const { user } = useAuth();
  const prefersReduced = usePrefersReducedMotion();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello **${user?.name || 'Operator'}**! I'm the Urumi MCP Gateway chat assistant.\n\nAll tools in this session are routed through the central gateway and strictly audited under your identity (**${user?.email}** with **${user?.role}** role).\n\nAsk a question or select an operational task below:`,
      timestamp: new Date().toISOString()
    }
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<ClassifiedError | null>(null);

  // TanStack Query for Gateway health and registered tools
  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.getHealth().catch(() => null)
  });

  const { data: toolsData, isLoading: isToolsLoading, refetch: refetchTools } = useQuery({
    queryKey: queryKeys.tools,
    queryFn: () => api.getTools().catch(() => ({ count: 0, tools: [] }))
  });

  const gatewayHealthy = healthData ? healthData.status === 'healthy' : null;
  const availableTools: ToolDefinition[] = toolsData?.tools || [];

  // Gateway connection state
  const [activeModel, setActiveModel] = useState<string>('gateway-orchestrator');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);

  // Scroll management
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // Handle scroll detection so reading older messages isn't interrupted
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const nearBottom = isScrolledNearBottom(scrollContainerRef.current, 100);
    setIsUserScrolledUp(!nearBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior
      });
      setIsUserScrolledUp(false);
    }
  };

  // Only auto-scroll to bottom if user is not actively reading history
  useEffect(() => {
    if (!isUserScrolledUp) {
      scrollToBottom('smooth');
    }
  }, [messages, isLoading, isUserScrolledUp]);

  const handleSendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setErrorBanner(null);
    setLastFailedPrompt(null);

    // Auto-scroll on newly submitted message
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      // Build lightweight recent history for context
      const history = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await api.sendChatMessage(text, history);

      if (res.model) setActiveModel(res.model);
      if (res.isDemoMode !== undefined) setIsDemoMode(res.isDemoMode);

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

      // If any tool call failed, highlight failure origin
      const failedTool = res.toolCalls?.find(tc => tc.status === 'error');
      if (failedTool) {
        const classified = classifyChatError(failedTool.errorMessage || 'Upstream tool execution error', res.toolCalls);
        setErrorBanner(classified);
      }
    } catch (err: any) {
      const classified = classifyChatError(err);
      setErrorBanner(classified);
      setLastFailedPrompt(text);
      setInput(text); // Preserve visible user input after failed submission

      const errorMessage: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `**Request Incomplete**: ${classified.message}\n\n*Error Origin: ${classified.title}*`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastFailedPrompt) {
      handleSendMessage(lastFailedPrompt);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        role: 'assistant',
        content: `Conversation reset. Ready for new queries attributed to **${user?.email}**.`,
        timestamp: new Date().toISOString()
      }
    ]);
    setErrorBanner(null);
    setLastFailedPrompt(null);
  };

  // Derive starter prompts based strictly on discovered tool capabilities
  const starterPrompts = deriveStarterPrompts(availableTools);

  const getStarterIcon = (iconType: string) => {
    switch (iconType) {
      case 'order':
        return <ClipboardList size={13} style={{ color: 'var(--color-success-text)' }} />;
      case 'product':
        return <ShoppingBag size={13} style={{ color: '#f472b6' }} />;
      case 'inventory':
        return <Package size={13} style={{ color: 'var(--color-primary)' }} />;
      case 'shipping':
        return <ArrowRightLeft size={13} style={{ color: 'var(--color-info-text)' }} />;
      case 'compare':
        return <Layers size={13} style={{ color: 'var(--color-warning-text)' }} />;
      default:
        return <Bot size={13} style={{ color: 'var(--text-secondary)' }} />;
    }
  };

  return (
    <div
      className="page-container"
      style={{
        maxWidth: '1000px',
        height: 'calc(100dvh - 110px)',
        minHeight: '420px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      {/* 1. Workspace Header */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <PageHeader
            title="Chat Playground & Tool Agent"
            description="Autonomous agent loop executing MCP tool calls through the gateway with authenticated user attribution."
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                refetchHealth();
                refetchTools();
              }}
              isLoading={isToolsLoading}
              leftIcon={<RefreshCw size={12} />}
              title="Refresh tools from active upstream servers"
            >
              Refresh Tools
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearChat}
              leftIcon={<RotateCcw size={12} />}
              title="Reset conversation history"
            >
              Reset Chat
            </Button>
          </div>
        </div>

        {/* Operational Context Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            padding: '8px 12px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            marginTop: '8px',
            fontSize: '12px'
          }}
        >
          {/* Gateway Status Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Activity
              size={13}
              style={{
                color: gatewayHealthy ? 'var(--color-success-text)' : 'var(--color-danger-text)'
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>Gateway:</span>
            <span
              style={{
                fontWeight: 600,
                color: gatewayHealthy ? 'var(--color-success-text)' : 'var(--color-danger-text)'
              }}
            >
              {gatewayHealthy ? 'Active & Healthy' : 'Offline / Checking'}
            </span>
          </div>

          <span style={{ color: 'var(--border-default)' }}>|</span>

          {/* Model / Engine Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Bot size={13} style={{ color: 'var(--color-primary)' }} />
            <span style={{ color: 'var(--text-muted)' }}>Model:</span>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-primary)' }}>
              {activeModel}
            </code>
            {isDemoMode && (
              <Badge variant="warning" style={{ fontSize: '10px', padding: '1px 5px' }}>
                Demo Mock Provider
              </Badge>
            )}
          </div>

          <span style={{ color: 'var(--border-default)' }}>|</span>

          {/* User Attribution Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}>
            <ShieldCheck size={13} style={{ color: 'var(--color-success-text)' }} />
            <span style={{ color: 'var(--text-muted)' }}>Caller Identity:</span>
            <strong style={{ color: 'var(--text-primary)' }}>{user?.email}</strong>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: user?.role === 'admin' ? 'var(--color-danger-bg)' : 'rgba(255, 255, 255, 0.05)',
                color: user?.role === 'admin' ? 'var(--color-danger-text)' : 'var(--text-secondary)',
                border: `1px solid ${user?.role === 'admin' ? 'var(--color-danger-border)' : 'var(--border-subtle)'}`
              }}
            >
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Capability-Driven Starter Prompts */}
      {starterPrompts.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
            overflowX: 'auto',
            paddingBottom: '4px'
          }}
          aria-label="Discovered starter prompts"
        >
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Discovered Capabilities:
          </span>
          {starterPrompts.map(sp => (
            <Button
              key={sp.id}
              size="sm"
              variant="outline"
              onClick={() => handleSendMessage(sp.prompt)}
              disabled={isLoading}
              leftIcon={getStarterIcon(sp.icon)}
              style={{
                borderRadius: 'var(--radius-full)',
                fontSize: '11px',
                padding: '4px 10px',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              {sp.label}
            </Button>
          ))}
        </div>
      )}

      {/* 3. Messages Workspace Lane */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-canvas)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '12px',
          position: 'relative'
        }}
      >
        {messages.map(msg => {
          const isUser = msg.role === 'user';

          return (
            <motion.div
              key={msg.id}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{
                duration: prefersReduced ? 0 : motionTokens.duration.fast,
                ease: motionTokens.ease.standard
              }}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                width: isUser ? 'auto' : '100%',
                maxWidth: isUser ? '80%' : '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              {/* Message Meta Header */}
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
                <span>
                  {isUser ? `You (${user?.email})` : 'Gateway Assistant'} • {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                {!isUser && msg.isDemoMode && (
                  <Badge variant="warning" style={{ fontSize: '10px', padding: '1px 5px' }}>
                    Demo Mode
                  </Badge>
                )}
              </div>

              {/* Message Body Card */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: isUser ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
                  border: isUser ? '1px solid var(--border-default)' : '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-sm)',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere'
                }}
              >
                {isUser ? (
                  <div style={{ fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                ) : (
                  <SafeMarkdown content={msg.content} />
                )}
              </div>

              {/* Tool Execution Steps Activity Cards */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div style={{ marginTop: '2px', maxWidth: '100%' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>Upstream Tool Activity ({msg.toolCalls.length} step{msg.toolCalls.length === 1 ? '' : 's'})</span>
                    {msg.stepCount && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        • Orchestration steps: {msg.stepCount}
                      </span>
                    )}
                  </div>

                  {msg.toolCalls.map((tc, idx) => (
                    <ToolStepCard
                      key={tc.toolCallId || idx}
                      stepIndex={idx + 1}
                      toolCall={tc}
                      userEmail={user?.email}
                      userRole={user?.role}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Dynamic Thinking / Invoking / Waiting Indicator */}
        <ChatStatusIndicator isLoading={isLoading} />
      </div>

      {/* Floating Scroll-to-Bottom Button if Scrolled Up */}
      {isUserScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          aria-label="Scroll to newest messages"
          style={{
            position: 'absolute',
            bottom: '120px',
            right: '28px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-md)',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500
          }}
        >
          <ArrowDown size={12} />
          <span>Latest messages</span>
        </button>
      )}

      {/* Error Origin Banner (Gateway / Model / Upstream) */}
      {errorBanner && (
        <ChatErrorBanner
          error={errorBanner}
          onRetry={lastFailedPrompt ? handleRetry : undefined}
          onDismiss={() => setErrorBanner(null)}
        />
      )}

      {/* 4. Composer */}
      <ChatComposer
        input={input}
        onChange={setInput}
        onSend={() => handleSendMessage(input)}
        isLoading={isLoading}
      />
    </div>
  );
};
