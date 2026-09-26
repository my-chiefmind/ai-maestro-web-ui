/**
 * Reports and Documentation tabs share this page: a list of .md/.html entries for one project
 * (or every project) and a read-only viewer. Markdown renders through react-markdown (never
 * innerHTML); HTML renders inside a fully sandboxed iframe so nothing in it runs in our origin.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { Window, Notice } from "./Window.jsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** @param {{kind: "reports" | "docs", scopeId: string | null, title: string}} props */
export function DocumentsPage({ kind, scopeId, title }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(/** @type {{project: string, id: string} | null} */ (null));
  const [doc, setDoc] = useState(null);
  const [docError, setDocError] = useState("");
  const noun = kind === "reports" ? "report" : "document";

  const load = () => {
    setPayload(null); setError(""); setSelected(null); setDoc(null); setDocError("");
    (kind === "reports" ? api.reports(scopeId) : api.docs(scopeId)).then(setPayload, (e) => setError(e.message || `Could not load ${kind}.`));
  };
  useEffect(load, [kind, scopeId]);

  useEffect(() => {
    if (!selected) return;
    let live = true;
    setDoc(null); setDocError("");
    (kind === "reports" ? api.report(selected.project, selected.id) : api.doc(selected.project, selected.id))
      .then((value) => { if (live) setDoc(value); }, (e) => { if (live) setDocError(e.message || `Could not open the ${noun}.`); });
    return () => { live = false; };
  }, [kind, selected]);

  const rows = useMemo(() => (payload?.[kind] ?? []).map((row) => ({ ...row, projectId: row.project?.id ?? scopeId })), [payload, kind, scopeId]);
  const isSelected = (row) => selected && selected.project === row.projectId && selected.id === row.id;

  return <Window title={title} kind={kind} actions={<button type="button" className="text-btn" onClick={load}>Refresh</button>}>
    {error && <Notice lines={[error]} title={`${title} failed to load`} />}
    {!payload && !error && <p className="muted pad loading">Loading {kind}…<span className="spinner" aria-hidden="true" /></p>}
    {payload?.errors?.length > 0 && <section className="project-errors" aria-labelledby={`${kind}-errors-title`}>
      <h3 id={`${kind}-errors-title`}>Projects needing attention</h3>
      {payload.errors.map((row) => <p key={row.project.id} className="project-error" role="alert"><strong>{row.project.name}</strong><span>{row.error}</span></p>)}
    </section>}
    {payload && <div className={`split-view documents ${selected ? "has-doc" : ""}`}>
      <nav className="item-list" aria-label={title}>
        {rows.length === 0 && <p className="muted pad">No {kind} yet.</p>}
        {rows.map((row, i) => (
          <button type="button" key={`${row.projectId}:${row.id}`} className="reveal" style={{ "--i": i }} aria-current={isSelected(row) ? "true" : undefined}
            onClick={() => setSelected({ project: row.projectId, id: row.id })}>
            {row.project && <span className="operation-project">{row.project.name}</span>}
            <span className="doc-title">{row.title}</span>
            <span className="doc-meta"><span className={`badge badge-${row.kind}`}>{row.kind === "html" ? "html" : "md"}</span> {row.id}{row.modifiedAt && <> · <time dateTime={row.modifiedAt}>{new Date(row.modifiedAt).toLocaleDateString()}</time></>}</span>
          </button>
        ))}
      </nav>
      <div className="doc-view">
        {!selected && <p className="muted pad">Pick a {noun} to read it.</p>}
        {selected && docError && <Notice lines={[docError]} title={`Could not open the ${noun}`} />}
        {selected && !doc && !docError && <p className="muted pad loading">Opening {noun}…<span className="spinner" aria-hidden="true" /></p>}
        {selected && doc && <article className="doc-article" aria-label={doc.title}>
          <header className="doc-head">
            <h3>{doc.title}</h3>
            <button type="button" className="text-btn doc-back" onClick={() => setSelected(null)}>Back to list</button>
          </header>
          {doc.kind === "html"
            ? <iframe className="doc-frame" title={doc.title} sandbox="" srcDoc={doc.content} />
            : <Markdown source={doc.content} assetBase={assetBase(kind, selected.project)} />}
        </article>}
      </div>
    </div>}
  </Window>;
}

/** Headings shift down two levels so a report's "# Title" sits under the page's own headings. */
const shift = (/** @type {number} */ level) => (/** @type {any} */ { node, ...props }) => {
  const H = `h${Math.min(6, level + 2)}`; return <H {...props} />;
};
/** The read-only image route for one project's docs or reports directory. */
export const assetBase = (/** @type {string} */ kind, /** @type {string} */ project) =>
  `/api/boards/${encodeURIComponent(project)}/${kind === "reports" ? "reports" : "docs"}-assets/`;

/**
 * Map a Markdown image src to the asset route, or null when it must not load: absolute URLs
 * (no remote fetches), root-absolute or scheme paths, and anything climbing with `..`.
 * @param {string | undefined} src @param {string | undefined} base
 */
export function assetUrl(src, base) {
  if (!base || typeof src !== "string") return null;
  const path = src.trim().replace(/[?#].*$/, "").replace(/^(\.\/)+/, "");
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("/") || path.includes("\\")) return null;
  let segments;
  try { segments = path.split("/").map((s) => decodeURIComponent(s)); } catch { return null; }
  if (segments.some((s) => !s || s === "." || s === ".." || s.startsWith("."))) return null;
  return base + segments.map(encodeURIComponent).join("/");
}

const placeholder = (/** @type {string | undefined} */ alt) => <span className="muted">{alt ? `[image: ${alt}]` : "[image]"}</span>;

const MARKDOWN_COMPONENTS = {
  h1: shift(1), h2: shift(2), h3: shift(3), h4: shift(4), h5: shift(5), h6: shift(6),
  // Only absolute web and mail links are followed; relative or other schemes stay plain text.
  a: (/** @type {any} */ { node, href, children }) => /^(https?:|mailto:)/i.test(href ?? "")
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
};

/**
 * CommonMark + GFM (tables, task lists, strikethrough) via react-markdown: it builds React
 * elements, never innerHTML, and raw HTML in the source is dropped rather than rendered.
 * Relative images load from `assetBase` (the project's asset route); remote ones stay text.
 * @param {{source: string, assetBase?: string}} props
 */
export function Markdown({ source, assetBase: base }) {
  const components = useMemo(() => ({
    ...MARKDOWN_COMPONENTS,
    img: (/** @type {any} */ { src, alt }) => {
      const url = assetUrl(src, base);
      return url ? <img src={url} alt={alt ?? ""} loading="lazy" style={{ maxWidth: "100%" }} /> : placeholder(alt);
    },
  }), [base]);
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{source}</ReactMarkdown></div>;
}
