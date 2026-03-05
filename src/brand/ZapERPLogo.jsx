import { useRef, useEffect } from "react";
import "./ZapERPLogo.css";

/**
 * ZapERPLogo — SVG + CSS (premium/tech)
 *
 * variant: "horizontal" | "compact" | "wordmark"
 * size: "sm" | "md" | "lg"
 * mode: "auto" | "light" | "dark"
 * tone: "full" | "mono"
 *
 * interactive: tilt + spotlight + click ripple
 */
export default function ZapERPLogo({
  variant = "horizontal",
  mode = "auto",
  tone = "full",
  name = "ZapERP",
  tagline = "Atendimento inteligente",
  size = "md",
  className = "",
  title = "ZapERP",
  interactive = true,
}) {
  const v = String(variant || "horizontal");
  const m = String(mode || "auto");
  const t = String(tone || "full");
  const s = String(size || "md");

  const rootRef = useRef(null);

  useEffect(() => {
    if (!interactive || !rootRef.current) return;

    const el = rootRef.current;
    let raf = 0;

    const setVars = (px, py) => {
      // px/py: 0..1
      const rx = (py - 0.5) * -7; // deg
      const ry = (px - 0.5) * 10; // deg

      el.style.setProperty("--zpl-rx", `${rx}deg`);
      el.style.setProperty("--zpl-ry", `${ry}deg`);
      el.style.setProperty("--zpl-mx", `${px * 100}%`);
      el.style.setProperty("--zpl-my", `${py * 100}%`);

      // “energy” para dar punch no brilho quando mexe
      const energy = Math.min(1, Math.max(0, Math.abs(px - 0.5) + Math.abs(py - 0.5)));
      el.style.setProperty("--zpl-energy", `${energy}`);
    };

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVars(px, py));
    };

    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--zpl-rx", "0deg");
        el.style.setProperty("--zpl-ry", "0deg");
        el.style.setProperty("--zpl-energy", "0");
        el.style.setProperty("--zpl-mx", "50%");
        el.style.setProperty("--zpl-my", "50%");
      });
    };

    const onDown = (e) => {
      // Ripple premium no clique (sem state, só DOM)
      const mark = el.querySelector(".zpl-mark");
      if (!mark) return;

      const rect = mark.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const ripple = document.createElement("span");
      ripple.className = "zpl-ripple";
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;

      mark.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });

      // “kick” de brilho ao clicar
      el.style.setProperty("--zpl-click", "1");
      window.clearTimeout(el.__zplClickT);
      el.__zplClickT = window.setTimeout(() => {
        el.style.setProperty("--zpl-click", "0");
      }, 220);
    };

    // defaults
    el.style.setProperty("--zpl-mx", "50%");
    el.style.setProperty("--zpl-my", "50%");
    el.style.setProperty("--zpl-energy", "0");
    el.style.setProperty("--zpl-click", "0");

    el.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("pointerdown", onDown);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
    };
  }, [interactive]);

  return (
    <div
      ref={rootRef}
      className={[
        "zpl",
        `zpl--${v}`,
        `zpl--mode-${m}`,
        `zpl--tone-${t}`,
        `zpl--${s}`,
        interactive ? "zpl--interactive" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      role="img"
      title={title}
    >
      {v !== "wordmark" && (
        <span className="zpl-mark" aria-hidden="true">
          <svg className="zpl-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Balão flat — ícone minimal e reconhecível */}
            <path
              className="zpl-bubble"
              d="M18 14h28a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H34l-10 8v-8h-6a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8Z"
              fill="var(--zpl-bubble-fill)"
              stroke="var(--zpl-primary)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}

      {v !== "compact" && (
        <span className="zpl-word">
          <span className="zpl-name" aria-label={name}>
            {String(name || "").trim().toLowerCase() === "zaperp" ? (
              <>
                <span className="zpl-nameZap">Zap</span>
                <span className="zpl-nameERP">ERP</span>
              </>
            ) : (
              <span className="zpl-nameFull">{name}</span>
            )}
          </span>

          {tagline && <span className="zpl-tagline">{tagline}</span>}
        </span>
      )}
    </div>
  );
}
