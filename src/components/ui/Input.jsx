/**
 * Input — componente base do Design System ZapERP
 * Text, password, email; suporta label, erro e tokens --ds-*
 */
export default function Input({
  label,
  error,
  id,
  type = "text",
  className = "",
  wrapperClassName = "",
  ...props
}) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s/g, "-")}` : undefined);
  const classes = ["ds-input", className].filter(Boolean).join(" ");
  const wrapperClasses = ["ds-input-field", wrapperClassName].filter(Boolean).join(" ");

  return (
    <div className={wrapperClasses}>
      {label && (
        <label htmlFor={inputId} className="ds-input-label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        className={classes}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error && (
        <span id={`${inputId}-error`} className="ds-input-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
