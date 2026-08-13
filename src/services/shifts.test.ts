import { describe, expect, it, vi } from "vitest";
import { claimShift } from "./shifts";

vi.mock("../lib/supabaseClient", () => ({
  getSupabase: vi.fn(),
}));

describe("shifts", () => {
  it("claimShift calls supabase.rpc with correct args", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: { id: "shift-1", status: "claimed" },
      error: null,
    });
    const mockSupabase = { rpc: mockRpc };

    const { getSupabase } = await import("../lib/supabaseClient");
    vi.mocked(getSupabase).mockReturnValue(mockSupabase as any);

    const shiftId = "shift-123";
    await claimShift(shiftId);

    expect(mockRpc).toHaveBeenCalledWith("claim_shift", {
      p_shift_id: shiftId,
    });
  });
});
