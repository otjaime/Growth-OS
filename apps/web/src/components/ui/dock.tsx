'use client';

import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
} from 'react';
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';

interface DockContextValue {
  mouseY: MotionValue<number>;
  magnification: number;
  distance: number;
}

const DockContext = createContext<DockContextValue | null>(null);

interface DockProps {
  children: ReactNode;
  className?: string;
  magnification?: number;
  distance?: number;
}

export function Dock({ children, className = '', magnification = 1.04, distance = 140 }: DockProps) {
  const mouseY = useMotionValue(Infinity);

  return (
    <DockContext.Provider value={{ mouseY, magnification, distance }}>
      <nav
        className={className}
        onMouseMove={(e) => mouseY.set(e.clientY)}
        onMouseLeave={() => mouseY.set(Infinity)}
      >
        {children}
      </nav>
    </DockContext.Provider>
  );
}

interface DockItemProps {
  children: ReactNode;
  className?: string;
}

export function DockItem({ children, className = '' }: DockItemProps) {
  const ctx = useContext(DockContext);
  const ref = useRef<HTMLDivElement>(null);

  // If not inside a Dock, render without animation
  if (!ctx) {
    return <div className={className}>{children}</div>;
  }

  return <DockItemInner mouseY={ctx.mouseY} magnification={ctx.magnification} distance={ctx.distance} className={className}>{children}</DockItemInner>;
}

function DockItemInner({
  children,
  mouseY,
  magnification,
  distance,
  className,
}: {
  children: ReactNode;
  mouseY: MotionValue<number>;
  magnification: number;
  distance: number;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const itemDistance = useTransform(mouseY, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return distance + 1;
    return val - bounds.y - bounds.height / 2;
  });

  const scaleRaw = useTransform(itemDistance, [-distance, 0, distance], [1, magnification, 1]);
  const scale = useSpring(scaleRaw, { stiffness: 200, damping: 28 });

  return (
    <motion.div ref={ref} style={{ scale, transformOrigin: 'left center' }} className={className} data-dock-item>
      {children}
    </motion.div>
  );
}
