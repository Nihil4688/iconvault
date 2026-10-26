// "Stable Unicode codepoints mapping": every glyph of the built font with the character it sits on, the CSS entity that draws it and its CSS class (with a copy button). Editors can type a new character (four hex digits, E000 to F8FF); it is saved on the icon and the font is rebuilt, so the preview, the stylesheet and the download all use it. Clearing the box hands the icon the next free character on the next build. Viewers see the table without editing.
import { Copy } from "lucide-react";
import { useState } from "react";
import type { FontCodepoint } from "../../api/types";
import { cn } from "../../lib/cn";
import { codepointProblem } from "../../lib/codepoint";
import { glyphChar } from "../../lib/fontPreview";

type CodepointTableProps = {
  glyphs: FontCodepoint[];
  // The preview font family, or null when the browser could not load it.
  family: string | null;
  canEdit: boolean;
  // True while a build is running: editing waits for it.
  busy: boolean;
  // Saves the new character (null clears it) and rebuilds; rejects with the reason when it cannot.
  onSave: (glyph: FontCodepoint, codepoint: string | null) => Promise<void>;
  onCopyClass: (className: string) => void;
};

export default function CodepointTable({ glyphs, family, canEdit, busy, onSave, onCopyClass }: CodepointTableProps) {
  return (
    <div className="relative overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-3xl text-left text-sm">
        <caption className="sr-only">Stable Unicode codepoints mapping</caption>
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-16 px-3 py-2 font-medium">
              Preview
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Icon name
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Slug
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Assigned hex codepoint
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              CSS entity
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              CSS class
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {glyphs.map((glyph) => (
            <Row key={glyph.id} glyph={glyph} family={family} canEdit={canEdit} busy={busy} onSave={onSave} onCopyClass={onCopyClass} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ glyph, family, canEdit, busy, onSave, onCopyClass }: { glyph: FontCodepoint; family: string | null } & Pick<CodepointTableProps, "canEdit" | "busy" | "onSave" | "onCopyClass">) {
  // null means "not being edited": the box shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? glyph.codepoint;
  const errorId = `codepoint-error-${glyph.id}`;

  async function commit() {
    if (draft === null || saving) return;
    const text = draft.trim().toUpperCase();
    if (text === glyph.codepoint) {
      setDraft(null);
      setError(null);
      return;
    }
    const problem = codepointProblem(text);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(glyph, text === "" ? null : text);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the character.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-xl leading-none" style={family ? { fontFamily: `"${family}"` } : undefined}>
          {family ? glyphChar(glyph.codepoint) : "▢"}
        </span>
      </td>
      <td className="px-3 py-2 font-medium">{glyph.name}</td>
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{glyph.slug}</td>
      <td className="px-3 py-2">
        {canEdit ? (
          <div>
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="font-mono text-xs text-muted-foreground">
                U+
              </span>
              <input
                value={value}
                onChange={(event) => {
                  setDraft(event.target.value.replace(/[^0-9a-fA-F]/g, "").toUpperCase().slice(0, 4));
                  setError(null);
                }}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commit();
                  } else if (event.key === "Escape" && draft !== null) {
                    event.stopPropagation();
                    setDraft(null);
                    setError(null);
                  }
                }}
                disabled={busy || saving}
                aria-label={`Codepoint for ${glyph.name}`}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                autoComplete="off"
                spellCheck={false}
                maxLength={4}
                className={cn("h-8 w-20 rounded-md border bg-background px-2 font-mono text-sm uppercase focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60", error ? "border-destructive" : "border-input")}
              />
              {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
              {glyph.isNew && !saving && <span className="rounded bg-primary/10 px-1 text-xs text-primary">new</span>}
            </div>
            {error && (
              <p id={errorId} role="alert" className="mt-1 max-w-xs text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>
        ) : (
          <span className="font-mono">
            U+{glyph.codepoint}
            {glyph.isNew && <span className="ml-1.5 rounded bg-primary/10 px-1 text-xs text-primary">new</span>}
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono text-xs">{`\\${glyph.codepoint.toLowerCase()}`}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="max-w-48 truncate font-mono text-xs">{glyph.className}</span>
          <button type="button" onClick={() => onCopyClass(glyph.className)} aria-label={`Copy class ${glyph.className}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </span>
      </td>
    </tr>
  );
}
