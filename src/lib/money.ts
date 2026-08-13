// Money in integer cents (đồng for VND — smallest unit). Never floats.

export function formatVnd(cents: number): string {
  const n = Math.round(cents);
  return `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;
}

export function parseVndToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

// Minutes worked between two ISO timestamps. Integer math.
export function minutesBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

// Wages: integer cents. (minutes * rate_cents) / 60, integer-divided.
export function wagesCents(
  minutesWorked: number,
  hourlyRateCents: number,
): number {
  return Math.floor((minutesWorked * hourlyRateCents) / 60);
}
