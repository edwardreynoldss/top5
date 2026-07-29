"use client";

import { useEditor } from "@/lib/store";

export function TitleEditor() {
  const { project, updateTitle, updateSettings } = useEditor();
  const { title, rankColors } = project.settings;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Title & ranks</h2>
        <p className="muted">Customize the header — nothing is locked to a theme</p>
      </div>

      <div className="field-grid">
        <label className="field">
          <span>Before highlight</span>
          <input
            className="input"
            value={title.prefix}
            onChange={(e) => updateTitle({ prefix: e.target.value })}
            placeholder="RANKING BEST"
          />
        </label>
        <label className="field">
          <span>Highlight word</span>
          <input
            className="input"
            value={title.highlight}
            onChange={(e) => updateTitle({ highlight: e.target.value })}
            placeholder="FALLING"
          />
        </label>
        <label className="field">
          <span>After highlight</span>
          <input
            className="input"
            value={title.suffix}
            onChange={(e) => updateTitle({ suffix: e.target.value })}
            placeholder="MOMENTS"
          />
        </label>
        <label className="field">
          <span>Highlight color</span>
          <input
            type="color"
            className="color-input"
            value={title.highlightColor}
            onChange={(e) => updateTitle({ highlightColor: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Title bar opacity</span>
          <input
            type="range"
            min={0.3}
            max={0.95}
            step={0.01}
            value={title.barOpacity}
            onChange={(e) => updateTitle({ barOpacity: parseFloat(e.target.value) })}
          />
        </label>
      </div>

      <div className="rank-colors">
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
      </div>
    </section>
  );
}
