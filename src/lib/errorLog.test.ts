import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logClientError } from "./errorLog";
import { getSupabase } from "./supabaseClient";

vi.mock("./supabaseClient");

function mockSupabase(insert: ReturnType<typeof vi.fn>) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ insert }),
  };
}

describe("logClientError", () => {
  beforeEach(() => vi.clearAllMocks());
  // jsdom's window is shared across tests in this file; restore the path so a
  // later test cannot inherit /reset-password from this one.
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("never records the query string or fragment", async () => {
    // Supabase's recovery link arrives as
    // /reset-password#access_token=…&refresh_token=… — logging href verbatim
    // would persist live credentials into client_errors.
    window.history.replaceState({}, "", "/reset-password?next=%2Fpayroll");
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabase).mockReturnValue(mockSupabase(insert) as never);

    await logClientError(new Error("boom"));

    const row = insert.mock.calls[0][0];
    expect(row.url).toBe(`${window.location.origin}/reset-password`);
    expect(row.url).not.toContain("?");
    expect(row.url).not.toContain("#");
  });

  it("stamps the build so a stale deploy is distinguishable from a live bug", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabase).mockReturnValue(mockSupabase(insert) as never);

    await logClientError(new Error("boom"));

    expect(insert.mock.calls[0][0].stack).toContain("build ");
  });

  it("never throws, even when the insert fails", async () => {
    vi.mocked(getSupabase).mockImplementation(() => {
      throw new Error("no client");
    });
    await expect(logClientError(new Error("boom"))).resolves.toBeUndefined();
  });
});
