/**
 * Skeleton — placeholder de carregamento
 * Design System ZapERP — usa tokens
 */
export default function Skeleton({ variant = "line", width, className = "", style = {}, ...props }) {
  const combinedStyle = { ...(width ? { width: typeof width === "number" ? `${width}px` : width } : {}), ...style };
  return (
    <div
      className={`ds-skeleton ds-skeleton--${variant} ${className}`.trim()}
      style={combinedStyle}
      aria-hidden
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="ds-skeleton-card">
      <Skeleton variant="line" width="60%" />
      <Skeleton variant="line" width="40%" style={{ marginTop: 8 }} />
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="ds-skeleton-grid">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
