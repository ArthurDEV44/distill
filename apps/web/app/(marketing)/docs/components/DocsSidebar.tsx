"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  {
    title: "Getting Started",
    items: [
      { title: "Overview", href: "/docs" },
      { title: "Quick Start", href: "/docs#quick-start" },
    ],
  },
  {
    title: "MCP Server",
    items: [{ title: "Installation & Tools", href: "/docs/mcp" }],
  },
  {
    title: "Integration Guides",
    items: [
      { title: "All Guides", href: "/docs/guides" },
      { title: "Claude Code", href: "/docs/guides/claude-code" },
      { title: "Cursor", href: "/docs/guides/cursor" },
      { title: "Windsurf", href: "/docs/guides/windsurf" },
    ],
  },
  {
    title: "Support",
    items: [{ title: "Troubleshooting", href: "/docs/troubleshooting" }],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="space-y-6">
      {navigation.map((section) => (
        <div key={section.title}>
          <h4 className="mb-2 text-sm font-semibold">{section.title}</h4>
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    pathname === item.href ||
                      (item.href !== "/docs" && pathname?.startsWith(item.href))
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
