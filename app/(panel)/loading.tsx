export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Memuat">
      <div className="h-7 w-48 animate-pulse rounded-lg bg-[#e5e7eb]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#e5e7eb]" />)}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[#e5e7eb]" />
    </div>
  );
}
