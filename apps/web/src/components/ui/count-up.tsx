'use client';

import { useEffect, useRef } from 'react';
import { useSpring, useTransform } from 'motion/react';

interface CountUpProps {
  value: number;
  format?: (value: number) => string;
  className?: string;
}

export function CountUp({ value, format, className = '' }: CountUpProps) {
  const spring = useSpring(0, { stiffness: 80, damping: 25, restDelta: 0.01 });
  const display = useTransform(spring, (latest: number) =>
    format ? format(latest) : String(Math.round(latest)),
  );
  const ref = useRef<HTMLSpanElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      // First mount: jump to value instantly, then enable spring for future changes
      spring.jump(value);
      initialized.current = true;
    } else {
      spring.set(value);
    }
  }, [spring, value]);

  useEffect(() => {
    const unsubscribe = display.on('change', (v: string) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsubscribe;
  }, [display]);

  // Set initial text content from format function
  const initialText = format ? format(value) : String(Math.round(value));

  return <span ref={ref} className={className}>{initialText}</span>;
}
