'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  confirmColor: 'red' | 'green' | 'yellow' | 'blue';
  onConfirm: () => void;
  onCancel: () => void;
}

const COLOR_MAP: Record<string, string> = {
  red: 'bg-apple-red hover:bg-apple-red/80 text-white',
  green: 'bg-apple-green hover:bg-apple-green/80 text-white',
  yellow: 'bg-apple-yellow hover:bg-apple-yellow/80 text-black',
  blue: 'bg-apple-blue hover:bg-apple-blue/80 text-white',
};

const ICON_COLOR_MAP: Record<string, string> = {
  red: 'text-apple-red bg-[var(--tint-red)]',
  green: 'text-apple-green bg-[var(--tint-green)]',
  yellow: 'text-apple-yellow bg-[var(--tint-yellow)]',
  blue: 'text-apple-blue bg-[var(--tint-blue)]',
};

export function ConfirmationModal({
  open,
  title,
  message,
  detail,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[var(--glass-bg-elevated)] backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl shadow-glass-elevated overflow-hidden">
        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ICON_COLOR_MAP[confirmColor]}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[var(--foreground)]">{title}</h3>
              <p className="text-sm text-[var(--foreground-secondary)] mt-1">{message}</p>
              {detail && (
                <p className="text-xs text-[var(--foreground-secondary)]/70 mt-2 px-3 py-2 bg-[var(--glass-bg-thin)] rounded-lg">{detail}</p>
              )}
            </div>
            <button
              onClick={onCancel}
              className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              onClick={onCancel}
              className="text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] bg-[var(--glass-bg-thin)] hover:bg-[var(--glass-bg)] px-4 py-2.5 rounded-lg transition-all ease-spring"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`text-xs font-semibold px-5 py-2.5 rounded-lg transition-all ease-spring ${COLOR_MAP[confirmColor]}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
