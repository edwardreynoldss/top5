"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export function CollapsibleSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
  badge,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className={`collapse-section ${open ? "open" : ""}`}>
      <button type="button" className="collapse-trigger" onClick={onToggle} aria-expanded={open}>
        <div>
          <span className="collapse-title">{title}</span>
          {subtitle && <span className="collapse-sub">{subtitle}</span>}
        </div>
        <div className="collapse-right">
          {badge ? <span className="collapse-badge">{badge}</span> : null}
          <ChevronDown size={16} className={`collapse-chevron ${open ? "up" : ""}`} />
        </div>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}
