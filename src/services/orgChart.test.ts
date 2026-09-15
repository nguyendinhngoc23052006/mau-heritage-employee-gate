import { describe, expect, it } from "vitest";
import { normalizeChart } from "./org";

describe("normalizeChart", () => {
  it("passes a well-formed snapshot through unchanged", () => {
    const chart = normalizeChart({
      tier1: [{ id: "a", name: "Ngọc", role: "sysadmin" }],
      sectors: [
        {
          id: "s1",
          name: "Kho",
          directors: [{ id: "d1", name: "D" }],
          units: [
            {
              id: "u1",
              name: "Tiep nhan",
              managers: [{ id: "m1", name: "M" }],
              employees: [{ id: "e1", name: "E" }],
            },
          ],
        },
      ],
      unassigned: [],
    });
    expect(chart.sectors[0].units[0].managers[0].name).toBe("M");
    expect(chart.tier1[0].role).toBe("sysadmin");
  });

  it("turns every missing or null collection into an empty array", () => {
    const chart = normalizeChart({
      tier1: null,
      sectors: [{ id: "s1", name: "Kho", directors: null, units: null }],
    });
    expect(chart.tier1).toEqual([]);
    expect(chart.sectors[0].directors).toEqual([]);
    expect(chart.sectors[0].units).toEqual([]);
    expect(chart.unassigned).toEqual([]);
  });

  it("survives complete garbage without throwing", () => {
    expect(normalizeChart(null)).toEqual({
      tier1: [],
      sectors: [],
      unassigned: [],
    });
    expect(normalizeChart("nonsense").sectors).toEqual([]);
  });
});
