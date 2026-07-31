/**
 * Install a real DOM (happy-dom) on the server so `sanitizeSlideHtml` in
 * app/lib/sanitize-slide-html.ts takes the same DOM-based allowlist path
 * during SSR as it does in the browser. Without this, server renders of
 * public share/presentation pages fell back to a regex sanitizer with known
 * bypass classes (H5). The lib itself now fails safe (escapes everything)
 * when no DOM is present — this plugin is what makes slide HTML actually
 * render on SSR.
 */
import { Window } from "happy-dom";

export default (): void => {
  if (typeof globalThis.DOMParser !== "undefined") return;

  const window = new Window();
  globalThis.DOMParser = window.DOMParser as unknown as typeof DOMParser;
  // cleanNode() reads Node.TEXT_NODE / Node.ELEMENT_NODE constants.
  if (typeof globalThis.Node === "undefined") {
    globalThis.Node = window.Node as unknown as typeof Node;
  }
};
