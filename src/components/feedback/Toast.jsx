/**
 * Toast — feedback visual padronizado
 * Design System ZapERP — usa tokens (--ds-*) e suporta dark mode
 */
export default function Toast({
  title,
  message,
  type = "info",
  onClose,
  className = "",
  actionLabel,
  onAction,
  ...props
}) {
  const v = String(type || "").toLowerCase();
  const variant =
    v === "error"
      ? "error"
      : v === "warning"
        ? "warning"
        : v === "handoff"
          ? "handoff"
          : v === "success" || v === "ok"
            ? "success"
            : "info";

  const icons = {
    error: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    warning: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    success: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    info: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    handoff: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={title}
      className={`ds-toast ds-toast--${variant} ${className}`.trim()}
      {...props}
    >
      <span className="ds-toast__icon" aria-hidden>{icons[variant]}</span>
      <div className="ds-toast__content">
        <div className="ds-toast__title">{title}</div>
        {message ? <div className="ds-toast__message">{message}</div> : null}
        {actionLabel && typeof onAction === "function" ? (
          <div className="ds-toast__actions">
            <button type="button" className="ds-toast__action" onClick={onAction}>
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="ds-toast__close"
        >
          ×
        </button>
      )}
    </div>
  );
}
