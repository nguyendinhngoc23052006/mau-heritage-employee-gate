import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { signInWithPassword, signUpWithPassword } from "./auth";

vi.mock("../lib/supabaseClient");

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signInWithPassword forwards email + password to Supabase", async () => {
    const spy = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(getSupabase).mockReturnValue({
      auth: { signInWithPassword: spy },
    } as any);

    await signInWithPassword("test@example.com", "hunter22");

    expect(spy).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "hunter22",
    });
  });

  it("signUpWithPassword forwards email + password to Supabase", async () => {
    const spy = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(getSupabase).mockReturnValue({
      auth: { signUp: spy },
    } as any);

    await signUpWithPassword("new@example.com", "hunter22");

    expect(spy).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "hunter22",
    });
  });
});
