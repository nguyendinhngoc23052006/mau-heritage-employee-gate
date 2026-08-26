import { beforeEach, describe, expect, it, vi } from "vitest";
import { minutesBetween, wagesCents } from "../lib/money";
import { getSupabase } from "../lib/supabaseClient";
import { computePayroll } from "./payroll";

vi.mock("../lib/supabaseClient");

describe("payroll helper functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

// Timestamps here use +00:00 because that is what PostgREST actually returns
// for timestamptz, while callers pass +07:00 period bounds. Mocking both with
// the same offset hides comparison bugs across the two.
type Rows = Record<string, unknown[]>;

function mockSupabaseTables(rows: Rows) {
  const builderFor = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "gte",
      "lt",
      "lte",
      "is",
      "in",
      "order",
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    // biome-ignore lint/suspicious/noThenProperty: mimics supabase-js thenable query builder
    builder.then = (resolve: (v: unknown) => void) => {
      resolve({ data: rows[table] ?? [], error: null });
      return Promise.resolve();
    };
    return builder;
  };

  vi.mocked(getSupabase).mockReturnValue({
    from: vi.fn((table: string) => builderFor(table)),
  } as unknown as ReturnType<typeof getSupabase>);
}

describe("computePayroll integration", () => {
  const storeId = "store-1";
  const from = "2026-08-01T00:00:00+07:00";
  const to = "2026-08-31T23:59:59+07:00";
  const userId = "user-1";

  const member = (active: boolean) => ({
    user_id: userId,
    hourly_rate_cents: 50000,
    role: "employee",
    active,
  });
  const pair = (inAt: string, outAt: string) => [
    { user_id: userId, kind: "in", at: inAt },
    { user_id: userId, kind: "out", at: outAt },
  ];
  const profile = [{ id: userId, display_name: "Test User" }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still pays a deactivated member for hours worked in the period", async () => {
    mockSupabaseTables({
      memberships_public: [member(false)],
      // VN 08:00 -> 17:00 on Aug 15
      clock_events: pair(
        "2026-08-15T01:00:00+00:00",
        "2026-08-15T10:00:00+00:00",
      ),
      profiles: profile,
    });

    const result = await computePayroll(storeId, from, to);

    expect(result).toHaveLength(1);
    expect(result[0].minutes_worked).toBe(540);
    expect(result[0].wages_cents).toBe(450000);
  });

  it("drops a deactivated member with no activity in the period", async () => {
    mockSupabaseTables({
      memberships_public: [member(false)],
      clock_events: [],
      profiles: profile,
    });

    expect(await computePayroll(storeId, from, to)).toHaveLength(0);
  });

  it("keeps an active member with no hours", async () => {
    mockSupabaseTables({
      memberships_public: [member(true)],
      clock_events: [],
      profiles: profile,
    });

    const result = await computePayroll(storeId, from, to);

    expect(result).toHaveLength(1);
    expect(result[0].minutes_worked).toBe(0);
  });

  it("counts a shift that starts inside the period and ends after it", async () => {
    mockSupabaseTables({
      memberships_public: [member(true)],
      // VN 23:00 Aug 31 -> 02:00 Sep 1
      clock_events: pair(
        "2026-08-31T16:00:00+00:00",
        "2026-08-31T19:00:00+00:00",
      ),
      profiles: profile,
    });

    const result = await computePayroll(storeId, from, to);

    expect(result[0].minutes_worked).toBe(180);
    expect(result[0].daily_breakdown[0].date).toBe("2026-08-31");
  });

  // Regression: comparing `at` (+00:00) against the period bounds (+07:00) as
  // strings drops this shift, because "2026-07-31..." sorts before "2026-08-01...".
  it("counts a shift in the first VN hours of the period, whose UTC instant is the prior month", async () => {
    mockSupabaseTables({
      memberships_public: [member(true)],
      // VN 00:30 -> 05:30 on Aug 1
      clock_events: pair(
        "2026-07-31T17:30:00+00:00",
        "2026-07-31T22:30:00+00:00",
      ),
      profiles: profile,
    });

    const result = await computePayroll(storeId, from, to);

    expect(result[0].minutes_worked).toBe(300);
    expect(result[0].daily_breakdown[0].date).toBe("2026-08-01");
  });

  it("excludes a shift that started before the period began", async () => {
    mockSupabaseTables({
      memberships_public: [member(true)],
      // VN 23:00 Jul 31 -> 02:00 Aug 1: belongs to the previous period
      clock_events: pair(
        "2026-07-31T16:00:00+00:00",
        "2026-07-31T19:00:00+00:00",
      ),
      profiles: profile,
    });

    expect((await computePayroll(storeId, from, to))[0].minutes_worked).toBe(0);
  });
});
