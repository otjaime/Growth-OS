'use client';

import { useState } from 'react';

interface AdThumbnailProps {
  thumbnailUrl: string | null;
  imageUrl: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'w-8 h-8 rounded-md text-xs',
  md: 'w-10 h-10 rounded-lg text-sm',
  lg: 'w-14 h-14 rounded-xl text-base',
};

export function AdThumbnail({ thumbnailUrl, imageUrl, name, size = 'sm' }: AdThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const src = thumbnailUrl ?? imageUrl;
  const sizeClass = sizes[size];
  const initial = (name?.[0] ?? '?').toUpperCase();

  if (!src || failed) {
    return (
      <div
        className={`${sizeClass} flex-shrink-0 flex items-center justify-center bg-white/[0.06] border border-[var(--glass-border)] font-semibold text-[var(--foreground-secondary)]`}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`${sizeClass} flex-shrink-0 object-cover bg-white/[0.06] border border-[var(--glass-border)]`}
    />
  );
}
