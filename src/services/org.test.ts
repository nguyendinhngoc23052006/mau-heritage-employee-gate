import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { createSector, createStoreInSector, setRole } from "./org";

vi.mock("../lib/supabaseClient");

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "insert", "select", "update", "eq", "in", "order"]) {
    c[m] = vi.fn(() => c);
  }
  c.single = vi.fn(async () => result);
  return c as Record<string, ReturnType<typeof vi.fn>>;
}

describe("org service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setRole calls the set_role RPC with the four named parameters", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    await setRole({
      targetUserId: "u1",
      scope: "store",
      scopeId: "s1",
      role: "manager",
    });
    expect(rpc).toHaveBeenCalledWith("set_role", {
      p_target: "u1",
      p_scope: "store",
      p_scope_id: "s1",
      p_role: "manager",
    });
  });

  it("setRole surfaces the database's refusal instead of swallowing it", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "cannot act on someone at or above your own tier" },
    }));
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    await expect(
      setRole({
        targetUserId: "u1",
        scope: "global",
        scopeId: null,
        role: "ceo",
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("own tier") });
  });

  it("createStoreInSector inserts under the sector with the caller as creator", async () => {
    const c = chain({ data: { id: "st1", name: "Kho A" }, error: null });
    vi.mocked(getSupabase).mockReturnValue({
      ...c,
      auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
    } as never);
    const store = await createStoreInSector("sec1", "  Kho A ");
    expect(c.from).toHaveBeenCalledWith("stores");
    expect(c.insert).toHaveBeenCalledWith({
      name: "Kho A",
      sector_id: "sec1",
      created_by: "me",
    });
    expect(store).toMatchObject({ id: "st1" });
  });

  it("createSector refuses a blank name before touching the network", async () => {
    const from = vi.fn();
    vi.mocked(getSupabase).mockReturnValue({ from } as never);
    await expect(createSector("   ")).rejects.toThrow("sector name required");
    expect(from).not.toHaveBeenCalled();
  });
});
