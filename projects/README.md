# Previous films (editor archives)

Full editor snapshots are saved here so you can reopen a film after Reset or mistakes.

Each archive is a folder:

```
projects/{id}/
  meta.json      # label, channel, date, reason
  project.json   # full EditorProject (clips, settings, SFX, export slot)
```

## When films are saved

- After a successful **Export MP4**
- Immediately before **Reset** (when the editor has clips)
- When you click **Save checkpoint** in **Open previous**
- Automatically before opening another film (safety snapshot)

Reopening / peeking overwrites the matching slot instead of stacking copies
(e.g. one shared `safety-before-open` snapshot, and one archive per export
identity + reason).

## Retention

Archives older than about **2 months** (60 days) are pruned automatically. At most 200 snapshots are kept.

## Restore note

Snapshots store media **IDs**, not video files. Clips still need to exist under `tmp/uploads/` (and music/sfx folders) on this machine.
