import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/EmptyState";
import { Input, Label, Textarea } from "../components/ui/Input";
import { useMemberships } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { useT } from "../lib/i18n";
import {
  listMyApplications,
  previewStoreByCode,
  submitApplication,
  withdrawApplication,
} from "../services/applications";
import { createStore } from "../services/stores";

export function OnboardingPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const addAnother = params.get("add") === "1";
  const { loading: sessionLoading } = useSession();
  const { data: memberships, isLoading: membershipsLoading } = useMemberships();

  const [storeName, setStoreName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinNote, setJoinNote] = useState("");
  const [previewedStoreName, setPreviewedStoreName] = useState<string | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewedCode, setPreviewedCode] = useState<string | null>(null);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Query applications with 5s refetch
  const { data: applications, isLoading: applicationsLoading } = useQuery({
    queryKey: ["applications", "mine"],
    queryFn: async () => listMyApplications(),
    refetchInterval: 5_000,
  });

  // Check for approved application and invalidate memberships
  useEffect(() => {
    if (!applications) return;
    const hasApproved = applications.some((app) => app.status === "approved");
    if (hasApproved) {
      queryClient.invalidateQueries({ queryKey: ["memberships", "mine"] });
    }
  }, [applications, queryClient]);

  // Redirect once memberships appear — UNLESS `?add=1`, which is the signal
  // from the store-switcher that the user wants to add a second store.
  // useEffect keeps hook order stable regardless of the redirect decision.
  const firstMembershipStoreId =
    memberships && memberships.length > 0 ? memberships[0].store_id : null;
  useEffect(() => {
    if (addAnother) return;
    if (sessionLoading || membershipsLoading) return;
    if (firstMembershipStoreId) {
      navigate(`/store/${firstMembershipStoreId}`, { replace: true });
    }
  }, [
    addAnother,
    sessionLoading,
    membershipsLoading,
    firstMembershipStoreId,
    navigate,
  ]);

  // Create store mutation
  const createStoreMutation = useMutation({
    mutationFn: async (name: string) => createStore({ name }),
    onSuccess: (store) => {
      queryClient.invalidateQueries({ queryKey: ["memberships", "mine"] });
      navigate(`/store/${store.id}`, { replace: true });
    },
  });

  // Submit application mutation
  const submitApplicationMutation = useMutation({
    mutationFn: async (params: { code: string; note?: string }) =>
      submitApplication(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications", "mine"] });
      setJoinCode("");
      setJoinNote("");
      setPreviewedStoreName(null);
      setPreviewedCode(null);
    },
  });

  // Withdraw application mutation
  const withdrawMutation = useMutation({
    mutationFn: async (id: string) => withdrawApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications", "mine"] });
    },
  });

  // Handle create store
  const handleCreateStore = useCallback(() => {
    if (!storeName.trim()) return;
    createStoreMutation.mutate(storeName);
  }, [storeName, createStoreMutation]);

  // Debounced preview on code change
  const handleJoinCodeChange = useCallback(
    (value: string) => {
      const lower = value.toLowerCase();
      setJoinCode(lower);

      if (debounceTimer) clearTimeout(debounceTimer);

      if (lower.length >= 4) {
        const timer = setTimeout(() => {
          performPreview(lower);
        }, 400);
        setDebounceTimer(timer);
      } else {
        setPreviewedStoreName(null);
        setPreviewError(null);
        setPreviewedCode(null);
      }
    },
    [debounceTimer],
  );

  // Manual preview check
  const performPreview = useCallback(
    async (code: string) => {
      try {
        setPreviewError(null);
        const preview = await previewStoreByCode(code);
        if (preview) {
          setPreviewedStoreName(preview.name);
          setPreviewedCode(code);
        } else {
          setPreviewError(t("onboarding.join_unknown_code"));
          setPreviewedStoreName(null);
          setPreviewedCode(null);
        }
      } catch (err) {
        setPreviewError(
          err instanceof Error ? err.message : "Failed to check code",
        );
        setPreviewedStoreName(null);
        setPreviewedCode(null);
      }
    },
    [t],
  );

  // Handle manual preview check button
  const handleCheckCode = useCallback(() => {
    if (joinCode.length >= 4) {
      performPreview(joinCode);
    }
  }, [joinCode, performPreview]);

  // Handle submit application
  const handleSubmitApplication = useCallback(() => {
    if (!previewedCode) return;
    submitApplicationMutation.mutate({
      code: previewedCode,
      note: joinNote || undefined,
    });
  }, [previewedCode, joinNote, submitApplicationMutation]);

  // Withdraw application
  const handleWithdraw = useCallback(
    (appId: string) => {
      withdrawMutation.mutate(appId);
    },
    [withdrawMutation],
  );

  // Determine which section to show
  const pendingApplication = applications?.find(
    (app) => app.status === "pending",
  );

  if (sessionLoading || membershipsLoading || applicationsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  // Show pending application
  if (pendingApplication) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Card>
            <CardTitle>{t("onboarding.pending_title")}</CardTitle>
            <p className="text-sm text-slate-600 mb-4">
              {t("onboarding.pending_body", {
                store: pendingApplication.store_id.substring(0, 8),
              })}
            </p>
            <Button
              onClick={() => handleWithdraw(pendingApplication.id)}
              disabled={withdrawMutation.isPending}
              variant="danger"
              className="w-full"
            >
              {withdrawMutation.isPending
                ? t("common.loading")
                : t("onboarding.pending_withdraw")}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card>
          <CardTitle>{t("onboarding.title")}</CardTitle>

          <div className="space-y-6">
            {/* Create store section */}
            <div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">
                {t("onboarding.create_section_title")}
              </h3>
              <p className="text-xs text-slate-600 mb-4">
                {t("onboarding.create_section_subtitle")}
              </p>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="store-name">
                    {t("onboarding.store_name")}
                  </Label>
                  <Input
                    id="store-name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Mau Heritage Store #1"
                    disabled={createStoreMutation.isPending}
                  />
                </div>
                {createStoreMutation.error && (
                  <ErrorState
                    message={
                      createStoreMutation.error instanceof Error
                        ? createStoreMutation.error.message
                        : "Failed to create store"
                    }
                  />
                )}
                <Button
                  onClick={handleCreateStore}
                  disabled={createStoreMutation.isPending || !storeName.trim()}
                  className="w-full"
                >
                  {createStoreMutation.isPending
                    ? t("common.loading")
                    : t("onboarding.create_button")}
                </Button>
              </div>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-slate-500">
                  {t("onboarding.section_or")}
                </span>
              </div>
            </div>

            {/* Join store section */}
            <div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">
                {t("onboarding.join_section_title")}
              </h3>
              <p className="text-xs text-slate-600 mb-4">
                {t("onboarding.join_section_subtitle")}
              </p>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="join-code">
                    {t("onboarding.join_code_label")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="join-code"
                      value={joinCode}
                      onChange={(e) => handleJoinCodeChange(e.target.value)}
                      placeholder={t("onboarding.join_code_placeholder")}
                      minLength={4}
                      disabled={submitApplicationMutation.isPending}
                    />
                    <Button
                      onClick={handleCheckCode}
                      disabled={
                        joinCode.length < 4 ||
                        submitApplicationMutation.isPending
                      }
                      variant="secondary"
                      className="px-3"
                    >
                      {t("onboarding.join_code_check")}
                    </Button>
                  </div>
                </div>

                {previewError && <ErrorState message={previewError} />}

                {previewedStoreName && (
                  <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
                    {t("onboarding.join_preview", { name: previewedStoreName })}
                  </div>
                )}

                {previewedStoreName && (
                  <>
                    <div>
                      <Label htmlFor="join-note">
                        {t("onboarding.join_note_label")}
                      </Label>
                      <Textarea
                        id="join-note"
                        value={joinNote}
                        onChange={(e) => setJoinNote(e.target.value)}
                        placeholder={t("onboarding.join_note_label")}
                        disabled={submitApplicationMutation.isPending}
                        rows={3}
                      />
                    </div>

                    <Button
                      onClick={handleSubmitApplication}
                      disabled={submitApplicationMutation.isPending}
                      className="w-full"
                    >
                      {submitApplicationMutation.isPending
                        ? t("common.loading")
                        : t("onboarding.join_button")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Hint */}
        <p className="text-xs text-slate-500 mt-4 text-center">
          {t("onboarding.invite_hint")}
        </p>
      </div>
    </div>
  );
}
