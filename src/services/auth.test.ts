import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMagicLink } from "./auth";
import { getSupabase } from "../lib/supabaseClient";

vi.mock("../lib/supabaseClient");

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMagicLink calls signInWithOtp with correct args", async () => {
    const mockSignInWithOtp = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(getSupabase).mockReturnValue({
      auth: {
        signInWithOtp: mockSignInWithOtp,
      },
    } as any);

    await sendMagicLink("test@example.com");

    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: "test@example.com",
      options: { emailRedirectTo: expect.stringContaining("/callback") },
    });
  });
});
