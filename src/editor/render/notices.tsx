// The notices strip under the map.

import type { Ed } from "../ed";

export function noticesStrip(ed: Ed) {
  const { noticesOpen, notices, flags, importChanges, info, run, api, setNoticesOpen } = ed;

  return noticesOpen && (notices.length || flags.length || importChanges) ? (
    <div class="editor-notices" role="status">
      {info.importReport && importChanges ? (
        <p>
          Opened {info.name}. {importChanges} change{importChanges > 1 ? "s were" : " was"} needed to bring it to the current game version
          {info.importReport.changes.some((c) => c.level === "warning") ? ":" : "."}
        </p>
      ) : null}
      <ul>
        {notices.map((n) => (
          <li key={n}>{n}</li>
        ))}
        {flags.map((f) => (
          <li key={f.id}>
            {f.message}{" "}
            <button type="button" class="linkish" onClick={() => void run(() => api.applyAll([f.fix], f.fix.label, "fix"))}>
              {f.fix.label}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="linkish" onClick={() => setNoticesOpen(false)}>
        Hide
      </button>
    </div>
  ) : null;
}
