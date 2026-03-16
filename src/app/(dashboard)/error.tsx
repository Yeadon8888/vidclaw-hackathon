"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <h2 className="text-lg font-bold text-white">出错了</h2>
      <pre className="mt-3 whitespace-pre-wrap rounded-[var(--vc-radius-lg)] border border-red-500/20 bg-red-500/5 p-4 text-left text-sm text-red-400">
        {error.message}
      </pre>
      {error.digest && (
        <p className="mt-2 text-xs text-[var(--vc-text-dim)]">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="mt-4 rounded-[var(--vc-radius-md)] bg-[var(--vc-bg-elevated)] px-4 py-2 text-sm text-white transition-colors hover:bg-zinc-600"
      >
        重试
      </button>
    </div>
  );
}
