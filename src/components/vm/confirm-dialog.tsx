"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, Power } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "primary" | "danger" | "secondary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  variant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "button danger"
      : variant === "secondary"
        ? "button secondary"
        : "button button-primary";

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className="modal-header">
          <span className="brand-icon" aria-hidden="true">
            {variant === "danger" ? (
              <AlertTriangle size={18} />
            ) : (
              <Power size={18} />
            )}
          </span>
          <div>
            <p className="eyebrow">CONFIRM OPERATION</p>
            <h2 id="confirm-dialog-title">{title}</h2>
          </div>
        </div>
        <p id="confirm-dialog-desc" className="muted">
          {description}
        </p>
        <div className="actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmClass}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy && <Loader2 size={15} className="spin" aria-hidden="true" />}
            <span>{busy ? "Submitting…" : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
