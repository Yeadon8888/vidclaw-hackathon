import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: "linear-gradient(135deg, #0a0a0f 0%, #111827 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: "32px solid transparent",
            borderBottom: "32px solid transparent",
            borderLeft: "52px solid #0dccf2",
            marginLeft: 10,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
