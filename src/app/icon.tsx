import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: "#0a0a0f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px solid rgba(13,204,242,0.4)",
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderLeft: "10px solid #0dccf2",
            marginLeft: 2,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
