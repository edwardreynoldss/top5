"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { createLine } from "@/lib/defaults";
import { TITLE_FONTS, type TextAlign, type TitleFontId } from "@/lib/types";
import { CollapsibleSection } from "./CollapsibleSection";

export function TitleEditor({
  sectionOpen,
  onSectionOpenChange,
}: {
  sectionOpen: Record<string, boolean>;
  onSectionOpenChange: (next: Record<string, boolean>) => void;
}) {
  const {
    project,
    updateTitle,
    updateRanksLayout,
    updateTitleWord,
    addTitleWord,
    removeTitleWord,
    setTitleLines,
    updateSettings,
    updateClip,
  } = useEditor();
  const { title, ranksLayout, rankColors } = project.settings;
  const inDepth = project.settings.inDepthRanking === true;

  function toggle(key: string) {
    onSectionOpenChange({ ...sectionOpen, [key]: !sectionOpen[key] });
  }

  function ensureTwoLines() {
    if (title.lines.length >= 2) return;
    setTitleLines([
      ...title.lines,
      createLine([{ text: "LINE TWO", color: "#39FF14" }]),
    ]);
  }

  function removeSecondLine() {
    if (title.lines.length < 2) return;
    setTitleLines(title.lines.slice(0, 1));
  }

  const wordCount = title.lines.reduce((n, l) => n + l.words.length, 0);

  return (
    <section className="panel tab-panel">
      <div className="panel-header compact">
        <h2>Title & ranks</h2>
        <p className="muted">Edit one section at a time — everything autosaves</p>
      </div>

      <label className="field check title-enable">
        <input
          type="checkbox"
          checked={title.enabled !== false}
          onChange={(e) => updateTitle({ enabled: e.target.checked })}
        />
        <span>Show title</span>
      </label>
      {title.enabled === false && (
        <p className="muted" style={{ marginTop: "-0.35rem" }}>
          Title text and bar are hidden in preview and export.
        </p>
      )}

      <CollapsibleSection
        title="Words & colors"
        subtitle="Line 1–2 text and highlights"
        badge={`${wordCount} words`}
        open={!!sectionOpen.words && title.enabled !== false}
        onToggle={() => toggle("words")}
      >
        <div className="title-lines">
          {title.lines.slice(0, 2).map((line, lineIndex) => (
            <div key={line.id} className="title-line-block">
              <div className="title-line-head">
                <strong>Line {lineIndex + 1}</strong>
                <button
                  className="btn ghost small"
                  type="button"
                  onClick={() => addTitleWord(line.id, "NEW", "#39FF14")}
                >
                  <Plus size={14} /> Add word
                </button>
              </div>
              <div className="word-list">
                {line.words.map((word) => (
                  <div key={word.id} className="word-row">
                    <input
                      className="input"
                      value={word.text}
                      onChange={(e) =>
                        updateTitleWord(line.id, word.id, { text: e.target.value })
                      }
                      placeholder="Word"
                    />
                    <input
                      type="color"
                      title="Word color"
                      value={word.color}
                      onChange={(e) =>
                        updateTitleWord(line.id, word.id, { color: e.target.value })
                      }
                    />
                    <button
                      className="icon-btn danger"
                      type="button"
                      disabled={line.words.length <= 1}
                      onClick={() => removeTitleWord(line.id, word.id)}
                      aria-label="Remove word"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="line-actions">
            {title.lines.length < 2 ? (
              <button className="btn ghost small" type="button" onClick={ensureTwoLines}>
                <Plus size={14} /> Add second title line
              </button>
            ) : (
              <button className="btn ghost small" type="button" onClick={removeSecondLine}>
                Remove second line
              </button>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Font & placement"
        subtitle="Size, align, bar, X/Y position"
        open={!!sectionOpen.style}
        onToggle={() => toggle("style")}
      >
        <div className="field-grid">
          <label className="field">
            <span>Font</span>
            <select
              className="input"
              value={title.fontId}
              onChange={(e) => updateTitle({ fontId: e.target.value as TitleFontId })}
            >
              {TITLE_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Title size ({title.fontSize}px)</span>
            <input
              type="range"
              min={28}
              max={96}
              step={1}
              value={title.fontSize}
              onChange={(e) => updateTitle({ fontSize: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="field">
            <span>Align</span>
            <select
              className="input"
              value={title.align}
              onChange={(e) => updateTitle({ align: e.target.value as TextAlign })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>

          <label className="field check">
            <input
              type="checkbox"
              checked={title.uppercase}
              onChange={(e) => updateTitle({ uppercase: e.target.checked })}
            />
            <span>Uppercase</span>
          </label>

          <label className="field check">
            <input
              type="checkbox"
              checked={title.showBar}
              onChange={(e) => updateTitle({ showBar: e.target.checked })}
            />
            <span>Show title bar background</span>
          </label>

          {title.showBar && (
            <>
              <label className="field">
                <span>Bar opacity</span>
                <input
                  type="range"
                  min={0.15}
                  max={0.95}
                  step={0.01}
                  value={title.barOpacity}
                  onChange={(e) => updateTitle({ barOpacity: parseFloat(e.target.value) })}
                />
              </label>
              <label className="field">
                <span>Bar height ({title.barHeight}px)</span>
                <input
                  type="range"
                  min={60}
                  max={280}
                  step={2}
                  value={title.barHeight}
                  onChange={(e) => updateTitle({ barHeight: parseInt(e.target.value, 10) })}
                />
              </label>
            </>
          )}

          <label className="field">
            <span>Title X ({title.x.toFixed(0)}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={title.x}
              onChange={(e) => updateTitle({ x: parseFloat(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Title Y ({title.y.toFixed(1)}%)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={0.1}
              value={title.y}
              onChange={(e) => updateTitle({ y: parseFloat(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Line gap ({title.lineGap}px)</span>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={title.lineGap}
              onChange={(e) => updateTitle({ lineGap: parseInt(e.target.value, 10) })}
            />
          </label>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Rank numbers"
        subtitle="Titles, position, size, label fade, colors 1–5"
        open={!!sectionOpen.ranks}
        onToggle={() => toggle("ranks")}
      >
        <p className="field-label">Titles under each number</p>
        <div className="rank-title-list">
          {[1, 2, 3, 4, 5].map((r) => {
            const clip = project.clips.find((c) => c.rank === r);
            return (
              <div key={r} className="rank-title-group">
                <label className="field rank-title-field">
                  <span>#{r}</span>
                  <input
                    className="input"
                    placeholder={clip ? "Label (e.g. WEEE)" : "No clip"}
                    value={clip?.label || ""}
                    disabled={!clip}
                    onChange={(e) => {
                      if (!clip) return;
                      updateClip(clip.id, { label: e.target.value });
                    }}
                  />
                </label>
                {inDepth ? (
                  <>
                    <label className="field rank-title-field">
                      <span title="Shown while this clip plays">While</span>
                      <input
                        className="input"
                        placeholder="This Cat does NOT care 😂"
                        value={clip?.inDepthText || ""}
                        disabled={!clip}
                        onChange={(e) => {
                          if (!clip) return;
                          updateClip(clip.id, { inDepthText: e.target.value });
                        }}
                      />
                    </label>
                    <label className="field rank-title-field">
                      <span title="Appended after the clip has played">Score</span>
                      <input
                        className="input"
                        placeholder="8.12"
                        value={clip?.score || ""}
                        disabled={!clip}
                        onChange={(e) => {
                          if (!clip) return;
                          updateClip(clip.id, { score: e.target.value });
                        }}
                      />
                    </label>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        {inDepth ? (
          <p className="muted edge-crop-hint">
            While playing: “{"{#}"}. While-text”. After it plays: “{"{#}"}. Label -
            Score”.
          </p>
        ) : null}

        <div className="field-grid">
          <label className="field">
            <span>Ranks X ({ranksLayout.x.toFixed(1)}%)</span>
            <input
              type="range"
              min={0}
              max={70}
              step={0.5}
              value={ranksLayout.x}
              onChange={(e) => updateRanksLayout({ x: parseFloat(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Ranks Y ({ranksLayout.y.toFixed(1)}%)</span>
            <input
              type="range"
              min={5}
              max={60}
              step={0.5}
              value={ranksLayout.y}
              onChange={(e) => updateRanksLayout({ y: parseFloat(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Number size ({ranksLayout.fontSize}px)</span>
            <input
              type="range"
              min={40}
              max={140}
              step={2}
              value={ranksLayout.fontSize}
              onChange={(e) =>
                updateRanksLayout({ fontSize: parseInt(e.target.value, 10) })
              }
            />
          </label>
          <label className="field">
            <span>Label size ({ranksLayout.labelSize}px)</span>
            <input
              type="range"
              min={16}
              max={80}
              step={2}
              value={ranksLayout.labelSize}
              onChange={(e) =>
                updateRanksLayout({ labelSize: parseInt(e.target.value, 10) })
              }
            />
          </label>
          <label className="field">
            <span>Number spacing ({ranksLayout.gap}px)</span>
            <input
              type="range"
              min={60}
              max={180}
              step={2}
              value={ranksLayout.gap}
              onChange={(e) => updateRanksLayout({ gap: parseInt(e.target.value, 10) })}
            />
          </label>
          <label className="field">
            <span>Rank font</span>
            <select
              className="input"
              value={ranksLayout.fontId}
              onChange={(e) =>
                updateRanksLayout({ fontId: e.target.value as TitleFontId })
              }
            >
              {TITLE_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field check">
          <input
            type="checkbox"
            checked={ranksLayout.labelDimEnabled !== false}
            onChange={(e) =>
              updateRanksLayout({ labelDimEnabled: e.target.checked })
            }
          />
          <span>Fade past labels (numbers stay solid)</span>
        </label>
        {ranksLayout.labelDimEnabled !== false ? (
          <div className="field-grid">
            <label className="field">
              <span>
                Past label opacity (
                {Math.round((ranksLayout.labelDimOpacity ?? 0.35) * 100)}%)
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ranksLayout.labelDimOpacity ?? 0.35}
                onChange={(e) =>
                  updateRanksLayout({
                    labelDimOpacity: parseFloat(e.target.value),
                  })
                }
              />
            </label>
            <label className="field">
              <span>
                Active label opacity (
                {Math.round((ranksLayout.labelActiveOpacity ?? 1) * 100)}%)
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ranksLayout.labelActiveOpacity ?? 1}
                onChange={(e) =>
                  updateRanksLayout({
                    labelActiveOpacity: parseFloat(e.target.value),
                  })
                }
              />
            </label>
          </div>
        ) : null}
        {inDepth ? (
          <label className="field">
            <span>
              In Depth fade-to ({Math.round((ranksLayout.inDepthFadeTo ?? 0.45) * 100)}%)
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ranksLayout.inDepthFadeTo ?? 0.45}
              onChange={(e) =>
                updateRanksLayout({ inDepthFadeTo: parseFloat(e.target.value) })
              }
            />
          </label>
        ) : null}
        <p className="muted edge-crop-hint">
          When a new rank plays, earlier titles fade and the current title stays
          bright. The # numbers never change transparency.
          {inDepth
            ? " In Depth Ranking eases the playing clip's line down to the fade-to level across the clip."
            : ""}
        </p>

        <p className="field-label">Rank colors</p>
        <div className="rank-color-row">
          {[1, 2, 3, 4, 5].map((r) => (
            <label key={r} className="rank-color">
              <span>#{r}</span>
              <input
                type="color"
                value={rankColors[r] || "#ffffff"}
                onChange={(e) =>
                  updateSettings({
                    rankColors: { ...rankColors, [r]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
      </CollapsibleSection>
    </section>
  );
}
