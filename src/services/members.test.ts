import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { listMembers } from "./members";

vi.mock("../lib/supabaseClient");

// Builds a supabase double whose first .from() answers with membership rows and
// whose second answers with profiles — matching listMembers' two-step fetch.
function mockSupabase(memberRows: unknown[], profileRows: unknown[] = []) {
  let call = 0;
  return {
    from: () => {
      call += 1;
      const payload =
        call === 1
          ? { data: memberRows, error: null }
          : { data: profileRows, error: null };
      // A real Promise carries `then` natively, so the builder is awaitable at
      // whatever link the caller stops on — without hand-defining a thenable.
      const chain = Promise.resolve(payload) as Promise<typeof payload> &
        Record<string, () => unknown>;
      for (const m of ["select", "eq", "in"]) {
        chain[m] = () => chain;
      }
      return chain;
    },
  };
}

describe("listMembers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns rows that have a user_id", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      mockSupabase(
        [{ user_id: "u1", store_id: "s1", active: true }],
        [{ id: "u1", display_name: "Ngọc" }],
      ) as never,
    );
    const out = await listMembers("s1");
    expect(out).toHaveLength(1);
    expect(out[0].user_id).toBe("u1");
    expect(out[0].profile?.display_name).toBe("Ngọc");
  });

  // A row with no user_id cannot be keyed to a profile, cannot be a Select
  // value, and cannot be labelled — every consumer that touches it either
  // crashes on `user_id.substring` or renders a dead option. Dropping it once,
  // here, is the only place that fixes all of them at the same time.
  it("drops rows with no user_id instead of passing them to the UI", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      mockSupabase(
        [
          { user_id: "u1", store_id: "s1", active: true },
          { store_id: "s1", active: true },
          { user_id: null, store_id: "s1", active: true },
          { user_id: "", store_id: "s1", active: true },
        ],
        [{ id: "u1", display_name: "Ngọc" }],
      ) as never,
    );
    const out = await listMembers("s1");
    expect(out.map((m) => m.user_id)).toEqual(["u1"]);
    // Every survivor is safe to call string methods on.
    for (const m of out) {
      expect(typeof m.user_id).toBe("string");
      expect(m.user_id.length).toBeGreaterThan(0);
    }
  });

  it("returns [] when the store has no members", async () => {
    vi.mocked(getSupabase).mockReturnValue(mockSupabase([]) as never);
    expect(await listMembers("s1")).toEqual([]);
  });
});
