/**
 * Button — componente base do Design System ZapERP
 * Variantes: primary, secondary, outline, ghost, danger
 * Tamanhos: sm (32px), default (40px), lg (48px)
 */
export default function Button({
  variant = "primary",
  size = "default",
  children,
  disabled,
  type = "button",
  className = "",
  ...props
}) {
  const classes = [
    "ds-btn",
    `ds-btn--${variant}`,
    size !== "default" ? `ds-btn--${size}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} disabled={disabled} className={classes} {...props}>
      {children}
    </button>
  );
}
