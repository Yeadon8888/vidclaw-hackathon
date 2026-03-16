export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--vc-bg-root)]">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/4 h-80 w-80 rounded-full bg-[var(--vc-accent)]/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-80 w-80 rounded-full bg-blue-600/10 blur-[100px]" />
      {children}
    </div>
  );
}
