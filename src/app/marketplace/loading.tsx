// Skeleton shown while the server page fetches the live catalog from the Store
// API. Mirrors MarketplaceClient's layout (tab row → toolbar → card grid) so the
// swap to real content is shift-free.
export default function MarketplaceLoading() {
  return (
    <div className="mx-auto w-full px-fluid py-4">
      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {/* Category tab row */}
          <div className="mb-4 flex gap-2 overflow-hidden border-b border-white/10 pb-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-white/[0.06]"
              />
            ))}
          </div>

          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="h-9 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-9 min-w-[200px] flex-1 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-9 w-9 animate-pulse rounded-xl bg-white/[0.06]" />
            <div className="h-9 w-40 animate-pulse rounded-xl bg-white/[0.06]" />
          </div>

          {/* Card grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="h-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-800"
              >
                <div className="aspect-[3/4] w-full animate-pulse bg-white/[0.04]" />
                <div className="flex flex-col gap-2 p-3">
                  <div className="h-3 w-full animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="h-4 w-12 animate-pulse rounded bg-white/[0.06]" />
                    <div className="h-3 w-14 animate-pulse rounded bg-white/[0.06]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
