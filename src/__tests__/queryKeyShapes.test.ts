import { describe, expect, it } from "vitest";

// React Query caches by key, not by call site. Two useQuery calls sharing a key
// but returning different data means whichever mounts first wins, and the other
// silently reads the first one's result for as long as it stays fresh.
//
// This is not hypothetical, and it is not a one-off. SchedulePage used
// ["members", storeId] with an inline queryFn returning {id, name}, while seven
// other call sites used the same key expecting listMembers()'s
// MemberWithProfile. Visiting Lịch and then Nhân sự or Bảng lương within
// staleTime crashed on `m.user_id.substring(0, 8)` — and a hard refresh "fixed"
// it, because that emptied the cache. The same shape of mistake then turned up
// on ["notifications", "inbox"], where one caller asked for unread-only and the
// other for everything.
//
// TypeScript cannot catch this: each useQuery infers its own type from its own
// queryFn, and keys are not type-linked across files. So it is checked here,
// for EVERY key rather than for the one key that bit us.
//
// Read via import.meta.glob rather than node:fs so the test needs no @types/node.
const sources = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Options that follow queryFn in an options object; the queryFn text ends at
// whichever of these comes first.
const NEXT_OPTION =
  /,\s*\n\s*(enabled|staleTime|gcTime|select|retry|retryDelay|refetchInterval|refetchIntervalInBackground|refetchOnMount|refetchOnWindowFocus|refetchOnReconnect|placeholderData|initialData|initialDataUpdatedAt|throwOnError|meta|structuralSharing|networkMode|notifyOnChangeProps)\s*:/;

interface Site {
  path: string;
  line: number;
  key: string;
  fetch: string;
}

// Two call sites fetch "the same thing" if what they call, with what arguments,
// is the same. Null-guard scaffolding around the call is not a difference:
// `() => listMembers(storeId)` and
// `() => (storeId ? listMembers(storeId) : Promise.resolve([]))` write the same
// shape. A different ARGUMENT is a difference — that is the notifications bug.
function fetchSignature(queryFn: string): string {
  let s = queryFn.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, "");
  s = s.replace(/as[A-Za-z][A-Za-z0-9_$<>,[\]]*/g, "");
  const guarded = s.match(
    /^\(\)=>\(?[^?]*\?(.*):Promise\.resolve\([^()]*\)\)?,?$/,
  );
  if (guarded) s = `()=>${guarded[1]}`;
  return s.replace(/,$/, "");
}

function collectSites(): Site[] {
  const sites: Site[] = [];
  for (const [path, source] of Object.entries(sources)) {
    if (/\.test\.tsx?$/.test(path)) continue;
    const re = /useQuery\(\{/g;
    let match: RegExpExecArray | null = re.exec(source);
    for (; match !== null; match = re.exec(source)) {
      const open = match.index + match[0].length - 1;
      let depth = 0;
      let end = -1;
      for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) {
          end = i;
          break;
        }
      }
      if (end < 0) continue;
      const body = source.slice(open + 1, end);
      const key = body.match(/queryKey:\s*(\[[\s\S]*?\])\s*,/);
      const fnAt = body.search(/queryFn\s*:/);
      if (!key || fnAt < 0) continue;
      let fn = body.slice(fnAt).replace(/^queryFn\s*:/, "");
      const cut = fn.search(NEXT_OPTION);
      if (cut >= 0) fn = fn.slice(0, cut);
      sites.push({
        path,
        line: source.slice(0, match.index).split("\n").length,
        key: key[1].replace(/\s+/g, " "),
        fetch: fetchSignature(fn),
      });
    }
  }
  return sites;
}

describe("react-query key/shape contract", () => {
  it("no cache key is written by two different fetches", () => {
    const byKey = new Map<string, Site[]>();
    for (const site of collectSites()) {
      const group = byKey.get(site.key);
      if (group) group.push(site);
      else byKey.set(site.key, [site]);
    }

    const collisions: string[] = [];
    for (const [key, group] of byKey) {
      const distinct = new Set(group.map((s) => s.fetch));
      if (distinct.size < 2) continue;
      collisions.push(
        `${key}\n` +
          group
            .map((s) => `      ${s.path}:${s.line}  →  ${s.fetch}`)
            .join("\n"),
      );
    }

    expect(
      collisions,
      `These cache keys are written by more than one fetch. Whichever mounts ` +
        `first wins and the others read its result until it goes stale:\n\n  ` +
        `${collisions.join("\n\n  ")}\n\n` +
        `Fix by putting whatever differs INTO the key, or by calling the same ` +
        `function everywhere and deriving the local shape outside the query.`,
    ).toEqual([]);
  });

  it("finds the call sites it is meant to be guarding", () => {
    // Guards the guard: if a refactor moves these queries somewhere this glob
    // or the block scanner no longer matches, the test above passes vacuously.
    const sites = collectSites();
    expect(sites.length).toBeGreaterThanOrEqual(60);
    expect(new Set(sites.map((s) => s.key)).size).toBeGreaterThanOrEqual(40);
  });
});
