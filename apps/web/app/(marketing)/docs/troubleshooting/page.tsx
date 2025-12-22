"use client";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionPanel,
} from "@/components/ui/accordion";

const commonErrors = [
  {
    title: "MCP Server Not Found",
    symptoms: "Tools not appearing in Claude Code",
    causes: [
      "MCP server not installed globally",
      "mcp.json file in wrong location",
      "IDE not restarted after configuration",
    ],
    solutions: [
      "Run: npm install -g @ctxopt/mcp-server",
      "Verify mcp.json is at ~/.claude/mcp.json",
      "Restart your IDE completely",
    ],
  },
  {
    title: "Permission Denied",
    symptoms: "npm install fails with EACCES error",
    causes: [
      "Global npm directory not writable",
      "Node.js installed without proper permissions",
    ],
    solutions: [
      "Use sudo: sudo npm install -g @ctxopt/mcp-server",
      "Use npx instead: npx @ctxopt/mcp-server",
      "Fix npm permissions: see npm docs for guidance",
    ],
  },
  {
    title: "Connection Timeout",
    symptoms: "MCP tools hang or time out",
    causes: [
      "Network connectivity issues",
      "File being read is extremely large",
    ],
    solutions: [
      "Check your internet connection",
      "Try reading a smaller file first",
      "Use smart_file_read with target parameter for specific functions",
    ],
  },
];

const faqItems = [
  {
    question: "What is an MCP server?",
    answer:
      "MCP (Model Context Protocol) is a standard for extending AI assistants with custom tools. The CtxOpt MCP server provides tools for token optimization that integrate directly with Claude Code, Cursor, and other compatible IDEs.",
  },
  {
    question: "Do I need an account to use CtxOpt?",
    answer:
      "No, the MCP server works locally without any account. All optimization happens on your machine. You can optionally sync stats to a dashboard in the future.",
  },
  {
    question: "Which IDEs are supported?",
    answer:
      "Any IDE that supports the MCP protocol: Claude Code, Cursor, Windsurf, and others. Check the integration guides for setup instructions.",
  },
  {
    question: "How much can I save with CtxOpt?",
    answer:
      "Savings vary by use case. smart_file_read typically saves 50-70% on code files. auto_optimize can reduce build output by 95%+. Check session_stats to see your actual savings.",
  },
  {
    question: "Is the MCP server open source?",
    answer:
      "Yes! The CtxOpt MCP server is open source. You can view the code, contribute, or report issues on GitHub.",
  },
  {
    question: "Can I use CtxOpt with other AI models?",
    answer:
      "The MCP server tools work with any AI assistant that supports MCP. While we test primarily with Claude, the optimization tools are model-agnostic.",
  },
  {
    question: "What languages does smart_file_read support?",
    answer:
      "Full AST analysis for TypeScript and JavaScript. Regex-based extraction for Python, Go, and Rust. Other languages get basic line-range extraction.",
  },
];

export default function TroubleshootingPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Troubleshooting</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Solutions to common issues and frequently asked questions.
        </p>
      </div>

      {/* Common Errors */}
      <section>
        <h2 className="mb-6 text-2xl font-semibold">Common Errors</h2>
        <div className="space-y-6">
          {commonErrors.map((error) => (
            <div key={error.title} className="rounded-lg border p-6">
              <h3 className="mb-2 text-lg font-semibold">{error.title}</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                <span className="font-medium">Symptoms:</span> {error.symptoms}
              </p>

              <div className="mb-4">
                <h4 className="mb-2 text-sm font-medium">Possible Causes:</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {error.causes.map((cause, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-muted-foreground">-</span>
                      {cause}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Solutions:</h4>
                <ul className="space-y-1 text-sm">
                  {error.solutions.map((solution, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {solution}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MCP Server Issues */}
      <section>
        <h2 className="mb-4 text-2xl font-semibold">MCP Server Checklist</h2>
        <p className="mb-4 text-muted-foreground">
          If the MCP server isn&apos;t working, verify the following:
        </p>
        <div className="rounded-lg border p-6">
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" />
              <span>
                mcp.json file exists at the correct location for your IDE
              </span>
            </li>
            <li className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" />
              <span>
                <code className="rounded bg-muted px-1">
                  npx @ctxopt/mcp-server
                </code>{" "}
                runs without errors in terminal
              </span>
            </li>
            <li className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" />
              <span>IDE was restarted after adding configuration</span>
            </li>
            <li className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" />
              <span>Node.js version is 18 or higher</span>
            </li>
            <li className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" />
              <span>No syntax errors in mcp.json (valid JSON)</span>
            </li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="mb-6 text-2xl font-semibold">
          Frequently Asked Questions
        </h2>
        <Accordion>
          {faqItems.map((item, index) => (
            <AccordionItem key={index} value={index}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionPanel>{item.answer}</AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Contact Support */}
      <section className="rounded-lg border bg-muted/30 p-6">
        <h2 className="mb-4 text-lg font-semibold">Still Need Help?</h2>
        <p className="mb-4 text-muted-foreground">
          If you couldn&apos;t find a solution to your problem:
        </p>
        <ul className="space-y-2 text-muted-foreground">
          <li className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <a
              href="https://github.com/ctxopt/ctxopt/issues"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open an issue on GitHub
            </a>
          </li>
          <li className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span>
              Email us at{" "}
              <a
                href="mailto:support@ctxopt.com"
                className="text-primary hover:underline"
              >
                support@ctxopt.com
              </a>
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
