import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { sendMagicLink } from "./auth";

vi.mock("../lib/supabaseClient");

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMagicLink calls signInWithOtp with correct args", async () => {
    const mockSignInWithOtp = vi
      .fn()
      .mockResolvedValue({ data: {}, error: null });
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
