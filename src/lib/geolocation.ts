export interface Coords {
  lat: number;
  lng: number;
  accuracyM: number;
}

export type GeolocationErrorKind =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout";

export class GeolocationError extends Error {
  kind: GeolocationErrorKind;
  constructor(kind: GeolocationErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface GetCoordsOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

export function getCurrentCoords(opts: GetCoordsOptions = {}): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeolocationError("unsupported", "Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) => {
        const kind: GeolocationErrorKind =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.POSITION_UNAVAILABLE
              ? "unavailable"
              : "timeout";
        reject(new GeolocationError(kind, err.message));
      },
      {
        enableHighAccuracy: opts.enableHighAccuracy ?? true,
        timeout: opts.timeoutMs ?? 8000,
        maximumAge: opts.maximumAgeMs ?? 30_000,
      },
    );
  });
}
