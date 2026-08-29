import { describe, expect, it } from "vitest";

// React Query caches by key, not by call site. Two useQuery calls sharing a key
// but returning different shapes means whichever mounts first wins, and the
// other reads fields that are not there.
//
// This is not hypothetical. SchedulePage used ["members", storeId] with an
// inline queryFn returning {id, name}, while seven other call sites used the
// same key expecting listMembers()'s MemberWithProfile. Visiting Schedule and
// then navigating to Payroll within staleTime crashed on
// `m.user_id.substring(0, 8)` — and a hard refresh "fixed" it, because that
// emptied the cache.
//
// TypeScript cannot catch this: each useQuery infers its own type from its own
// queryFn, and keys are not type-linked across files. So it is checked here.
//
// Read via import.meta.glob rather than node:fs so the test needs no @types/node.
const sources = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("react-query key/shape contract", () => {
  it('every ["members", …] query fetches through listMembers', () => {
    const offenders: string[] = [];

    for (const [path, source] of Object.entries(sources)) {
      if (/\.test\.tsx?$/.test(path)) continue;
      const lines = source.split("\n");

      lines.forEach((line: string, i: number) => {
        if (!/queryKey:\s*\[\s*"members"\s*,/.test(line)) return;
        // Only a useQuery WRITES a shape into the cache. invalidateQueries,
        // removeQueries and friends name the same key but store nothing, so
        // they are not part of this contract.
        const before = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (!/useQuery\s*\(/.test(before)) return;
        // The queryFn sits within a few lines of the key at every call site.
        const after = lines.slice(i, i + 8).join("\n");
        if (!after.includes("listMembers")) {
          offenders.push(`${path}:${i + 1}`);
        }
      });
    }

    expect(
      offenders,
      `These use the ["members", …] cache key without going through ` +
        `listMembers, so they can write a different shape into the same key ` +
        `that every other consumer reads:\n  ${offenders.join("\n  ")}\n\n` +
        `Fix by calling listMembers(storeId) and deriving whatever local ` +
        `shape you need OUTSIDE the query, or by using your own cache key.`,
    ).toEqual([]);
  });

  it("finds the call sites it is meant to be guarding", () => {
    // Guards the guard: if a refactor moves these queries somewhere this glob
    // or regex no longer matches, the test above would pass vacuously.
    const hits = Object.entries(sources).filter(
      ([p, s]) =>
        !/\.test\.tsx?$/.test(p) && /queryKey:\s*\[\s*"members"\s*,/.test(s),
    );
    expect(hits.length).toBeGreaterThanOrEqual(6);
  });
});
