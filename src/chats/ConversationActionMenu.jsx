import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_WIDTH = 232;
const MENU_GAP = 6;
const VIEWPORT_PADDING = 8;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export default function ConversationActionMenu({
  isOpen,
  anchorRect,
  actions,
  onRequestClose,
  onAction,
}) {
  const menuRef = useRef(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: "bottom" });

  const availableActions = useMemo(
    () => (Array.isArray(actions) ? actions.filter((a) => a?.visible !== false) : []),
    [actions]
  );

  useEffect(() => {
    if (!isOpen || !anchorRect) return;
    const menuHeight = menuRef.current?.offsetHeight || 232;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = anchorRect.right - MENU_WIDTH;
    left = clamp(left, VIEWPORT_PADDING, viewportW - MENU_WIDTH - VIEWPORT_PADDING);

    const canOpenBottom = anchorRect.bottom + MENU_GAP + menuHeight <= viewportH - VIEWPORT_PADDING;
    const top = canOpenBottom
      ? anchorRect.bottom + MENU_GAP
      : Math.max(VIEWPORT_PADDING, anchorRect.top - MENU_GAP - menuHeight);

    setPosition({
      left: Math.round(left),
      top: Math.round(top),
      placement: canOpenBottom ? "bottom" : "top",
    });
  }, [isOpen, anchorRect, availableActions.length]);

  useEffect(() => {
    if (!isOpen) return;
    const firstEnabled = availableActions.findIndex((a) => !a?.disabled);
    const idx = firstEnabled >= 0 ? firstEnabled : 0;
    setFocusedIdx(idx);
    requestAnimationFrame(() => {
      const el = menuRef.current?.querySelector(`[data-menu-idx="${idx}"]`);
      if (el && typeof el.focus === "function") el.focus();
    });
  }, [isOpen, availableActions]);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target)) return;
      onRequestClose?.();
    };
    const onEsc = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onRequestClose?.();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [isOpen, onRequestClose]);

  if (!isOpen || !anchorRect) return null;

  const onKeyDown = (e) => {
    if (!availableActions.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let next = focusedIdx;
      for (let i = 0; i < availableActions.length; i += 1) {
        next = (next + dir + availableActions.length) % availableActions.length;
        if (!availableActions[next]?.disabled) break;
      }
      setFocusedIdx(next);
      const el = menuRef.current?.querySelector(`[data-menu-idx="${next}"]`);
      el?.focus?.();
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const order = e.key === "Home"
        ? [...availableActions.keys()]
        : [...availableActions.keys()].reverse();
      const next = order.find((idx) => !availableActions[idx]?.disabled) ?? 0;
      setFocusedIdx(next);
      const el = menuRef.current?.querySelector(`[data-menu-idx="${next}"]`);
      el?.focus?.();
      return;
    }
    if (e.key === "Tab") onRequestClose?.();
  };

  return createPortal(
    <div
      ref={menuRef}
      className={`conversation-action-menu is-${position.placement}`}
      role="menu"
      aria-label="Ações da conversa"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      onKeyDown={onKeyDown}
    >
      {availableActions.map((action, idx) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className={`conversation-action-menu-item ${action.danger ? "is-danger" : ""}`}
          data-menu-idx={idx}
          disabled={!!action.disabled}
          title={action.tooltip || action.label}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (action.disabled) return;
            onAction?.(action);
          }}
        >
          <span className="conversation-action-menu-icon" aria-hidden>{action.icon}</span>
          <span className="conversation-action-menu-label">{action.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

