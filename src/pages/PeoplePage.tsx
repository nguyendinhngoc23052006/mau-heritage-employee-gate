import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/EmptyState";
import { Input, Label } from "../components/ui/Input";
import { isManagerRole, useRoleOn } from "../hooks/useMemberships";
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
  updateMemberRole,
} from "../services/members";
import type { EmploymentType, Role } from "../types/database";

export function PeoplePage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
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
        declineReasonShown: boolean;
        declineReason: string;
      }
    >
  >({});

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
    applicationsQuery.isLoading
  ) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (membersQuery.error) {
    return (
      <ErrorState
        message={
          membersQuery.error instanceof Error
            ? membersQuery.error.message
            : "Error loading members"
        }
      />
    );
  }

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];
  const applications = applicationsQuery.data ?? [];

  function getAppFormState(appId: string) {
    if (!appFormState[appId]) {
      setAppFormState((prev) => ({
        ...prev,
        [appId]: {
          role: "employee" as Role,
          employment_type: "hourly" as EmploymentType,
          hourly_rate_input: "0",
          declineReasonShown: false,
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
    if (!window.confirm("Confirm decline?")) return;
    declineMutation.mutate({
      id: appId,
      reason: state.declineReason || undefined,
    });
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

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardTitle>{t("people.applications.title")}</CardTitle>
          {applications.length === 0 ? (
            <EmptyState>{t("people.applications.empty")}</EmptyState>
          ) : (
            <div className="space-y-4">
              {applications.map((app) => {
                const state = getAppFormState(app.id);
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

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label>{t("people.applications.role")}</Label>
                          <select
                            value={state.role}
                            onChange={(e) =>
                              setAppFormState((prev) => ({
                                ...prev,
                                [app.id]: {
                                  ...prev[app.id],
                                  role: e.target.value as Role,
                                },
                              }))
                            }
                            className="block w-full rounded-md border border-slate-300 px-2 py-1 text-xs mt-1"
                            disabled={approveMutation.isPending}
                          >
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="owner">Owner</option>
                          </select>
                        </div>

                        <div>
                          <Label>
                            {t("people.applications.employment_type")}
                          </Label>
                          <select
                            value={state.employment_type}
                            onChange={(e) =>
                              setAppFormState((prev) => ({
                                ...prev,
                                [app.id]: {
                                  ...prev[app.id],
                                  employment_type: e.target
                                    .value as EmploymentType,
                                },
                              }))
                            }
                            className="block w-full rounded-md border border-slate-300 px-2 py-1 text-xs mt-1"
                            disabled={approveMutation.isPending}
                          >
                            <option value="full_time">Full-time</option>
                            <option value="part_time">Part-time</option>
                            <option value="hourly">Hourly</option>
                          </select>
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

                        {state.declineReasonShown ? (
                          <>
                            <Input
                              type="text"
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
                              placeholder={t(
                                "people.applications.decline_reason",
                              )}
                              className="text-xs flex-1"
                              disabled={declineMutation.isPending}
                            />
                            <Button
                              variant="danger"
                              onClick={() => handleDeclineApplication(app.id)}
                              disabled={declineMutation.isPending}
                              className="text-xs"
                            >
                              {declineMutation.isPending
                                ? t("common.loading")
                                : t("common.delete")}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setAppFormState((prev) => ({
                                  ...prev,
                                  [app.id]: {
                                    ...prev[app.id],
                                    declineReasonShown: false,
                                    declineReason: "",
                                  },
                                }))
                              }
                              disabled={declineMutation.isPending}
                              className="text-xs"
                            >
                              {t("common.cancel")}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="danger"
                            onClick={() =>
                              setAppFormState((prev) => ({
                                ...prev,
                                [app.id]: {
                                  ...prev[app.id],
                                  declineReasonShown: true,
                                },
                              }))
                            }
                            disabled={declineMutation.isPending}
                            className="text-xs"
                          >
                            {t("people.applications.decline")}
                          </Button>
                        )}
                      </div>

                      {approveMutation.error && (
                        <ErrorState
                          message={
                            approveMutation.error instanceof Error
                              ? approveMutation.error.message
                              : "Failed to approve"
                          }
                        />
                      )}
                      {declineMutation.error && (
                        <ErrorState
                          message={
                            declineMutation.error instanceof Error
                              ? declineMutation.error.message
                              : "Failed to decline"
                          }
                        />
                      )}
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
            {members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm text-slate-900">
                    {member.profile.display_name || "Unknown"}
                  </div>
                  <div className="text-xs text-slate-500">{member.role}</div>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <select
                      value={member.role}
                      onChange={(e) =>
                        updateRoleMutation.mutate({
                          userId: member.user_id,
                          newRole: e.target.value as Role,
                        })
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      disabled={updateRoleMutation.isPending}
                    >
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                    <Button
                      variant="danger"
                      onClick={() => deactivateMutation.mutate(member.user_id)}
                      disabled={deactivateMutation.isPending}
                      className="text-xs"
                    >
                      {t("common.delete")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
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
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    disabled={createInviteMutation.isPending}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="invite-employment">
                    {t("people.invite.employment_type")}
                  </Label>
                  <select
                    id="invite-employment"
                    value={inviteEmploymentType}
                    onChange={(e) =>
                      setInviteEmploymentType(e.target.value as EmploymentType)
                    }
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    disabled={createInviteMutation.isPending}
                  >
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="hourly">Hourly</option>
                  </select>
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
                  <ErrorState
                    message={
                      createInviteMutation.error instanceof Error
                        ? createInviteMutation.error.message
                        : "Failed to create invite"
                    }
                  />
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
    </div>
  );
}
