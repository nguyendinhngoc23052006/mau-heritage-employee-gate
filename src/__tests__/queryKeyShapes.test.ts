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
  // Casts are stripped BEFORE whitespace is collapsed, and only with the space
  // that a real `as` cast always has. Stripping them afterwards matched the
  // "as" inside identifiers — `m.lastActive` and `m.lastFired` both collapsed
  // to `m.l`, so two call sites reading different fields off the same call
  // would have compared equal. That is precisely the bug this file exists to
  // catch, so the detector must not be blind to it.
  let s = queryFn.replace(/\/\/[^\n]*/g, "");
  s = s.replace(/\bas\s+[A-Za-z_$][A-Za-z0-9_$]*(?:\s*\[\s*\])?/g, "");
  s = s.replace(/\s+/g, "");
  const guarded = s.match(
    /^\(\)=>\(?[^?]*\?(.*):Promise\.resolve\([^()]*\)\)?,?$/,
  );
  if (guarded) s = `()=>${guarded[1]}`;
  return s.replace(/,$/, "");
}

// Every place a useQuery is CALLED, however it is spelled. Used as the vacuity
// guard below: if the scanner parses fewer blocks than there are calls, it has
// silently stopped covering part of the app, which is the one failure a gate
// like this must never have.
const CALL = /\buseQuery\s*[<(]/g;

function countCalls(): number {
  let n = 0;
  for (const [path, source] of Object.entries(sources)) {
    if (/\.test\.tsx?$/.test(path)) continue;
    n += source.match(CALL)?.length ?? 0;
  }
  return n;
}

// Walks from a `useQuery` token past an optional type argument to the `{` that
// opens the options object. `useQuery<MembershipWithStore[]>({` and
// `useQuery<\n  (A & { b: C })[]\n>({` are both real spellings in this repo, so
// the type argument is skipped by counting angle brackets rather than matched
// with a regex.
function optionsBraceAfter(source: string, from: number): number {
  let i = from;
  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i])) i++;
  };
  skipSpace();
  if (source[i] === "<") {
    let depth = 0;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "<") depth++;
      else if (c === ">" && source[i - 1] !== "=") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      } else if (c === ";") return -1;
    }
    skipSpace();
  }
  if (source[i] !== "(") return -1;
  i++;
  skipSpace();
  return source[i] === "{" ? i : -1;
}

function collectSites(): Site[] {
  const sites: Site[] = [];
  for (const [path, source] of Object.entries(sources)) {
    if (/\.test\.tsx?$/.test(path)) continue;
    const re = /\buseQuery\s*[<(]/g;
    let match: RegExpExecArray | null = re.exec(source);
    for (; match !== null; match = re.exec(source)) {
      const open = optionsBraceAfter(source, match.index + "useQuery".length);
      if (open < 0) continue;
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

  it("does not collapse two different fetches into one signature", () => {
    // The normaliser is the only thing standing between a real collision and a
    // green test, so it gets its own case.
    expect(
      fetchSignature("() => listMembers(storeId).then((m) => m.lastActive)"),
    ).not.toBe(
      fetchSignature("() => listMembers(storeId).then((m) => m.lastFired)"),
    );
    expect(fetchSignature("() => getStore(storeId as string)")).toBe(
      fetchSignature("() => getStore(storeId)"),
    );
    expect(
      fetchSignature(
        "() => (storeId ? listMembers(storeId) : Promise.resolve([]))",
      ),
    ).toBe(fetchSignature("() => listMembers(storeId)"));
    expect(
      fetchSignature("() => listMyNotifications({ unreadOnly: true })"),
    ).not.toBe(
      fetchSignature("() => listMyNotifications({ unreadOnly: false })"),
    );
  });

  it("parses every useQuery in the app", () => {
    // Guards the guard. The scan above can only fail on what it can read, so a
    // call site it cannot parse is a hole, not a pass. This fails the moment
    // one appears — including a spelling nobody has written yet.
    const sites = collectSites();
    expect(sites.length).toBe(countCalls());
    expect(sites.length).toBeGreaterThanOrEqual(60);
    expect(new Set(sites.map((s) => s.key)).size).toBeGreaterThanOrEqual(40);
  });
});
