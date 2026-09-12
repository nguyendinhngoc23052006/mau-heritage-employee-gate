import { describe, expect, it } from "vitest";

// public/_headers is a deploy-time contract with Cloudflare Pages that nothing
// else in the build validates. Two of its rules are load-bearing for the stale-
// bundle check: index.html names the hashed bundle, and version.json is how a
// running tab learns it is behind. A cached copy of either reports the state
// the tab is already in, which is the one answer that is never useful.
const files = import.meta.glob("../../public/_*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const headers =
  Object.entries(files).find(([p]) => p.endsWith("_headers"))?.[1] ?? "";

function ruleFor(path: string): string {
  const blocks = headers.split(/\n(?=\S)/);
  return blocks.find((b) => b.split("\n")[0].trim() === path) ?? "";
}

describe("Cloudflare Pages _headers", () => {
  it("is present and non-empty", () => {
    expect(headers.length).toBeGreaterThan(0);
  });

  it.each(["/", "/index.html", "/version.json"])(
    "%s is served no-cache",
    (path) => {
      expect(ruleFor(path)).toMatch(/Cache-Control:\s*no-cache/i);
    },
  );

  it("hashed assets are cached immutably", () => {
    expect(ruleFor("/assets/*")).toMatch(/Cache-Control:.*immutable/i);
  });
});
