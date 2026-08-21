import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input, Label, Textarea } from "../components/ui/Input";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useT } from "../lib/i18n";
import {
  createAnnouncement,
  deactivateAnnouncement,
  listAnnouncements,
} from "../services/announcements";
import type { Announcement } from "../types/database";

export function AnnouncementsPage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const queryClient = useQueryClient();
  const role = useRoleOn(storeId);
  const isManager = isManagerRole(role);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateAnnouncementId, setDeactivateAnnouncementId] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["announcements", storeId],
    enabled: !!storeId,
    queryFn: () => listAnnouncements(storeId as string, { activeOnly: true }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAnnouncement({ store_id: storeId as string, title, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", storeId] });
      setTitle("");
      setBody("");
      setShowForm(false);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements", storeId] });
      setDeactivateDialogOpen(false);
      setDeactivateAnnouncementId("");
    },
  });

  if (!storeId) {
    return <ErrorState message={t("announcements.store_not_found")} />;
  }

  if (isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : t("announcements.error_loading")
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold font-display text-brand-ink">
          {t("announcements.title")}
        </h1>
        {isManager && (
          <Button
            onClick={() => setShowForm(!showForm)}
            variant={showForm ? "secondary" : "primary"}
          >
            {showForm ? t("common.cancel") : t("announcements.new")}
          </Button>
        )}
      </div>

      {showForm && isManager && (
        <Card className="space-y-4">
          <CardTitle>{t("announcements.new")}</CardTitle>
          <div>
            <Label htmlFor="title">{t("announcements.title_field")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={createMutation.isPending}
              placeholder={t("announcements.title_field")}
            />
          </div>

          <div>
            <Label htmlFor="body">{t("announcements.body_field")}</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={createMutation.isPending}
              placeholder={t("announcements.body_field")}
              rows={4}
            />
          </div>

          {createMutation.error && (
            <ErrorState
              message={
                createMutation.error instanceof Error
                  ? createMutation.error.message
                  : t("announcements.create_failed")
              }
            />
          )}

          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? t("common.loading") : t("common.save")}
          </Button>
        </Card>
      )}

      {data && data.length === 0 ? (
        <EmptyState>{t("common.empty")}</EmptyState>
      ) : (
        <div className="space-y-3">
          {data?.map((announcement: Announcement) => (
            <Card key={announcement.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="mb-2 font-semibold text-slate-900">
                    {announcement.title}
                  </h3>
                  <p className="mb-2 text-sm text-slate-600">{announcement.body}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(announcement.created_at).toLocaleString()}
                  </p>
                </div>
                {isManager && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDeactivateAnnouncementId(announcement.id);
                      setDeactivateDialogOpen(true);
                    }}
                    disabled={deactivateMutation.isPending}
                    className="text-xs"
                  >
                    {t("announcements.deactivate")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={deactivateDialogOpen}
        onClose={() => {
          setDeactivateDialogOpen(false);
          setDeactivateAnnouncementId("");
        }}
        title={t("announcements.deactivate_confirm")}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeactivateDialogOpen(false);
                setDeactivateAnnouncementId("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => deactivateMutation.mutate(deactivateAnnouncementId)}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending
                ? t("common.loading")
                : t("announcements.deactivate")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {t("announcements.deactivate_confirm_body")}
        </p>
      </Dialog>
    </div>
  );
}
