"use client";

import { useState } from "react";

interface DailyData {
  date: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  requests: number;
}

interface ExportButtonProps {
  data: DailyData[];
  period: string;
  disabled?: boolean;
}

export function ExportButton({ data, period, disabled = false }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // Create CSV content
      const headers = ["Date", "Requests", "Input Tokens", "Output Tokens", "Total Tokens", "Cost (USD)"];
      const rows = data.map((d) => [
        d.date,
        d.requests.toString(),
        d.inputTokens.toString(),
        d.outputTokens.toString(),
        d.tokens.toString(),
        (d.costMicros / 1_000_000).toFixed(6),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      // Create and download file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `ctxopt-usage-${period}-${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || isExporting || data.length === 0}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" x2="12" y1="15" y2="3" />
      </svg>
      {isExporting ? "Exporting..." : "Export CSV"}
    </button>
  );
}
