import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../lib/supabaseClient";
import { createAnnouncement } from "./announcements";

vi.mock("../lib/supabaseClient");

describe("announcements service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createAnnouncement inserts with correct shape", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "test-id",
            store_id: "store-123",
            title: "Test",
            body: "Body",
            active: true,
            created_by: "user-123",
            created_at: "2026-08-12T00:00:00Z",
          },
          error: null,
        }),
      }),
    });

    vi.mocked(getSupabase).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
        }),
      },
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
      }),
    } as any);

    const result = await createAnnouncement({
      store_id: "store-123",
      title: "Test",
      body: "Body",
    });

    expect(mockInsert).toHaveBeenCalledWith({
      store_id: "store-123",
      title: "Test",
      body: "Body",
      active: true,
      created_by: "user-123",
    });

    expect(result.title).toBe("Test");
  });
});
