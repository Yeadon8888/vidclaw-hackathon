export default function Loading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--vc-accent)]/30 border-t-[var(--vc-accent)]" />
    </div>
  );
}
