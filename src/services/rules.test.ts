import { describe, it, expect, vi } from "vitest";
import * as rulesService from "./rules";

vi.mock("../lib/supabaseClient", () => ({
  getSupabase: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === "rules") {
        return {
          insert: vi.fn(function (data) {
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "rule-123",
                    store_id: data.store_id,
                    name: data.name,
                    kind: data.kind,
                    trigger_type: data.trigger_type,
                    trigger_params: data.trigger_params,
                    points_delta: data.points_delta,
                    amount_cents: data.amount_cents,
                    active: data.active,
                    created_by: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                })),
              })),
            };
          }),
        };
      }
      return null;
    }),
  })),
}));

describe("rules service", () => {
  it("createRule inserts with correct shape", async () => {
    const result = await rulesService.createRule({
      store_id: "store-123",
      name: "Late arrival",
      kind: "auto",
      trigger_type: "late_arrival",
      trigger_params: { minutes_threshold: 15 },
      points_delta: -10,
      amount_cents: -5000,
      active: true,
    });

    expect(result.id).toBe("rule-123");
    expect(result.name).toBe("Late arrival");
    expect(result.kind).toBe("auto");
    expect(result.trigger_type).toBe("late_arrival");
    expect(result.points_delta).toBe(-10);
    expect(result.amount_cents).toBe(-5000);
    expect(result.active).toBe(true);
  });
});
