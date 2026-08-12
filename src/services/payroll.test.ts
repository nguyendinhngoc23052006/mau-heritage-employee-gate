import { describe, expect, it } from "vitest";
import { minutesBetween, wagesCents } from "../lib/money";

describe("payroll helper functions", () => {
  it("wagesCents calculates correctly with integer math", () => {
    // 60 minutes * 50000 VND/hour = 50000 VND
    expect(wagesCents(60, 50000)).toBe(50000);

    // 30 minutes * 50000 VND/hour = 25000 VND
    expect(wagesCents(30, 50000)).toBe(25000);

    // 90 minutes * 50000 VND/hour = 75000 VND
    expect(wagesCents(90, 50000)).toBe(75000);

    // 1 minute * 50000 VND/hour = 833 VND (50000 / 60 = 833.33 -> 833)
    expect(wagesCents(1, 50000)).toBe(833);

    // 120 minutes * 100000 VND/hour = 200000 VND
    expect(wagesCents(120, 100000)).toBe(200000);
  });

  it("minutesBetween calculates correctly", () => {
    const start = "2026-08-12T08:00:00Z";
    const end = "2026-08-12T09:00:00Z";
    expect(minutesBetween(start, end)).toBe(60);

    const start2 = "2026-08-12T08:00:00Z";
    const end2 = "2026-08-12T08:30:00Z";
    expect(minutesBetween(start2, end2)).toBe(30);

    const start3 = "2026-08-12T08:00:00Z";
    const end3 = "2026-08-12T08:00:00Z";
    expect(minutesBetween(start3, end3)).toBe(0);
  });

  it("total payroll calculation: wages + prizes - fines", () => {
    const minutes = 480; // 8 hours
    const hourlyRate = 50000; // 50k VND/hour
    const wages = wagesCents(minutes, hourlyRate);
    const prizes = 100000;
    const fines = 50000;
    const total = wages + prizes - fines;

    // 8 hours * 50k = 400k wages
    expect(wages).toBe(400000);
    // 400k + 100k - 50k = 450k
    expect(total).toBe(450000);
  });
});
