import { describe, expect, it } from "vitest";
import { buildSupabaseClient } from "./supabaseClient";

describe("buildSupabaseClient", () => {
  it("builds a client when both VITE_ names are set", () => {
    const client = buildSupabaseClient({
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("throws a readable error when VITE_SUPABASE_URL is missing", () => {
    expect(() =>
      buildSupabaseClient({
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it("throws a readable error when VITE_SUPABASE_PUBLISHABLE_KEY is missing", () => {
    expect(() =>
      buildSupabaseClient({ VITE_SUPABASE_URL: "https://example.supabase.co" }),
    ).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/);
  });
});
