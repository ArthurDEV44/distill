import { Zap, Brain, Wrench, LucideIcon } from 'lucide-react';

export const INSTALL_COMMAND = "bunx distill-mcp setup";

export const APP_NAME = "Distill";

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: "3 Precision Tools",
    description: "Auto Compress, Smart Read, and Code Execute — zero friction, always loaded, no discovery step.",
  },
  {
    icon: Brain,
    title: "AST-Aware Parsing",
    description: "Extract functions, classes, and types from code files. Supports TypeScript, Python, Go, Rust, PHP, Swift.",
  },
  {
    icon: Wrench,
    title: "Native Claude Code integration",
    description: "Marker, PreCompact hook, custom subagent, slash commands. Zero friction, always loaded.",
  },
];

export interface NavLink {
  label: string;
  href: string;
}

export const NAV_LINKS: NavLink[] = [
  { label: "À propos", href: "/about" },
  { label: "Documentation", href: "/docs" },
];
