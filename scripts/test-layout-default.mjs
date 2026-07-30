import assert from "node:assert/strict";

function layoutSettingsFromProject(settings) {
  const next = JSON.parse(JSON.stringify(settings));
  next.musicMediaId = null;
  next.musicUrl = null;
  return next;
}

function applyReset(savedLayout, builtIn) {
  const settings = savedLayout || builtIn;
  return {
    clipsEmpty: true,
    titleX: settings.title.x,
    titleY: settings.title.y,
    ranksX: settings.ranksLayout.x,
    ranksY: settings.ranksLayout.y,
    musicMediaId: settings.musicMediaId,
  };
}

const builtIn = {
  title: { x: 50, y: 2.2 },
  ranksLayout: { x: 3.5, y: 11 },
  musicMediaId: null,
  musicUrl: null,
};

const customized = {
  title: { x: 12, y: 8 },
  ranksLayout: { x: 20, y: 30 },
  musicMediaId: "abc",
  musicUrl: "/api/media/abc",
};

const saved = layoutSettingsFromProject(customized);
assert.equal(saved.musicMediaId, null);
assert.equal(saved.title.x, 12);

const afterReset = applyReset(saved, builtIn);
assert.equal(afterReset.clipsEmpty, true);
assert.equal(afterReset.titleX, 12);
assert.equal(afterReset.titleY, 8);
assert.equal(afterReset.ranksX, 20);
assert.equal(afterReset.musicMediaId, null);

const withoutSaved = applyReset(null, builtIn);
assert.equal(withoutSaved.titleX, 50);

console.log("layout default persist tests passed");
