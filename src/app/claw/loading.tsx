// Skeleton shown while the server page fetches the pack catalog (GET /store/packs).
// Mirrors ClawClient's layout (sticky filter bar → per-category card grids) so
// the swap to real content is shift-free.
export default function ClawLoading() {
  return (
    <div className="mx-auto w-full px-fluid py-4">
      {/* Sticky filter bar — chip rail + sort/toggle */}
      <div className="sticky top-2 z-20 mb-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-neutral-950/80 p-2 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5 overflow-hidden">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-white/[0.06]"
            />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3 px-1">
          <div className="h-8 w-32 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-8 w-28 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
      </div>

      {/* Two placeholder category sections */}
      {Array.from({ length: 2 }).map((_, s) => (
        <section key={s} className="mb-8">
          {/* Section header */}
          <div className="mb-4 flex items-center gap-2.5">
            <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-5 w-40 animate-pulse rounded bg-white/[0.06]" />
            <div className="ml-auto h-4 w-14 animate-pulse rounded bg-white/[0.06]" />
          </div>

          {/* Card row (horizontal scroll, matches the live layout) */}
          <div className="flex gap-4 overflow-hidden pb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex h-full w-44 shrink-0 flex-col rounded-2xl border border-white/10 bg-white/5 p-3 lg:w-48"
              >
                <div className="mx-auto mt-3 mb-2 h-40 w-28 animate-pulse rounded bg-white/[0.04]" />
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-3 w-10 animate-pulse rounded bg-white/[0.06]" />
                </div>
                <div className="mt-auto h-9 w-full animate-pulse rounded-xl bg-white/[0.08]" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
