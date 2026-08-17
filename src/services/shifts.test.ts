import { describe, expect, it, vi } from "vitest";
import { claimSlot } from "./shiftSlots";

vi.mock("../lib/supabaseClient", () => ({
  getSupabase: vi.fn(),
}));

describe("shiftSlots", () => {
  it("claimSlot returns slot on success", async () => {
    const mockSlot = {
      id: "slot-1",
      shift_id: "shift-1",
      claimed_by: "user-1",
    };
    const mockRpc = vi.fn().mockResolvedValue({
      data: mockSlot,
      error: null,
    });
    const mockSupabase = { rpc: mockRpc };

    const { getSupabase } = await import("../lib/supabaseClient");
    vi.mocked(getSupabase).mockReturnValue(mockSupabase as any);

    const slotId = "slot-123";
    const result = await claimSlot(slotId);

    expect(mockRpc).toHaveBeenCalledWith("claim_slot", {
      p_slot_id: slotId,
    });
    expect(result).toEqual(mockSlot);
  });

  it("claimSlot returns null on race loss", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const mockSupabase = { rpc: mockRpc };

    const { getSupabase } = await import("../lib/supabaseClient");
    vi.mocked(getSupabase).mockReturnValue(mockSupabase as any);

    const slotId = "slot-123";
    const result = await claimSlot(slotId);

    expect(result).toBeNull();
  });
});
