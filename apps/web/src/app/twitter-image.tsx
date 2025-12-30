import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Distill - Save 98% LLM Tokens";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a0a1f 50%, #0a0a0a 100%)",
          position: "relative",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "800px",
            height: "400px",
            background: "radial-gradient(ellipse, rgba(244, 207, 139, 0.15) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            zIndex: 10,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #f4cf8b 0%, #d4a855 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 40px rgba(244, 207, 139, 0.3)",
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1a0a1f"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <span
              style={{
                fontSize: "48px",
                fontWeight: 700,
                color: "#f4cf8b",
              }}
            >
              Distill
            </span>
          </div>

          {/* Headline */}
          <div
            style={{
              fontSize: "72px",
              fontWeight: 800,
              color: "white",
              textAlign: "center",
              lineHeight: 1.1,
              marginBottom: "16px",
            }}
          >
            Save{" "}
            <span style={{ color: "#f4cf8b" }}>98%</span>{" "}
            LLM Tokens
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: "28px",
              color: "rgba(255, 255, 255, 0.7)",
              textAlign: "center",
            }}
          >
            Open source MCP server for context compression
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "20px",
            color: "rgba(255, 255, 255, 0.5)",
          }}
        >
          distill-mcp.com
        </div>
      </div>
    ),
    { ...size }
  );
}
