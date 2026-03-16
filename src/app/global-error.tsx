"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: "2rem", color: "white", background: "#1a1a2e", fontFamily: "monospace" }}>
        <h2>Global Error</h2>
        <pre style={{ whiteSpace: "pre-wrap", color: "#ff6b6b" }}>
          {error.message}
        </pre>
        <p style={{ color: "#999" }}>Digest: {error.digest}</p>
        <p style={{ color: "#999" }}>Stack: {error.stack?.slice(0, 1000)}</p>
        <button onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
          Retry
        </button>
      </body>
    </html>
  );
}
