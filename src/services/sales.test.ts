import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { approveSales, disputeSales, listMySales, submitSales } from "./sales";

vi.mock("../lib/supabaseClient");

describe("sales service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitSales calls the submit_sales RPC with correct params", async () => {
    const mockReport = { id: "sales-1", status: "pending" };
    const spy = vi.fn().mockResolvedValue({ data: mockReport, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    const result = await submitSales({
      store_id: "store-1",
      shift_id: "shift-1",
      cash_cents: 100000,
      card_cents: 50000,
      qr_cents: 25000,
      expected_cents: 175000,
      note: "all good",
    });

    expect(spy).toHaveBeenCalledWith("submit_sales", {
      p_store_id: "store-1",
      p_cash: 100000,
      p_card: 50000,
      p_qr: 25000,
      p_expected: 175000,
      p_note: "all good",
      p_shift_id: "shift-1",
    });
    expect(result).toEqual(mockReport);
  });

  it("submitSales defaults optional fields to null", async () => {
    const spy = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    await submitSales({
      store_id: "store-1",
      cash_cents: 1000,
      card_cents: 0,
      qr_cents: 0,
    });

    expect(spy).toHaveBeenCalledWith("submit_sales", {
      p_store_id: "store-1",
      p_cash: 1000,
      p_card: 0,
      p_qr: 0,
      p_expected: null,
      p_note: null,
      p_shift_id: null,
    });
  });

  it("submitSales throws when the RPC returns an error", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("boom") });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    await expect(
      submitSales({
        store_id: "store-1",
        cash_cents: 0,
        card_cents: 0,
        qr_cents: 0,
      }),
    ).rejects.toThrow("boom");
  });

  it("approveSales updates status to approved with a decided_at timestamp", async () => {
    const mockReport = { id: "sales-1", status: "approved" };
    const single = vi.fn().mockResolvedValue({ data: mockReport, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    vi.mocked(getSupabase).mockReturnValue({ from } as any);

    const result = await approveSales("sales-1");

    expect(from).toHaveBeenCalledWith("sales_reports");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" }),
    );
    const updateArg = update.mock.calls[0][0];
    expect(typeof updateArg.decided_at).toBe("string");
    expect(eq).toHaveBeenCalledWith("id", "sales-1");
    expect(result).toEqual(mockReport);
  });

  it("disputeSales updates status to disputed with a reason", async () => {
    const mockReport = { id: "sales-2", status: "disputed" };
    const single = vi.fn().mockResolvedValue({ data: mockReport, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    vi.mocked(getSupabase).mockReturnValue({ from } as any);

    const result = await disputeSales("sales-2", "till was short");

    expect(from).toHaveBeenCalledWith("sales_reports");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "disputed",
        dispute_reason: "till was short",
      }),
    );
    expect(eq).toHaveBeenCalledWith("id", "sales-2");
    expect(result).toEqual(mockReport);
  });

  it("listMySales defaults to limit 50 offset 0 and uses .range accordingly", async () => {
    const mockRows = [{ id: "sales-1" }];
    const range = vi.fn().mockResolvedValue({ data: mockRows, error: null });
    const order = vi.fn().mockReturnValue({ range });
    const eq2 = vi.fn().mockReturnValue({ order });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(getSupabase).mockReturnValue({ from } as any);

    const result = await listMySales("user-1", "store-1");

    expect(eq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq2).toHaveBeenCalledWith("store_id", "store-1");
    expect(range).toHaveBeenCalledWith(0, 49);
    expect(result).toEqual(mockRows);
  });

  it("listMySales respects custom limit/offset via .range(offset, offset+limit-1)", async () => {
    const range = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ range });
    const eq2 = vi.fn().mockReturnValue({ order });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(getSupabase).mockReturnValue({ from } as any);

    await listMySales("user-1", "store-1", { limit: 20, offset: 40 });

    expect(range).toHaveBeenCalledWith(40, 59);
  });
});
