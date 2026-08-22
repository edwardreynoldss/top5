"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Smile, X } from "lucide-react";
import { EMOJI_GROUPS } from "@/lib/emojiData";

type TextField = HTMLInputElement | HTMLTextAreaElement;

function isTextField(el: EventTarget | null): el is TextField {
  if (!el || !(el instanceof HTMLElement)) return false;
  // The picker's own search box must never become the insert target
  if (el.dataset.emojiSearch === "true") return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    // Sliders / checkboxes / colour wells have no caret to insert into
    return ["text", "search", "url", "tel", "email", ""].includes(el.type);
  }
  return false;
}

/**
 * React tracks the previous value on the DOM node, so assigning `.value`
 * directly is swallowed on the next render. Going through the native setter and
 * dispatching an input event makes onChange fire as if the user typed.
 */
function insertIntoField(field: TextField, text: string) {
  const proto =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const next = field.value.slice(0, start) + text + field.value.slice(end);

  setter?.call(field, next);
  field.dispatchEvent(new Event("input", { bubbles: true }));

  const caret = start + text.length;
  requestAnimationFrame(() => {
    field.focus();
    try {
      field.setSelectionRange(caret, caret);
    } catch {
      // number-ish inputs don't support selection ranges
    }
  });
}

/**
 * Floating emoji keyboard. Inserts into the text field you used last, so it
 * works with every input in the editor without wrapping each one.
 */
export function EmojiPicker() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [groupIdx, setGroupIdx] = useState(0);
  const lastFieldRef = useRef<TextField | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Remember the caret owner before the picker steals focus
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isTextField(e.target)) lastFieldRef.current = e.target;
    };
    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_GROUPS[groupIdx]?.emoji ?? [];
    const hits = [];
    for (const group of EMOJI_GROUPS) {
      for (const entry of group.emoji) {
        if (entry[1].includes(q) || entry[0] === q) hits.push(entry);
        if (hits.length >= 240) return hits;
      }
    }
    return hits;
  }, [query, groupIdx]);

  const target = lastFieldRef.current;

  function pick(char: string) {
    const field = lastFieldRef.current;
    if (!field || !field.isConnected) return;
    insertIntoField(field, char);
  }

  return (
    <div className="emoji-picker-root">
      <button
        type="button"
        className={`btn ghost small emoji-picker-toggle ${open ? "is-open" : ""}`}
        title="Insert emoji into the last text box you clicked"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Smile size={14} /> Emoji
      </button>

      {open ? (
        <div
          className="emoji-picker-panel"
          ref={panelRef}
          // Keep the caret in the target field when clicking the grid, but let
          // the search box focus normally.
          onMouseDown={(e) => {
            const el = e.target as HTMLElement;
            if (el.dataset?.emojiSearch !== "true") e.preventDefault();
          }}
        >
          <div className="emoji-picker-head">
            <input
              className="input"
              placeholder="Search emoji (e.g. laugh, cat, fire)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // This one is a picker control, not an insert target
              data-emoji-search="true"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Close emoji picker"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </button>
          </div>

          {query.trim() ? null : (
            <div className="emoji-picker-tabs">
              {EMOJI_GROUPS.map((g, i) => (
                <button
                  key={g.name}
                  type="button"
                  className={`emoji-picker-tab ${i === groupIdx ? "active" : ""}`}
                  title={g.name}
                  onClick={() => setGroupIdx(i)}
                >
                  {g.emoji[0]?.[0] ?? "•"}
                </button>
              ))}
            </div>
          )}

          <div className="emoji-picker-grid">
            {results.map((entry, i) => (
              <button
                key={`${entry[0]}-${i}`}
                type="button"
                className="emoji-picker-cell"
                title={entry[1]}
                onClick={() => pick(entry[0])}
              >
                {entry[0]}
              </button>
            ))}
            {results.length === 0 ? (
              <p className="muted emoji-picker-empty">No emoji match “{query}”.</p>
            ) : null}
          </div>

          <p className="muted emoji-picker-hint">
            {target
              ? "Inserts at your cursor in the last text box you clicked."
              : "Click a text box first, then pick an emoji."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
