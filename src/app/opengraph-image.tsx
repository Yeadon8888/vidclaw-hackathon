import { ImageResponse } from "next/og";

export const alt = "VidClaw V2 — AI-Powered Product Video Generator";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0a0a0f 0%, #0c1222 40%, #0a0a0f 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 80,
            height: 80,
            borderRadius: 20,
            background: "#0dccf2",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: "18px solid transparent",
              borderBottom: "18px solid transparent",
              borderLeft: "30px solid #0a0a0f",
              marginLeft: 6,
            }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 900,
            color: "white",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            textAlign: "center",
          }}
        >
          <span>VidClaw</span>
          <span style={{ color: "#0dccf2", marginLeft: 12 }}>V2</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
            marginTop: 16,
            textAlign: "center",
          }}
        >
          AI-Powered Product Video Generator
        </div>

        {/* Tags */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 40,
          }}
        >
          {["VEO 3.1", "Sora", "Gemini"].map((tag) => (
            <div
              key={tag}
              style={{
                display: "flex",
                padding: "8px 20px",
                borderRadius: 999,
                border: "1px solid rgba(13,204,242,0.3)",
                background: "rgba(13,204,242,0.08)",
                color: "#0dccf2",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: 32,
            fontSize: 18,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          video.yeadon.top
        </div>
      </div>
    ),
    { ...size },
  );
}
