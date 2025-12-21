"use client";

import { useState } from "react";

interface NewKeyDisplayProps {
  keyValue: string;
  keyName: string;
  onDismiss: () => void;
}

export function NewKeyDisplay({ keyValue, keyName, onDismiss }: NewKeyDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-5 w-5 text-green-600"
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
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-green-800">API Key Created</h3>
          <p className="text-sm text-green-700 mt-1">
            Your API key &quot;{keyName}&quot; has been created. Copy it now - it won&apos;t
            be shown again!
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded bg-white border border-green-200 px-3 py-2 text-xs font-mono break-all">
              {keyValue}
            </code>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onDismiss}
              className="text-sm text-green-700 hover:text-green-800 underline"
            >
              I&apos;ve saved my key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
