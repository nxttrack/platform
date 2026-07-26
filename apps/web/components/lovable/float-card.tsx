"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FloatCard({ children, className, delay = 0.35 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur", className)}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      transition={reduceMotion ? { duration: 0 } : { delay, duration: 0.25 }}
    >
      {children}
    </motion.div>
  );
}
