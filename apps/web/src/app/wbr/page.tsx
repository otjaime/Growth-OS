'use client';

import { useState, useEffect } from 'react';
import { FileText, ClipboardCopy, Check } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function WbrPage() {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/wbr`)
      .then((r) => r.json())
      .then((data: { narrative: string }) => {
        setMarkdown(data.narrative);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  /* Simple markdown-to-HTML sections parser */
  const sections = markdown.split(/^(#{1,3}\s.+)$/gm).filter(Boolean);
  const rendered: { heading: string; body: string }[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i].trim();
    if (s.startsWith('#')) {
      rendered.push({ heading: s.replace(/^#+\s*/, ''), body: sections[i + 1]?.trim() ?? '' });
      i++;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold text-white">Weekly Business Review</h1>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
      </div>

      {rendered.length > 0 ? (
        <div className="space-y-4">
          {rendered.map((section, i) => (
            <div key={i} className="card">
              <h2 className="text-lg font-semibold text-white mb-3">{section.heading}</h2>
              <div className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">
                {section.body.split('\n').map((line, j) => {
                  if (line.startsWith('- ')) {
                    return (
                      <div key={j} className="flex gap-2 ml-2 my-1">
                        <span className="text-indigo-400">•</span>
                        <span>{line.slice(2)}</span>
                      </div>
                    );
                  }
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <p key={j} className="font-semibold text-white mt-2">{line.replace(/\*\*/g, '')}</p>;
                  }
                  return line ? <p key={j} className="my-1">{line}</p> : <div key={j} className="h-2" />;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">{markdown}</div>
        </div>
      )}
    </div>
  );
}
