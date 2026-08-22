import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LogoMark } from "../components/Brand/LogoMark";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { LoadingState } from "../components/ui/EmptyState";
import { Input, Label, Textarea } from "../components/ui/Input";
import { useMemberships } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import {
  dismissDeclinedApplication,
  listMyApplications,
  listMyDeclinedApplications,
  previewStoreByCode,
  submitApplication,
  withdrawApplication,
} from "../services/applications";
import {
  createStore,
  listMyOrphanedStores,
  reclaimStore,
} from "../services/stores";
import type { StoreApplication } from "../types/database";

export function OnboardingPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const addAnother = params.get("add") === "1";
  const { user, loading: sessionLoading } = useSession();
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
  const [approvedStore, setApprovedStore] = useState<string | null>(null);
  const [reclaimConfirmOpen, setReclaimConfirmOpen] = useState(false);
  const [reclaimConfirmStore, setReclaimConfirmStore] = useState<string | null>(
    null,
  );
  const previewedRef = useRef(false);

  // Query applications with 5s refetch
  const { data: applications, isLoading: applicationsLoading } = useQuery<
    (StoreApplication & { store: { name: string } | null })[]
  >({
    queryKey: ["applications", "mine"],
    queryFn: async () => listMyApplications(),
    refetchInterval: 5_000,
  });

  // Query declined applications
  const { data: declinedApplications } = useQuery<
    (StoreApplication & { store: { name: string } | null })[]
  >({
    queryKey: ["applications", "declined"],
    queryFn: async () => listMyDeclinedApplications(),
  });

  // Query orphaned stores the user created but no longer owns
  const { data: orphanedStores } = useQuery({
    queryKey: ["stores", "orphaned"],
    queryFn: async () => listMyOrphanedStores(),
  });

  // Compute derived values once memberships load
  const firstMembershipStoreId =
    memberships && memberships.length > 0 ? memberships[0].store_id : null;
  const firstMembershipStoreName =
    memberships && memberships.length > 0 ? memberships[0].store?.name : null;

  // Compute deactivation locally: user exists AND memberships empty AND no pending/declined apps AND no orphaned stores
  const isDeactivated =
    user &&
    (!memberships || memberships.length === 0) &&
    (!applications || applications.length === 0) &&
    (!declinedApplications || declinedApplications.length === 0) &&
    (!orphanedStores || orphanedStores.length === 0);

  const reclaimMutation = useMutation({
    mutationFn: async (storeId: string) => reclaimStore(storeId),
    onSuccess: (membership) => {
      setReclaimConfirmOpen(false);
      setReclaimConfirmStore(null);
      queryClient.invalidateQueries({ queryKey: ["memberships", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["stores", "orphaned"] });
      navigate(`/store/${membership.store_id}`, { replace: true });
    },
  });

  // Check for approved application and invalidate memberships
  useEffect(() => {
    if (!applications) return;
    const approved = applications.find((app) => app.status === "approved");
    if (approved && firstMembershipStoreName) {
      setApprovedStore(firstMembershipStoreName);
      queryClient.invalidateQueries({ queryKey: ["memberships", "mine"] });
    }
  }, [applications, firstMembershipStoreName, queryClient]);

  // Redirect once memberships appear — UNLESS `?add=1`, which is the signal
  // from the store-switcher that the user wants to add a second store.
  // Also check for deactivation and handle approved app navigation with delay.
  useEffect(() => {
    if (addAnother) return;
    if (sessionLoading || membershipsLoading || applicationsLoading) return;

    // Check for deactivation
    if (isDeactivated) {
      navigate("/deactivated", { replace: true });
      return;
    }

    // Handle approved redirect
    if (approvedStore && firstMembershipStoreId) {
      const timer = setTimeout(() => {
        navigate(`/store/${firstMembershipStoreId}`, { replace: true });
      }, 1200);
      return () => clearTimeout(timer);
    }

    if (firstMembershipStoreId) {
      navigate(`/store/${firstMembershipStoreId}`, { replace: true });
    }
  }, [
    addAnother,
    sessionLoading,
    membershipsLoading,
    applicationsLoading,
    firstMembershipStoreId,
    isDeactivated,
    approvedStore,
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

  // Dismiss declined application mutation
  const dismissDeclinedMutation = useMutation({
    mutationFn: async (id: string) => dismissDeclinedApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications", "declined"] });
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
        previewedRef.current = false;
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
          previewedRef.current = true;
        } else {
          setPreviewError(t("onboarding.join_unknown_code"));
          setPreviewedStoreName(null);
          setPreviewedCode(null);
          previewedRef.current = false;
        }
      } catch (err) {
        setPreviewError(errorMessage(err, t("onboarding.check_code_failed")));
        setPreviewedStoreName(null);
        setPreviewedCode(null);
        previewedRef.current = false;
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
    submitApplicationMutation.mutate(
      {
        code: previewedCode,
        note: joinNote || undefined,
      },
      {
        onError: (err: unknown) => {
          const anyErr = err as { code?: string; message?: string };
          if (
            anyErr.code === "42501" ||
            anyErr.message?.includes("join code")
          ) {
            if (previewedRef.current) {
              setPreviewError(t("onboarding.code_stale_hint"));
              previewedRef.current = false;
            }
          }
        },
      },
    );
  }, [previewedCode, joinNote, submitApplicationMutation, t]);

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
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <LoadingState>{t("common.loading")}</LoadingState>
      </div>
    );
  }

  // Show declined applications
  if (
    declinedApplications &&
    declinedApplications.length > 0 &&
    !pendingApplication
  ) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          {declinedApplications.map((app) => (
            <Card key={app.id}>
              <LogoMark className="h-12 mx-auto text-brand-navy mb-3" />
              <CardTitle className="font-display">
                {t("onboarding.declined_title")}
              </CardTitle>
              <p className="text-sm text-slate-600 mb-2">
                {t("onboarding.declined_body", {
                  store: app.store?.name ?? "cửa hàng",
                })}
              </p>
              {app.decision_reason && (
                <p className="text-sm text-slate-600 mb-4">
                  {t("onboarding.declined_reason", {
                    reason: app.decision_reason,
                  })}
                </p>
              )}
              <Button
                onClick={() => dismissDeclinedMutation.mutate(app.id)}
                disabled={dismissDeclinedMutation.isPending}
                className="w-full"
              >
                {dismissDeclinedMutation.isPending
                  ? t("common.loading")
                  : t("onboarding.declined_dismiss")}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Show pending application
  if (pendingApplication) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          {approvedStore && (
            <Alert variant="success">
              {t("onboarding.approved_toast", { store: approvedStore })}
            </Alert>
          )}
          <Card>
            <LogoMark className="h-12 mx-auto text-brand-navy mb-3" />
            <CardTitle className="font-display">
              {t("onboarding.pending_title")}
            </CardTitle>
            <p className="text-sm text-slate-600 mb-4">
              {t("onboarding.pending_body", {
                store: pendingApplication.store?.name ?? "",
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
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        {approvedStore && (
          <Alert variant="success">
            {t("onboarding.approved_toast", { store: approvedStore })}
          </Alert>
        )}
        {orphanedStores && orphanedStores.length > 0 && (
          <Card>
            <CardTitle>{t("onboarding.reclaim_title")}</CardTitle>
            <p className="text-xs text-slate-600 mb-3">
              {t("onboarding.reclaim_hint")}
            </p>
            <div className="space-y-2">
              {orphanedStores.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded border border-brand-hairline bg-brand-cream-light p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {s.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t("onboarding.reclaim_created", {
                        when: new Date(s.created_at).toLocaleDateString(),
                      })}
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setReclaimConfirmOpen(true);
                      setReclaimConfirmStore(s.id);
                    }}
                    disabled={reclaimMutation.isPending}
                    variant="primary"
                    className="text-xs"
                  >
                    {reclaimMutation.isPending
                      ? t("common.loading")
                      : t("onboarding.reclaim_button")}
                  </Button>
                </div>
              ))}
            </div>
            {reclaimMutation.error && (
              <div className="mt-3">
                <Alert variant="error">
                  {errorMessage(
                    reclaimMutation.error,
                    t("onboarding.reclaim_failed"),
                  )}
                </Alert>
              </div>
            )}
          </Card>
        )}

        <Dialog
          open={reclaimConfirmOpen}
          onClose={() => {
            setReclaimConfirmOpen(false);
            setReclaimConfirmStore(null);
          }}
          title={t("onboarding.reclaim_confirm_title")}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setReclaimConfirmOpen(false);
                  setReclaimConfirmStore(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (reclaimConfirmStore) {
                    reclaimMutation.mutate(reclaimConfirmStore);
                  }
                }}
                disabled={reclaimMutation.isPending}
              >
                {t("onboarding.reclaim_confirm_button")}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            {t("onboarding.reclaim_confirm_body", {
              store:
                orphanedStores?.find((s) => s.id === reclaimConfirmStore)
                  ?.name || "",
            })}
          </p>
        </Dialog>

        <Card>
          <LogoMark className="h-12 mx-auto text-brand-navy mb-3" />
          <CardTitle className="font-display">
            {t("onboarding.title")}
          </CardTitle>

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
                  <Alert variant="error">
                    {errorMessage(
                      createStoreMutation.error,
                      t("onboarding.create_failed"),
                    )}
                  </Alert>
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

                {previewError && <Alert variant="error">{previewError}</Alert>}

                {previewedStoreName && (
                  <Alert variant="success">
                    {t("onboarding.join_preview", { name: previewedStoreName })}
                  </Alert>
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

                    {submitApplicationMutation.error && (
                      <Alert variant="error">
                        {errorMessage(
                          submitApplicationMutation.error,
                          t("auth.signin_failed"),
                        )}
                      </Alert>
                    )}

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
        <p className="text-xs text-slate-500 text-center">
          {t("onboarding.invite_hint")}
        </p>
      </div>
    </div>
  );
}
