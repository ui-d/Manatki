// @vitest-environment node
import { describe, expect, it } from "vitest";

import { sanitizeSlideHtml } from "../../app/lib/sanitize-slide-html";

import installSanitizerDom from "./sanitizer-dom";

describe("sanitizer on the server", () => {
  it("fails safe (escapes) when no DOM is available", () => {
    expect(typeof DOMParser).toBe("undefined");
    const out = sanitizeSlideHtml('<div onclick="alert(1)">hi</div>');
    expect(out).not.toContain("<div");
    expect(out).toContain("&lt;div");
  });

  it("takes the full DOM allowlist path once the plugin installs happy-dom", () => {
    installSanitizerDom();
    expect(typeof DOMParser).not.toBe("undefined");

    const out = sanitizeSlideHtml(
      '<div class="fmd-slide" style="display:flex" onclick="alert(1)"><script>alert(1)</script><a href="javascript:x">x</a>ok</div>',
    );
    expect(out).toContain("<div");
    expect(out).toContain("display: flex");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("javascript:");
  });
});
