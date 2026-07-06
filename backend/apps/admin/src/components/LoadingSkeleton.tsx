import { clx } from '@medusajs/ui';

const WIDTHS = ['w-11/12', 'w-4/5', 'w-2/3'];

/** Pulse-bar placeholder for loading table/section bodies (replaces the bare "…" text). */
export const LoadingSkeleton = ({
  rows = 3,
  label = 'Loading',
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) => (
  <div role="status" aria-label={label} className={clx('flex flex-col gap-2 py-1', className)}>
    {Array.from({ length: rows }, (_, i) => (
      <div
        key={i}
        className={clx('bg-ui-bg-subtle h-4 animate-pulse rounded-md', WIDTHS[i % WIDTHS.length])}
      />
    ))}
  </div>
);
