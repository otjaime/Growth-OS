'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Loader2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface CSVUploadProps {
  onComplete: () => void;
}

interface UploadResult {
  success: boolean;
  rowsIngested?: number;
  totalRows?: number;
  dataType?: string;
  message?: string;
  error?: string;
}

const DATA_TYPES = [
  { value: 'orders', label: 'Orders', hint: 'Columns: order_id, date, email, revenue, discounts, cogs' },
  { value: 'spend', label: 'Ad Spend', hint: 'Columns: date, channel, spend, impressions, clicks' },
  { value: 'traffic', label: 'Traffic', hint: 'Columns: date, source, sessions, page_views' },
  { value: 'customers', label: 'Customers', hint: 'Columns: email, first_name, last_name, first_order_date' },
  { value: 'custom', label: 'Custom Events', hint: 'Any columns — stored as raw events' },
];

export function CSVUpload({ onComplete }: CSVUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dataType, setDataType] = useState('orders');
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsePreview = useCallback((f: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const rows = lines.slice(0, 6).map((line) => {
        const sep = line.includes('\t') ? '\t' : ',';
        return line.split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
      });
      setPreview(rows);
    };
    reader.readAsText(f.slice(0, 8192)); // Read only first 8KB for preview
  }, []);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(csv|tsv|txt)$/i)) {
      setResult({ success: false, error: 'Please upload a .csv, .tsv, or .txt file' });
      return;
    }
    setFile(f);
    setResult(null);
    parsePreview(f);
    if (!label) {
      setLabel(f.name.replace(/\.\w+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dataType', dataType);
      formData.append('label', label || file.name);

      const res = await apiFetch('/api/connections/csv/upload', {
        method: 'POST',
        body: formData,
      });
      const data: UploadResult = await res.json();
      setResult(data);
      if (data.success) {
        setTimeout(() => onComplete(), 2000);
      }
    } catch {
      setResult({ success: false, error: 'Upload failed. Check that the API is running.' });
    }
    setUploading(false);
  };

  const clearFile = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const selectedType = DATA_TYPES.find((t) => t.value === dataType);

  return (
    <div className="space-y-4">
      {/* Data Type Selector */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Data Type</label>
        <div className="flex flex-wrap gap-2">
          {DATA_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setDataType(t.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dataType === t.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {selectedType && (
          <p className="text-xs text-slate-500 mt-1.5">{selectedType.hint}</p>
        )}
      </div>

      {/* Label */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Dataset Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Q4 2024 Historical Orders"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
          dragOver
            ? 'border-blue-500 bg-blue-500/10'
            : file
              ? 'border-green-500/50 bg-green-500/5'
              : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {file ? (
          <>
            <FileText className="h-8 w-8 text-green-400" />
            <div className="text-center">
              <p className="text-sm text-white font-medium">{file.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB
                {preview.length > 1 && ` \u00b7 ${preview.length - 1} rows previewed`}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); clearFile(); }}
              className="absolute top-3 right-3 p-1 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-slate-500" />
            <div className="text-center">
              <p className="text-sm text-slate-300">Drop a CSV file here or click to browse</p>
              <p className="text-xs text-slate-500 mt-1">Supports .csv, .tsv, .txt up to 50MB</p>
            </div>
          </>
        )}
      </div>

      {/* Preview Table */}
      {preview.length > 1 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800">
                {preview[0]!.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.slice(1).map((row, i) => (
                <tr key={i} className="border-t border-slate-800">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 5 && (
            <p className="text-xs text-slate-500 text-center py-1.5 bg-slate-800/50">Showing first {preview.length - 1} rows...</p>
          )}
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-medium transition-colors"
      >
        {uploading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
        ) : (
          <><Upload className="h-4 w-4" /> Upload & Ingest</>
        )}
      </button>

      {/* Result */}
      {result && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm ${
          result.success
            ? 'bg-green-500/10 border border-green-500/20 text-green-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {result.success ? <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-medium">{result.success ? 'Upload successful' : 'Upload failed'}</p>
            <p className="text-xs mt-0.5 opacity-80">{result.message ?? result.error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
