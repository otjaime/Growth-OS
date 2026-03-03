'use client';

import { useState, useEffect } from 'react';

export function ExpiryCountdown({ expiresAt }: { expiresAt: string | null }) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!expiresAt) {
      setLabel('');
      return;
    }

    const update = () => {
      const diffMs = new Date(expiresAt).getTime() - Date.now();
      if (diffMs <= 0) {
        setLabel('Expired');
        return;
      }
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setLabel(hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`);
    };

    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!label) return null;

  const isExpired = label === 'Expired';

  return (
    <span className={`text-caption font-medium ${isExpired ? 'text-apple-red/70' : 'text-[var(--foreground-secondary)]/60'}`}>
      {label}
    </span>
  );
}
