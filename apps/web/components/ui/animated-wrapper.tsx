"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useHydrated } from "@/hooks";

/**
 * ============================================================================
 * ANIMATION SYSTEM - Usage Guidelines
 * ============================================================================
 *
 * This file provides a standardized animation system for the application.
 * Choose the right tool based on your use case:
 *
 * 1. ENTRANCE ANIMATIONS (content appearing on scroll/mount):
 *    -> Use `AnimatedDiv` or `AnimatedSection`
 *    -> Supports viewport detection, delays, custom variants
 *
 * 2. STAGGERED LISTS (children animating sequentially):
 *    -> Use `StaggerContainer` + `StaggerItem`
 *    -> Parent controls timing, children animate in sequence
 *
 * 3. COMPLEX/INFINITE ANIMATIONS:
 *    -> Import `motion` directly from "motion/react"
 *    -> Use for: AnimatePresence, infinite loops, physics-based animations
 *
 * IMPORTANT: Don't mix patterns unnecessarily. Pick one approach per component.
 * ============================================================================
 */

/**
 * Reusable animation variants for consistent animations across the app.
 */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};

export const slideInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
    },
  },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

interface AnimatedDivProps {
  children: ReactNode;
  variants?: Variants;
  className?: string;
  /** Trigger animation when element enters viewport (default: true) */
  triggerOnView?: boolean;
  /** Viewport amount for triggering (0-1) */
  viewportAmount?: number;
  /** Only animate once when entering viewport */
  once?: boolean;
  /** Animation delay in seconds */
  delay?: number;
  /** Animation duration in seconds */
  duration?: number;
}

/**
 * Animated div wrapper that prevents hydration mismatch.
 * Renders static content during SSR, then switches to motion after mount.
 */
export function AnimatedDiv({
  children,
  variants = fadeInUp,
  className,
  triggerOnView = true,
  viewportAmount = 0.3,
  once = true,
  delay = 0,
  duration = 0.6,
}: AnimatedDivProps) {
  const mounted = useHydrated();
  const shouldReduceMotion = useReducedMotion();

  // Render with hidden styles during SSR to prevent flash
  if (!mounted) {
    return (
      <div className={className} style={{ opacity: 0 }}>
        {children}
      </div>
    );
  }

  // Skip animations for users who prefer reduced motion
  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const animationProps = triggerOnView
    ? {
        initial: "hidden",
        whileInView: "visible",
        viewport: { once, amount: viewportAmount },
      }
    : {
        initial: "hidden",
        animate: "visible",
      };

  return (
    <motion.div
      variants={variants}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
      {...animationProps}
    >
      {children}
    </motion.div>
  );
}

type AnimatedSectionProps = AnimatedDivProps;

/**
 * Animated section wrapper for full sections.
 */
export function AnimatedSection({
  children,
  variants = fadeIn,
  className,
  triggerOnView = true,
  viewportAmount = 0.2,
  once = true,
  delay = 0,
  duration = 0.6,
}: AnimatedSectionProps) {
  const mounted = useHydrated();
  const shouldReduceMotion = useReducedMotion();

  if (!mounted) {
    return (
      <section className={className} style={{ opacity: 0 }}>
        {children}
      </section>
    );
  }

  if (shouldReduceMotion) {
    return <section className={className}>{children}</section>;
  }

  const animationProps = triggerOnView
    ? {
        initial: "hidden",
        whileInView: "visible",
        viewport: { once, amount: viewportAmount },
      }
    : {
        initial: "hidden",
        animate: "visible",
      };

  return (
    <motion.section
      variants={variants}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
      {...animationProps}
    >
      {children}
    </motion.section>
  );
}

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  as?: "div" | "ul" | "section";
  /** If true, animate on mount instead of when in view */
  animateOnMount?: boolean;
  viewportAmount?: number;
}

/**
 * Container for staggered child animations.
 */
export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.2,
  as = "div",
  animateOnMount = false,
  viewportAmount = 0.2,
}: StaggerContainerProps) {
  const mounted = useHydrated();
  const shouldReduceMotion = useReducedMotion();

  if (!mounted) {
    const StaticComponent = as;
    return (
      <StaticComponent className={className} style={{ opacity: 0 }}>
        {children}
      </StaticComponent>
    );
  }

  if (shouldReduceMotion) {
    const StaticComponent = as;
    return <StaticComponent className={className}>{children}</StaticComponent>;
  }

  const variants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  };

  const Component = motion[as];

  const animationProps = animateOnMount
    ? { initial: "hidden", animate: "visible" }
    : {
        initial: "hidden",
        whileInView: "visible",
        viewport: { once: true, amount: viewportAmount },
      };

  return (
    <Component variants={variants} {...animationProps} className={className}>
      {children}
    </Component>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
  variants?: Variants;
}

/**
 * Item for use inside StaggerContainer.
 */
export function StaggerItem({
  children,
  className,
  as = "div",
  variants = staggerItem,
}: StaggerItemProps) {
  const mounted = useHydrated();
  const shouldReduceMotion = useReducedMotion();

  if (!mounted) {
    const StaticComponent = as;
    return (
      <StaticComponent className={className} style={{ opacity: 0 }}>
        {children}
      </StaticComponent>
    );
  }

  if (shouldReduceMotion) {
    const StaticComponent = as;
    return <StaticComponent className={className}>{children}</StaticComponent>;
  }

  const Component = motion[as];

  return (
    <Component variants={variants} className={className}>
      {children}
    </Component>
  );
}