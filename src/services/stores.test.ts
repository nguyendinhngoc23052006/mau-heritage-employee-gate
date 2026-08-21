import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { setStoreGeofence, setStoreVarianceThreshold } from "./stores";

vi.mock("../lib/supabaseClient");

describe("stores service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("setStoreGeofence calls set_store_geofence with correct params", async () => {
    const mockStore = { id: "store-1", require_geofence: true };
    const spy = vi.fn().mockResolvedValue({ data: mockStore, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    const result = await setStoreGeofence({
      storeId: "store-1",
      lat: 10.5,
      lng: 106.6,
      radiusM: 150,
      require: true,
    });

    expect(spy).toHaveBeenCalledWith("set_store_geofence", {
      p_store_id: "store-1",
      p_lat: 10.5,
      p_lng: 106.6,
      p_radius_m: 150,
      p_require: true,
    });
    expect(result).toEqual(mockStore);
  });

  it("setStoreGeofence passes null lat/lng/radius through unchanged (clearing the geofence)", async () => {
    const mockStore = { id: "store-1", require_geofence: false };
    const spy = vi.fn().mockResolvedValue({ data: mockStore, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    const result = await setStoreGeofence({
      storeId: "store-1",
      lat: null,
      lng: null,
      radiusM: null,
      require: false,
    });

    expect(spy).toHaveBeenCalledWith("set_store_geofence", {
      p_store_id: "store-1",
      p_lat: null,
      p_lng: null,
      p_radius_m: null,
      p_require: false,
    });
    expect(result).toEqual(mockStore);
  });

  it("setStoreGeofence throws when the RPC returns an error", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("boom") });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    await expect(
      setStoreGeofence({
        storeId: "store-1",
        lat: 1,
        lng: 1,
        radiusM: 10,
        require: true,
      }),
    ).rejects.toThrow("boom");
  });

  it("setStoreVarianceThreshold calls set_store_variance_threshold with correct params", async () => {
    const mockStore = { id: "store-1", variance_threshold_pct: 5 };
    const spy = vi.fn().mockResolvedValue({ data: mockStore, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    const result = await setStoreVarianceThreshold({
      storeId: "store-1",
      pct: 5,
    });

    expect(spy).toHaveBeenCalledWith("set_store_variance_threshold", {
      p_store_id: "store-1",
      p_pct: 5,
    });
    expect(result).toEqual(mockStore);
  });

  it("setStoreVarianceThreshold throws when the RPC returns an error", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("boom") });
    vi.mocked(getSupabase).mockReturnValue({ rpc: spy } as any);

    await expect(
      setStoreVarianceThreshold({ storeId: "store-1", pct: 5 }),
    ).rejects.toThrow("boom");
  });
});
