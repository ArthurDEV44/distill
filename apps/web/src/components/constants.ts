import { Zap, Brain, Wrench, LucideIcon } from 'lucide-react';

export const INSTALL_COMMAND = "npx distill-mcp";

export const APP_NAME = "Distill";

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: "21 Optimization Tools",
    description: "Smart file reading, build output compression, log summarization, error deduplication, and more.",
  },
  {
    icon: Brain,
    title: "AST-Aware Parsing",
    description: "Extract functions, classes, and types from code files. Supports TypeScript, Python, Go, Rust, PHP, Swift.",
  },
  {
    icon: Wrench,
    title: "Universal IDE Support",
    description: "Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.",
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
