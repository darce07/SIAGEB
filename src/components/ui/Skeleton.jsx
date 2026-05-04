const toneClass = {
  block:
    'bg-slate-200/80 dark:bg-slate-800/80',
  soft:
    'bg-slate-100 dark:bg-slate-800/55',
};

export function Skeleton({ className = '', tone = 'block', ...props }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md ${toneClass[tone] || toneClass.block} ${className}`}
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={`skeleton-text-${index}`}
          className={`h-3 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 5, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={`skeleton-head-${index}`} className="h-3" />
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`skeleton-row-${rowIndex}`} className="grid gap-3 px-5 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((__, columnIndex) => (
              <Skeleton key={`skeleton-cell-${rowIndex}-${columnIndex}`} className="h-4" tone={columnIndex === 0 ? 'block' : 'soft'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ cards = 4, className = '' }) {
  return (
    <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${className}`} aria-hidden="true">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={`skeleton-card-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/70">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
