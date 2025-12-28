import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CtxOpt - Context Engineering for LLMs",
    template: "%s | CtxOpt",
  },
  description:
    "Open source MCP server for LLM token optimization. Reduce costs by up to 60% with intelligent context compression.",
  keywords: [
    "LLM",
    "token optimization",
    "context engineering",
    "MCP",
    "Model Context Protocol",
    "Claude",
    "Anthropic",
    "open source",
  ],
  authors: [{ name: "CtxOpt" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://ctxopt.dev",
    siteName: "CtxOpt",
    title: "CtxOpt - Context Engineering for LLMs",
    description:
      "Open source MCP server for LLM token optimization.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CtxOpt - Context Engineering for LLMs",
    description:
      "Open source MCP server for LLM token optimization.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
