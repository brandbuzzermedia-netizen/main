export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <div className="mb-6 h-8 w-48 rounded bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-surface-2" />)}
      </div>
      <div className="mt-6 h-64 rounded-xl bg-surface-2" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
