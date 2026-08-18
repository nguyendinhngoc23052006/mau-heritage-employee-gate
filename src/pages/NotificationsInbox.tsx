import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import {
  listMyNotifications,
  markAllRead,
  markRead,
} from "../services/notifications";
import type { Notification } from "../types/database";

export function NotificationsInbox() {
  const t = useT();
  const { user } = useSession();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", "inbox"],
    queryFn: () => listMyNotifications({ unreadOnly: false }),
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "inbox"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => (user?.id ? markAllRead(user.id) : Promise.resolve()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "inbox"] });
    },
  });

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Error loading notifications"
        }
      />
    );
  }

  const unreadCount = data?.filter((n) => !n.read_at).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold font-display text-brand-ink">
          {t("notifications.title")} {unreadCount > 0 && `(${unreadCount})`}
        </h1>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            {markAllReadMutation.isPending
              ? t("common.loading")
              : t("notifications.mark_all_read")}
          </Button>
        )}
      </div>

      {data && data.length === 0 ? (
        <EmptyState>{t("notifications.empty")}</EmptyState>
      ) : (
        <div className="space-y-3">
          {data?.map((notif: Notification) => (
            <Card
              key={notif.id}
              className={
                notif.read_at ? "opacity-60" : "border-blue-200 bg-blue-50"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">
                    {notif.title}
                  </h3>
                  {notif.body && (
                    <p className="mt-1 text-sm text-slate-600">{notif.body}</p>
                  )}
                  {notif.url && (
                    <a
                      href={notif.url}
                      className="mt-2 inline-block text-xs text-blue-600 hover:underline"
                    >
                      {notif.url}
                    </a>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(notif.created_at).toLocaleString()}
                  </p>
                </div>
                {!notif.read_at && (
                  <Button
                    variant="ghost"
                    onClick={() => markReadMutation.mutate(notif.id)}
                    disabled={markReadMutation.isPending}
                    className="text-xs"
                  >
                    {t("notifications.mark_read")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
