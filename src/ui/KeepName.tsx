// Keep this version asks for the version's name (History; Your maps would otherwise fill with versions named after their
// last step, two of them with the very same name): the field holds the name it would get, selected, so Enter keeps it as
// it is and typing replaces it. Esc or Cancel keeps nothing. The same two-line limit the other name fields use.

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { cleanMapName } from "../core/doc/document";
import { fitsHeaderTwoLines, limitName } from "../editor/nameFit";

export function KeepName(p: { name: string; onDone(name: string | null): void }) {
  const [text, setText] = useState(p.name);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const keep = () => {
    const r = cleanMapName(text);
    if (!r.ok) return setProblem(r.reason);
    p.onDone(r.name);
  };
  return (
    <div class="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && p.onDone(null)}>
      <div
        class="dialog keep-name"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keep-name-head"
        onKeyDown={(e) => {
          // (the editor's keys wait while a name is typed; Esc ends only this)
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            p.onDone(null);
          } else if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            keep();
          }
        }}
      >
        <h2 id="keep-name-head">Name this version</h2>
        <input
          ref={input}
          class="set-text keep-name-field"
          value={text}
          maxLength={80}
          spellcheck={false}
          autoComplete="off"
          aria-label="Version name"
          aria-invalid={problem ? "true" : undefined}
          title={problem ?? "The name it is kept under"}
          onInput={(e) => {
            setProblem(null);
            setText(limitName(e.target as HTMLInputElement, text, fitsHeaderTwoLines));
          }}
        />
        {problem ? (
          <p class="error" role="alert">
            {problem}
          </p>
        ) : null}
        <footer>
          <button type="button" class="ghost" title="Keep nothing" onClick={() => p.onDone(null)}>
            Cancel
          </button>
          <button type="button" class="primary" title="Keep it in Your maps" onClick={keep}>
            Keep
          </button>
        </footer>
      </div>
    </div>
  );
}
