import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Distill - Save 98% LLM Tokens with Smart Context Compression";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
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
        {/* Background glow effects */}
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
        <div
          style={{
            position: "absolute",
            top: "30%",
            left: "20%",
            width: "300px",
            height: "300px",
            background: "radial-gradient(circle, rgba(147, 51, 234, 0.1) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          {/* Logo/Brand */}
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
                letterSpacing: "-0.02em",
              }}
            >
              Distill
            </span>
          </div>

          {/* Main headline */}
          <div
            style={{
              fontSize: "72px",
              fontWeight: 800,
              color: "white",
              textAlign: "center",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              marginBottom: "16px",
              maxWidth: "900px",
            }}
          >
            Save{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #f4cf8b 0%, #ffd700 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              98%
            </span>{" "}
            LLM Tokens
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: "28px",
              color: "rgba(255, 255, 255, 0.7)",
              textAlign: "center",
              maxWidth: "700px",
              lineHeight: 1.4,
            }}
          >
            Open source MCP server for intelligent context compression
          </div>

          {/* Feature pills */}
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: "40px",
            }}
          >
            {["AST Extraction", "Smart Compression", "TypeScript SDK"].map(
              (feature) => (
                <div
                  key={feature}
                  style={{
                    padding: "12px 24px",
                    borderRadius: "9999px",
                    background: "rgba(244, 207, 139, 0.1)",
                    border: "1px solid rgba(244, 207, 139, 0.3)",
                    color: "#f4cf8b",
                    fontSize: "18px",
                    fontWeight: 500,
                  }}
                >
                  {feature}
                </div>
              )
            )}
          </div>
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "20px",
            color: "rgba(255, 255, 255, 0.5)",
            letterSpacing: "0.05em",
          }}
        >
          distill-mcp.com
        </div>
      </div>
    ),
    { ...size }
  );
}
