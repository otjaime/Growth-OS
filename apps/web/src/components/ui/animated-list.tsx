'use client';

import { Children, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function AnimatedList({ children, className = '', staggerDelay = 0.04 }: AnimatedListProps) {
  const items = Children.toArray(children);

  return (
    <div className={className}>
      <AnimatePresence mode="popLayout">
        {items.map((child, index) => (
          <motion.div
            key={(child as React.ReactElement).key ?? index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 24,
              delay: index * staggerDelay,
            }}
          >
            {child}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
