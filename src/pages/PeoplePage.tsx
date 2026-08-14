import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input, Label, Textarea } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
import { useSession } from "../hooks/useSession";
import { errorMessage } from "../lib/errorMessage";
import { useT } from "../lib/i18n";
import { parseVndToCents } from "../lib/money";
import {
  approveApplication,
  declineApplication,
  listPendingApplications,
} from "../services/applications";
import {
  buildInviteLink,
  createInvite,
  listInvitesFor,
  revokeInvite,
} from "../services/invites";
import {
  deactivateMember,
  listMembers,
  updateHourlyRate,
  updateMemberRole,
} from "../services/members";
import { grantManualPoints } from "../services/points";
import { listRules } from "../services/rules";
import type { EmploymentType, Role, Rule } from "../types/database";

export function PeoplePage(): JSX.Element {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const role = useRoleOn(storeId);
  const canManage = isManagerRole(role);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("employee");
  const [inviteEmploymentType, setInviteEmploymentType] =
    useState<EmploymentType>("hourly");
  const [inviteHourlyRate, setInviteHourlyRate] = useState(0);

  const [appFormState, setAppFormState] = useState<
    Record<
      string,
      {
        role: Role;
        employment_type: EmploymentType;
        hourly_rate_input: string;
        declineDialogOpen: boolean;
        declineReason: string;
      }
    >
  >({});

  const [grantPointsDialogOpen, setGrantPointsDialogOpen] = useState(false);
  const [grantPointsUserId, setGrantPointsUserId] = useState("");
  const [grantPointsRuleId, setGrantPointsRuleId] = useState("");
  const [grantPointsNote, setGrantPointsNote] = useState("");
  const [grantPointsSuccess, setGrantPointsSuccess] = useState(false);
  const [grantPointsSuccessRule, setGrantPointsSuccessRule] =
    useState<Rule | null>(null);

  const [editRateDialogOpen, setEditRateDialogOpen] = useState(false);
  const [editRateUserId, setEditRateUserId] = useState("");
  const [editRateValue, setEditRateValue] = useState("");

  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivateUserId, setDeactivateUserId] = useState("");
  const [deactivateMemberName, setDeactivateMemberName] = useState("");

  const membersQuery = useQuery({
    queryKey: ["members", storeId],
    queryFn: () => (storeId ? listMembers(storeId) : Promise.resolve([])),
    enabled: !!storeId,
  });

  const invitesQuery = useQuery({
    queryKey: ["invites", storeId],
    queryFn: () => (storeId ? listInvitesFor(storeId) : Promise.resolve([])),
    enabled: !!storeId && canManage,
  });

  const applicationsQuery = useQuery({
    queryKey: ["applications", "pending", storeId],
    queryFn: () =>
      storeId ? listPendingApplications(storeId) : Promise.resolve([]),
    enabled: !!storeId && canManage,
  });

  const rulesQuery = useQuery({
    queryKey: ["rules", storeId],
    queryFn: () => (storeId ? listRules(storeId) : Promise.resolve([])),
    enabled: !!storeId && canManage,
  });

  const createInviteMutation = useMutation({
    mutationFn: (data: {
      email: string;
      role: Role;
      employment_type: EmploymentType;
      hourly_rate_cents: number;
    }) =>
      storeId
        ? createInvite({ store_id: storeId, ...data })
        : Promise.resolve(null as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites", storeId] });
      setShowInviteForm(false);
      setInviteEmail("");
      setInviteHourlyRate(0);
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites", storeId] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: Role }) =>
      storeId
        ? updateMemberRole(userId, storeId, newRole)
        : Promise.resolve(null as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", storeId] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) =>
      storeId
        ? deactivateMember(userId, storeId)
        : Promise.resolve(null as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", storeId] });
      setDeactivateDialogOpen(false);
    },
  });

  const grantPointsMutation = useMutation({
    mutationFn: () =>
      storeId
        ? grantManualPoints({
            storeId,
            ruleId: grantPointsRuleId,
            userId: grantPointsUserId,
            note: grantPointsNote || undefined,
          })
        : Promise.resolve(null as any),
    onSuccess: () => {
      const rule = manualRules.find((r) => r.id === grantPointsRuleId);
      if (rule) {
        setGrantPointsSuccessRule(rule);
        setGrantPointsSuccess(true);
        setTimeout(() => {
          setGrantPointsDialogOpen(false);
          setGrantPointsSuccess(false);
          setGrantPointsSuccessRule(null);
          setGrantPointsRuleId("");
          setGrantPointsNote("");
        }, 1200);
      }
    },
  });

  const editRateMutation = useMutation({
    mutationFn: () => {
      const rateCents = parseVndToCents(editRateValue);
      if (rateCents === null) throw new Error("Invalid hourly rate");
      return storeId
        ? updateHourlyRate({
            storeId,
            userId: editRateUserId,
            hourlyRateCents: rateCents,
          })
        : Promise.resolve(null as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", storeId] });
      setEditRateDialogOpen(false);
      setEditRateValue("");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (data: {
      id: string;
      role: Role;
      employment_type: EmploymentType;
      hourly_rate_cents: number;
    }) => approveApplication(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["applications", "pending", storeId],
      });
      queryClient.invalidateQueries({ queryKey: ["members", storeId] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (data: { id: string; reason?: string }) =>
      declineApplication(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["applications", "pending", storeId],
      });
    },
  });

  if (
    membersQuery.isLoading ||
    invitesQuery.isLoading ||
    applicationsQuery.isLoading ||
    rulesQuery.isLoading
  ) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (membersQuery.error) {
    return (
      <ErrorState
        message={errorMessage(membersQuery.error, "Error loading members")}
      />
    );
  }

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const applications = applicationsQuery.data ?? [];
  const rules = rulesQuery.data ?? [];
  const manualRules = rules.filter((r) => r.active && r.kind === "manual");

  const activeOwnerCount = members.filter(
    (m) => m.role === "owner" && m.active,
  ).length;

  function getAppFormState(appId: string) {
    if (!appFormState[appId]) {
      setAppFormState((prev) => ({
        ...prev,
        [appId]: {
          role: "employee" as Role,
          employment_type: "hourly" as EmploymentType,
          hourly_rate_input: "0",
          declineDialogOpen: false,
          declineReason: "",
        },
      }));
    }
    return appFormState[appId];
  }

  function handleApproveApplication(appId: string) {
    const state = getAppFormState(appId);
    const rateCents = parseVndToCents(state.hourly_rate_input);
    if (rateCents === null) {
      alert("Please enter a valid hourly rate");
      return;
    }
    approveMutation.mutate({
      id: appId,
      role: state.role,
      employment_type: state.employment_type,
      hourly_rate_cents: rateCents,
    });
  }

  function handleDeclineApplication(appId: string) {
    const state = getAppFormState(appId);
    declineMutation.mutate({
      id: appId,
      reason: state.declineReason || undefined,
    });
    setAppFormState((prev) => ({
      ...prev,
      [appId]: {
        ...prev[appId],
        declineDialogOpen: false,
        declineReason: "",
      },
    }));
  }

  function handleCreateInvite() {
    createInviteMutation.mutate({
      email: inviteEmail,
      role: inviteRole,
      employment_type: inviteEmploymentType,
      hourly_rate_cents: inviteHourlyRate * 100,
    });
  }

  async function copyInviteLink(token: string) {
    const link = buildInviteLink(token);
    await navigator.clipboard.writeText(link);
  }

  // Team-is-empty helper: manager, only self on the store, no pending invites,
  // no pending applications. Point at Settings → Join code instead of leaving
  // them to hunt for the invite affordance.
  const isTeamEmpty =
    canManage &&
    members.length <= 1 &&
    members.every((m) => m.user_id === user?.id) &&
    invites.length === 0 &&
    applications.length === 0;

  return (
    <div className="space-y-6">
      {isTeamEmpty && storeId && (
        <Card>
          <CardTitle>{t("people.empty_title")}</CardTitle>
          <p className="text-sm text-slate-600 mb-3">
            {t("people.empty_body")}
          </p>
          <Link
            to={`/store/${storeId}/settings`}
            className="inline-block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {t("people.empty_open_settings")}
          </Link>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardTitle>{t("people.applications.title")}</CardTitle>
          {applications.length === 0 ? (
            <EmptyState>{t("people.applications.empty")}</EmptyState>
          ) : (
            <div className="space-y-4">
              {applications.map((app) => {
                const state = getAppFormState(app.id);
                const roleOptions: Array<{ value: Role; label: string }> = [
                  { value: "employee", label: t("people.role_employee") },
                  { value: "manager", label: t("people.role_manager") },
                  { value: "owner", label: t("people.role_owner") },
                ];
                const employmentOptions: Array<{
                  value: EmploymentType;
                  label: string;
                }> = [
                  {
                    value: "full_time",
                    label: t("people.employment_full_time"),
                  },
                  {
                    value: "part_time",
                    label: t("people.employment_part_time"),
                  },
                  { value: "hourly", label: t("people.employment_hourly") },
                ];

                return (
                  <div
                    key={app.id}
                    className="border-l-4 border-blue-200 bg-blue-50 p-4 rounded"
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {app.user_id.substring(0, 8)}
                        </div>
                        <div className="text-xs text-slate-600">
                          {t("people.applications.submitted", {
                            when: new Date(app.submitted_at).toLocaleString(),
                          })}
                        </div>
                        {app.note && (
                          <div className="text-xs text-slate-600 mt-1">
                            {t("people.applications.note", {
                              note: app.note,
                            })}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <Label>{t("people.applications.role")}</Label>
                          <Select
                            value={state.role}
                            onChange={(v) =>
                              setAppFormState((prev) => ({
                                ...prev,
                                [app.id]: {
                                  ...prev[app.id],
                                  role: v as Role,
                                },
                              }))
                            }
                            options={roleOptions}
                            disabled={approveMutation.isPending}
                            ariaLabel={t("people.applications.role")}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label>
                            {t("people.applications.employment_type")}
                          </Label>
                          <Select
                            value={state.employment_type}
                            onChange={(v) =>
                              setAppFormState((prev) => ({
                                ...prev,
                                [app.id]: {
                                  ...prev[app.id],
                                  employment_type: v as EmploymentType,
                                },
                              }))
                            }
                            options={employmentOptions}
                            disabled={approveMutation.isPending}
                            ariaLabel={t("people.applications.employment_type")}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label>{t("people.applications.hourly_rate")}</Label>
                          <Input
                            type="text"
                            value={state.hourly_rate_input}
                            onChange={(e) =>
                              setAppFormState((prev) => ({
                                ...prev,
                                [app.id]: {
                                  ...prev[app.id],
                                  hourly_rate_input: e.target.value,
                                },
                              }))
                            }
                            disabled={approveMutation.isPending}
                            placeholder="0"
                            className="mt-1 text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApproveApplication(app.id)}
                          disabled={approveMutation.isPending}
                          className="text-xs"
                        >
                          {approveMutation.isPending
                            ? t("common.loading")
                            : t("people.applications.approve")}
                        </Button>

                        <Button
                          variant="danger"
                          onClick={() =>
                            setAppFormState((prev) => ({
                              ...prev,
                              [app.id]: {
                                ...prev[app.id],
                                declineDialogOpen: true,
                              },
                            }))
                          }
                          disabled={declineMutation.isPending}
                          className="text-xs"
                        >
                          {t("people.applications.decline")}
                        </Button>
                      </div>

                      {approveMutation.error && (
                        <Alert variant="error">
                          {errorMessage(
                            approveMutation.error,
                            "Failed to approve",
                          )}
                        </Alert>
                      )}
                      {declineMutation.error && (
                        <Alert variant="error">
                          {errorMessage(
                            declineMutation.error,
                            "Failed to decline",
                          )}
                        </Alert>
                      )}

                      <Dialog
                        open={state.declineDialogOpen}
                        onClose={() =>
                          setAppFormState((prev) => ({
                            ...prev,
                            [app.id]: {
                              ...prev[app.id],
                              declineDialogOpen: false,
                              declineReason: "",
                            },
                          }))
                        }
                        title={t("people.decline_reason_title")}
                        footer={
                          <>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setAppFormState((prev) => ({
                                  ...prev,
                                  [app.id]: {
                                    ...prev[app.id],
                                    declineDialogOpen: false,
                                    declineReason: "",
                                  },
                                }))
                              }
                            >
                              {t("common.cancel")}
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => handleDeclineApplication(app.id)}
                              disabled={declineMutation.isPending}
                            >
                              {declineMutation.isPending
                                ? t("common.loading")
                                : t("people.applications.decline")}
                            </Button>
                          </>
                        }
                      >
                        <Textarea
                          value={state.declineReason}
                          onChange={(e) =>
                            setAppFormState((prev) => ({
                              ...prev,
                              [app.id]: {
                                ...prev[app.id],
                                declineReason: e.target.value,
                              },
                            }))
                          }
                          placeholder={t("people.decline_reason_placeholder")}
                        />
                      </Dialog>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>{t("people.title")}</CardTitle>
        {members.length === 0 ? (
          <EmptyState>{t("common.empty")}</EmptyState>
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const isLastOwner =
                member.role === "owner" && activeOwnerCount === 1;
              const isSelf = member.user_id === user?.id;
              const roleOptions: Array<{ value: Role; label: string }> = [
                { value: "employee", label: t("people.role_employee") },
                { value: "manager", label: t("people.role_manager") },
                { value: "owner", label: t("people.role_owner") },
              ];

              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-slate-900">
                      {member.profile?.display_name ||
                        member.user_id.substring(0, 8)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t(`people.role_${member.role}`)}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <div
                        title={
                          isLastOwner
                            ? t("people.last_owner_blocked")
                            : undefined
                        }
                      >
                        <Select
                          value={member.role}
                          onChange={(v) =>
                            updateRoleMutation.mutate({
                              userId: member.user_id,
                              newRole: v as Role,
                            })
                          }
                          options={roleOptions}
                          disabled={updateRoleMutation.isPending || isLastOwner}
                          ariaLabel={t("people.applications.role")}
                          className="text-xs"
                        />
                      </div>
                      <Button
                        onClick={() => {
                          setGrantPointsUserId(member.user_id);
                          setGrantPointsRuleId("");
                          setGrantPointsNote("");
                          setGrantPointsSuccess(false);
                          setGrantPointsDialogOpen(true);
                        }}
                        disabled={grantPointsMutation.isPending}
                        className="text-xs"
                      >
                        {t("people.grant_points")}
                      </Button>
                      <Button
                        onClick={() => {
                          setEditRateUserId(member.user_id);
                          setEditRateValue("");
                          setEditRateDialogOpen(true);
                        }}
                        disabled={editRateMutation.isPending}
                        className="text-xs"
                      >
                        {t("people.edit_rate")}
                      </Button>
                      <div
                        title={
                          isLastOwner
                            ? t("people.last_owner_blocked")
                            : undefined
                        }
                      >
                        <Button
                          variant="danger"
                          onClick={() => {
                            setDeactivateUserId(member.user_id);
                            setDeactivateMemberName(
                              member.profile?.display_name ||
                                member.user_id.substring(0, 8),
                            );
                            setDeactivateDialogOpen(true);
                          }}
                          disabled={
                            deactivateMutation.isPending ||
                            isLastOwner ||
                            isSelf
                          }
                          className="text-xs"
                        >
                          {t("people.deactivate")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {canManage && (
        <>
          <Card>
            <CardTitle>{t("people.title")}</CardTitle>
            {invites.length === 0 ? (
              <EmptyState>{t("common.empty")}</EmptyState>
            ) : (
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-900">
                        {invite.email}
                      </div>
                      <div className="text-xs text-slate-500">
                        {invite.role}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => copyInviteLink(invite.token)}
                        className="text-xs"
                      >
                        {t("people.invite.link")}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => revokeInviteMutation.mutate(invite.id)}
                        disabled={revokeInviteMutation.isPending}
                        className="text-xs"
                      >
                        {t("common.delete")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>{t("people.invite_button")}</CardTitle>
            {showInviteForm ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="invite-email">
                    {t("people.invite.email")}
                  </Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={createInviteMutation.isPending}
                  />
                </div>

                <div>
                  <Label htmlFor="invite-role">{t("people.invite.role")}</Label>
                  <Select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(v) => setInviteRole(v as Role)}
                    options={[
                      {
                        value: "employee",
                        label: t("people.role_employee"),
                      },
                      {
                        value: "manager",
                        label: t("people.role_manager"),
                      },
                    ]}
                    disabled={createInviteMutation.isPending}
                    ariaLabel={t("people.invite.role")}
                  />
                </div>

                <div>
                  <Label htmlFor="invite-employment">
                    {t("people.invite.employment_type")}
                  </Label>
                  <Select
                    id="invite-employment"
                    value={inviteEmploymentType}
                    onChange={(v) =>
                      setInviteEmploymentType(v as EmploymentType)
                    }
                    options={[
                      {
                        value: "full_time",
                        label: t("people.employment_full_time"),
                      },
                      {
                        value: "part_time",
                        label: t("people.employment_part_time"),
                      },
                      {
                        value: "hourly",
                        label: t("people.employment_hourly"),
                      },
                    ]}
                    disabled={createInviteMutation.isPending}
                    ariaLabel={t("people.invite.employment_type")}
                  />
                </div>

                <div>
                  <Label htmlFor="invite-rate">
                    {t("people.invite.hourly_rate")}
                  </Label>
                  <Input
                    id="invite-rate"
                    type="number"
                    value={inviteHourlyRate}
                    onChange={(e) =>
                      setInviteHourlyRate(Number(e.target.value))
                    }
                    disabled={createInviteMutation.isPending}
                    min="0"
                  />
                </div>

                {createInviteMutation.error && (
                  <Alert variant="error">
                    {errorMessage(
                      createInviteMutation.error,
                      "Failed to create invite",
                    )}
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateInvite}
                    disabled={createInviteMutation.isPending}
                    className="flex-1"
                  >
                    {createInviteMutation.isPending
                      ? t("common.loading")
                      : t("people.invite.send")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowInviteForm(false)}
                    disabled={createInviteMutation.isPending}
                    className="flex-1"
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setShowInviteForm(true)}
                className="w-full"
              >
                {t("people.invite_button")}
              </Button>
            )}
          </Card>
        </>
      )}

      <Dialog
        open={grantPointsDialogOpen}
        onClose={() => {
          setGrantPointsDialogOpen(false);
          setGrantPointsRuleId("");
          setGrantPointsNote("");
          setGrantPointsSuccess(false);
        }}
        title={t("people.grant_points_title", {
          name:
            members.find((m) => m.user_id === grantPointsUserId)?.profile
              ?.display_name ||
            members
              .find((m) => m.user_id === grantPointsUserId)
              ?.user_id?.substring(0, 8) ||
            "",
        })}
        footer={
          !grantPointsSuccess && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setGrantPointsDialogOpen(false);
                  setGrantPointsRuleId("");
                  setGrantPointsNote("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => grantPointsMutation.mutate()}
                disabled={grantPointsMutation.isPending || !grantPointsRuleId}
              >
                {grantPointsMutation.isPending
                  ? t("common.loading")
                  : t("people.grant_points_submit")}
              </Button>
            </>
          )
        }
      >
        {grantPointsSuccess && grantPointsSuccessRule ? (
          <Alert variant="success">
            {t("people.grant_points_success", {
              points: grantPointsSuccessRule.points_delta,
            })}
          </Alert>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>{t("people.grant_points_rule")}</Label>
              <Select
                value={grantPointsRuleId}
                onChange={setGrantPointsRuleId}
                options={manualRules.map((r) => ({
                  value: r.id,
                  label: r.name,
                }))}
                searchable
                ariaLabel={t("people.grant_points_rule")}
                placeholder={t("common.select_placeholder")}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("people.grant_points_note")}</Label>
              <Textarea
                value={grantPointsNote}
                onChange={(e) => setGrantPointsNote(e.target.value)}
                placeholder={t("people.grant_points_note")}
              />
            </div>
            {grantPointsMutation.error && (
              <Alert variant="error">
                {errorMessage(
                  grantPointsMutation.error,
                  "Failed to grant points",
                )}
              </Alert>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={editRateDialogOpen}
        onClose={() => {
          setEditRateDialogOpen(false);
          setEditRateValue("");
        }}
        title={t("people.edit_rate_title", {
          name:
            members.find((m) => m.user_id === editRateUserId)?.profile
              ?.display_name ||
            members
              .find((m) => m.user_id === editRateUserId)
              ?.user_id?.substring(0, 8) ||
            "",
        })}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEditRateDialogOpen(false);
                setEditRateValue("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => editRateMutation.mutate()}
              disabled={editRateMutation.isPending || !editRateValue}
            >
              {editRateMutation.isPending
                ? t("common.loading")
                : t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>{t("people.edit_rate_new")}</Label>
            <Input
              type="text"
              value={editRateValue}
              onChange={(e) => setEditRateValue(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
          <p className="text-sm text-slate-600">
            {t("people.edit_rate_effective")}
          </p>
          {editRateMutation.error && (
            <Alert variant="error">
              {errorMessage(editRateMutation.error, "Failed to update rate")}
            </Alert>
          )}
        </div>
      </Dialog>

      <Dialog
        open={deactivateDialogOpen}
        onClose={() => setDeactivateDialogOpen(false)}
        title={t("people.deactivate_confirm_title", {
          name: deactivateMemberName,
        })}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeactivateDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => deactivateMutation.mutate(deactivateUserId)}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending
                ? t("common.loading")
                : t("people.deactivate")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {t("people.deactivate_confirm_body")}
        </p>
        {deactivateMutation.error && (
          <Alert variant="error" className="mt-4">
            {errorMessage(deactivateMutation.error, "Failed to deactivate")}
          </Alert>
        )}
      </Dialog>
    </div>
  );
}
