import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { clockInAt, clockOutAt, listMyClockEvents } from "./clock";

vi.mock("../lib/supabaseClient");

describe("clock service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clockInAt calls the clock_in_at RPC with store + location", async () => {
    const mockEvent = { id: "event-1", store_id: "store-1", kind: "in" };
    const spy = vi.fn().mockResolvedValue({ data: mockEvent, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    const result = await clockInAt("store-1", {
      lat: 10.1,
      lng: 106.2,
      accuracyM: 15,
    });

    expect(spy).toHaveBeenCalledWith("clock_in_at", {
      p_store_id: "store-1",
      p_lat: 10.1,
      p_lng: 106.2,
      p_accuracy_m: 15,
    });
    expect(result).toEqual(mockEvent);
  });

  it("clockInAt defaults location fields to null when omitted", async () => {
    const spy = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    await clockInAt("store-1");

    expect(spy).toHaveBeenCalledWith("clock_in_at", {
      p_store_id: "store-1",
      p_lat: null,
      p_lng: null,
      p_accuracy_m: null,
    });
  });

  it("clockOutAt calls the clock_out_at RPC with store + location", async () => {
    const mockEvent = { id: "event-2", store_id: "store-1", kind: "out" };
    const spy = vi.fn().mockResolvedValue({ data: mockEvent, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    const result = await clockOutAt("store-1", { lat: 10.1, lng: 106.2 });

    expect(spy).toHaveBeenCalledWith("clock_out_at", {
      p_store_id: "store-1",
      p_lat: 10.1,
      p_lng: 106.2,
      p_accuracy_m: null,
    });
    expect(result).toEqual(mockEvent);
  });

  it("clockOutAt throws when the RPC returns an error", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("boom") });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    await expect(clockOutAt("store-1")).rejects.toThrow("boom");
  });

  it("listMyClockEvents builds the base query filtered by user + store", async () => {
    const mockEvents = [{ id: "event-1" }, { id: "event-2" }];
    const order = vi.fn().mockResolvedValue({ data: mockEvents, error: null });
    const eq2 = vi.fn().mockReturnValue({ order });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(getSupabase).mockReturnValue({ from } as any);

    const result = await listMyClockEvents("user-1", "store-1");

    expect(from).toHaveBeenCalledWith("clock_events");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq2).toHaveBeenCalledWith("store_id", "store-1");
    expect(order).toHaveBeenCalledWith("at", { ascending: false });
    expect(result).toEqual(mockEvents);
  });

  it("listMyClockEvents applies from/to range filters when given", async () => {
    // The implementation reassigns `query = query.gte(...)` / `.lte(...)` and
    // then `await`s the result directly, so the chain must both return itself
    // from every builder method and be thenable at the end.
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable to mimic supabase-js PostgrestBuilder chain
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: null }),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.gte.mockReturnValue(chain);
    chain.lte.mockReturnValue(chain);
    const from = vi.fn().mockReturnValue(chain);
    vi.mocked(getSupabase).mockReturnValue({ from } as any);

    await listMyClockEvents("user-1", "store-1", {
      from: "2026-08-01T00:00:00Z",
      to: "2026-08-31T00:00:00Z",
    });

    expect(chain.gte).toHaveBeenCalledWith("at", "2026-08-01T00:00:00Z");
    expect(chain.lte).toHaveBeenCalledWith("at", "2026-08-31T00:00:00Z");
  });
});
