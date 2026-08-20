import { afterEach, describe, expect, it, vi } from "vitest";
import { GeolocationError, getCurrentCoords } from "./geolocation";

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

// Mimics the real GeolocationPositionError, which carries all three codes
// as own properties alongside `code` so `err.code === err.PERMISSION_DENIED`
// comparisons in the implementation resolve correctly.
function mockError(code: number, message: string) {
  return { code, message, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT };
}

describe("GeolocationError", () => {
  it("constructs with kind + message for each kind", () => {
    const denied = new GeolocationError("denied", "no permission");
    expect(denied.kind).toBe("denied");
    expect(denied.message).toBe("no permission");
    expect(denied).toBeInstanceOf(Error);

    const unavailable = new GeolocationError("unavailable", "no position");
    expect(unavailable.kind).toBe("unavailable");
    expect(unavailable.message).toBe("no position");

    const timeout = new GeolocationError("timeout", "took too long");
    expect(timeout.kind).toBe("timeout");
    expect(timeout.message).toBe("took too long");

    const unsupported = new GeolocationError("unsupported", "not supported");
    expect(unsupported.kind).toBe("unsupported");
    expect(unsupported.message).toBe("not supported");
  });
});

describe("getCurrentCoords", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with lat/lng/accuracyM on success", async () => {
    const getCurrentPosition = vi.fn((success) => {
      success({
        coords: { latitude: 10.5, longitude: 106.6, accuracy: 12 },
      });
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    const coords = await getCurrentCoords();

    expect(coords).toEqual({ lat: 10.5, lng: 106.6, accuracyM: 12 });
  });

  it("rejects with kind 'denied' when permission is denied", async () => {
    const getCurrentPosition = vi.fn((_success, error) => {
      error(mockError(PERMISSION_DENIED, "user said no"));
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(getCurrentCoords()).rejects.toMatchObject({
      kind: "denied",
      message: "user said no",
    });
  });

  it("rejects with kind 'unavailable' when position is unavailable", async () => {
    const getCurrentPosition = vi.fn((_success, error) => {
      error(mockError(POSITION_UNAVAILABLE, "no signal"));
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(getCurrentCoords()).rejects.toMatchObject({
      kind: "unavailable",
      message: "no signal",
    });
  });

  it("rejects with kind 'timeout' for any other error code", async () => {
    const getCurrentPosition = vi.fn((_success, error) => {
      error(mockError(TIMEOUT, "took too long"));
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(getCurrentCoords()).rejects.toMatchObject({
      kind: "timeout",
      message: "took too long",
    });
  });

  it("rejects with kind 'unsupported' when navigator.geolocation is missing", async () => {
    vi.stubGlobal("navigator", {});

    await expect(getCurrentCoords()).rejects.toMatchObject({
      kind: "unsupported",
    });
  });
});
