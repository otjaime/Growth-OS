'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What is driving the CAC increase this week?',
  'Compare Meta vs Google channel performance',
  'What is our best performing channel by ROAS?',
  'Summarize our unit economics health',
  'Why is contribution margin declining?',
  'What is our conversion funnel drop-off?',
];

export default function AskPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch('/api/ask/status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setAiEnabled(data?.enabled ?? false))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(question?: string) {
    const q = (question ?? input).trim();
    if (!q || streaming) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setStreaming(true);

    // Add placeholder assistant message
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('growth_os_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      const res = await fetch(`${apiBase}/api/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: 'Failed to get a response. Is the API running with OPENAI_API_KEY configured?' };
          return updated;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.done) break;
            if (payload.error) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: 'AI generation failed. Please try again.' };
                return updated;
              });
              break;
            }
            if (payload.text) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1]!;
                updated[updated.length - 1] = { ...last, content: last.content + payload.text };
                return updated;
              });
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Network error. Please check your connection.' };
        return updated;
      });
    }

    setStreaming(false);
    inputRef.current?.focus();
  }

  if (aiEnabled === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!aiEnabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Ask Your Data</h1>
        <div className="card border-yellow-500/30">
          <p className="text-yellow-400 text-sm">
            AI features require an OpenAI API key. Set <code className="bg-slate-800 px-1 rounded">OPENAI_API_KEY</code> in your environment to enable this feature.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">Ask Your Data</h1>
        <p className="text-sm text-slate-400 mt-1">
          Ask questions about your business metrics in natural language
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="h-12 w-12 text-purple-400 mb-4" />
            <p className="text-lg text-slate-300 mb-2">What would you like to know?</p>
            <p className="text-sm text-slate-500 mb-6">Ask anything about your revenue, channels, cohorts, or funnel</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="text-left text-sm px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 hover:text-white hover:border-purple-500/50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-purple-400" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-200'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
                  {msg.content || (streaming && i === messages.length - 1 ? (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      Analyzing your data
                      <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse" />
                    </span>
                  ) : null)}
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
                <User className="h-4 w-4 text-blue-400" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-700 pt-4">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your data..."
            disabled={streaming}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
