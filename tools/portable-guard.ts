// The whole-source guard (PLAN §2.1, §20 D366, D401; from investigation/portable-math, #171): keeps
// engine-dependent maths out of everything that computes a map, so Chromium, Firefox, WebKit, Node and the Rust
// ports compute the same bits. Run by tests/unit/portable.test.ts in CI's quick suite.
//
// Its scope is the core, the workers and the tools that produce data. Left out (D401): the renderer and the
// camera (operations record their results, so picking maths never reaches a replay) and the tools that only make
// pictures or time the renderer.

// TypeScript 7's CLI has no stable compiler API; use Microsoft's compatibility API for this guard.
import ts from "@typescript/typescript6";

/** Math's members that are exact arithmetic or constants in every engine: anything else is rejected. */
const EXACT = new Set(["abs", "ceil", "floor", "round", "trunc", "min", "max", "sign", "imul", "clz32", "fround", "PI", "E", "LN2", "LN10", "LOG2E", "LOG10E", "SQRT1_2", "SQRT2"]);
/** Maths libraries that would bring their own native calls. */
const LIBRARIES = ["mathjs", "gl-matrix", "numeric", "decimal.js", "@stdlib/math"];
/** Files that may use WebAssembly: each an audited binding (keep this short). */
const WASM_ALLOWED = new Set(["src/core/math/portable.ts", "src/core/sim/rustWater.ts", "src/core/forces/rust/bridge.ts", "src/core/analysis/rust/bridge.ts", "src/core/validate/rust.ts", "tools/rust/build.ts", "tools/rust/check.ts", "tools/rust/guard.mjs"]);

/** Tools that only make pictures or time the renderer (the smoothness gate among them). */
const PRESENTATION_TOOL = /^tools\/(smooth\/|capture-|bench3d\.ts$|measure-(ceiling|high)\.ts$|gif\.ts$|png\.ts$|sheet\.ts$|contact-sheet|start-sheet|resources-sheet|waterfall-gallery|shader-sources)/;

/** True when a repository path (forward slashes) is in the guard's scope. */
export function inGuard(file: string): boolean {
  if (!/\.[cm]?[jt]sx?$/.test(file) || /\.d\.[cm]?ts$/.test(file)) return false;
  if (file.startsWith("src/core/") || file.startsWith("src/worker/")) return true;
  if (file.startsWith("src/") && /\.worker\.tsx?$/.test(file)) return !file.startsWith("src/render3d/");
  return file.startsWith("tools/") && !PRESENTATION_TOOL.test(file);
}

/** Every place a file could reach engine-dependent maths: any use of Math other than an exact member
 *  (aliases, destructuring and Math[…] included), `**`, non-exact Math inside strings a page may evaluate,
 *  eval and Function, WebAssembly outside its audited bindings, maths libraries, and in src/core any outside
 *  module but fflate. Each finding is "file:line: code". */
export function violations(source: string, file: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const add = (n: ts.Node, text = n.getText(sf)) => found.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${text.replace(/\s+/g, " ").slice(0, 100)}`);
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === "Math") {
      const p = n.parent;
      if (!(ts.isPropertyAccessExpression(p) && p.expression === n && EXACT.has(p.name.text))) add(p);
    }
    if (ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression) && n.argumentExpression.text === "Math") add(n);
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken || n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) add(n);
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const raw = n.getText(sf);
      for (const m of raw.matchAll(/\bMath\s*\.\s*([A-Za-z_$][\w$]*)/g)) if (!EXACT.has(m[1])) add(n, m[0]);
      if (/\bMath\s*\[/.test(raw)) add(n);
    }
    if (ts.isIdentifier(n) && n.text === "eval") add(n.parent);
    if ((ts.isCallExpression(n) || ts.isNewExpression(n)) && n.expression.getText(sf) === "Function") add(n);
    if (ts.isIdentifier(n) && n.text === "WebAssembly" && !WASM_ALLOWED.has(file)) add(n.parent);
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const from = n.moduleSpecifier.text;
      if (LIBRARIES.some((m) => from === m || from.startsWith(m + "/"))) add(n);
      if (file.startsWith("src/core/") && !n.importClause?.isTypeOnly && !from.startsWith(".") && from !== "fflate") add(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}
