'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface CounterTickerProps {
  value: number;
  format?: (value: number) => string;
  className?: string;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function DigitColumn({ digit, className }: { digit: string; className?: string }) {
  const idx = DIGITS.indexOf(digit);
  if (idx === -1) {
    // Non-digit character (static)
    return (
      <AnimatePresence mode="popLayout">
        <motion.span
          key={digit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={className}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    );
  }

  return (
    <span className="inline-block overflow-hidden" style={{ height: '1em', lineHeight: '1em' }}>
      <motion.span
        className="inline-flex flex-col"
        animate={{ y: `-${idx}em` }}
        transition={{ type: 'spring', stiffness: 150, damping: 20 }}
        style={{ lineHeight: '1em' }}
      >
        {DIGITS.map((d) => (
          <span key={d} className={className} style={{ height: '1em' }}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function CounterTicker({ value, format, className = '' }: CounterTickerProps) {
  const formatted = format ? format(value) : String(value);
  const chars = formatted.split('');
  const [prevLength, setPrevLength] = useState(chars.length);
  const isFirst = useRef(true);

  useEffect(() => {
    setPrevLength(chars.length);
    isFirst.current = false;
  }, [chars.length]);

  return (
    <span className={`inline-flex ${className}`}>
      <AnimatePresence mode="popLayout">
        {chars.map((char, i) => (
          <DigitColumn key={`${i}-${chars.length}`} digit={char} />
        ))}
      </AnimatePresence>
    </span>
  );
}
