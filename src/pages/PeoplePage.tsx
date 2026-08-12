import { useParams } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { Card, CardTitle } from "../components/ui/Card";
import { ErrorState, LoadingState, EmptyState } from "../components/ui/EmptyState";
import { useT } from "../lib/i18n";
import { useRoleOn, isManagerRole } from "../hooks/useMemberships";
import { listMembers, updateMemberRole, deactivateMember } from "../services/members";
import { listInvitesFor, createInvite, revokeInvite, buildInviteLink } from "../services/invites";
import type { Role, EmploymentType } from "../types/database";

export function PeoplePage() {
  const t = useT();
  const { storeId } = useParams<{ storeId: string }>();
  const queryClient = useQueryClient();
  const role = useRoleOn(storeId);
  const canManage = isManagerRole(role);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("employee");
  const [inviteEmploymentType, setInviteEmploymentType] = useState<EmploymentType>("hourly");
  const [inviteHourlyRate, setInviteHourlyRate] = useState(0);

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

  const createInviteMutation = useMutation({
    mutationFn: (data: {
      email: string;
      role: Role;
      employment_type: EmploymentType;
      hourly_rate_cents: number;
    }) =>
      storeId ? createInvite({ store_id: storeId, ...data }) : Promise.resolve(null as any),
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
      storeId ? updateMemberRole(userId, storeId, newRole) : Promise.resolve(null as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", storeId] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => (storeId ? deactivateMember(userId, storeId) : Promise.resolve(null as any)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", storeId] });
    },
  });

  if (membersQuery.isLoading || invitesQuery.isLoading) {
    return <LoadingState>{t("common.loading")}</LoadingState>;
  }

  if (membersQuery.error) {
    return <ErrorState message={membersQuery.error instanceof Error ? membersQuery.error.message : "Error loading members"} />;
  }

  const members = membersQuery.data ?? [];
  const invites = invitesQuery.data ?? [];

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
      <Card>
        <CardTitle>{t("people.title")}</CardTitle>
        {members.length === 0 ? (
          <EmptyState>{t("common.empty")}</EmptyState>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.user_id} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex-1">
                  <div className="font-medium text-sm text-slate-900">{member.profile.display_name || "Unknown"}</div>
                  <div className="text-xs text-slate-500">{member.role}</div>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => updateRoleMutation.mutate({ userId: member.user_id, newRole: e.target.value as Role })}
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
                  <div key={invite.id} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm text-slate-900">{invite.email}</div>
                      <div className="text-xs text-slate-500">{invite.role}</div>
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
                  <Label htmlFor="invite-email">{t("people.invite.email")}</Label>
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
                  <Label htmlFor="invite-employment">{t("people.invite.employment_type")}</Label>
                  <select
                    id="invite-employment"
                    value={inviteEmploymentType}
                    onChange={(e) => setInviteEmploymentType(e.target.value as EmploymentType)}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                    disabled={createInviteMutation.isPending}
                  >
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="invite-rate">{t("people.invite.hourly_rate")}</Label>
                  <Input
                    id="invite-rate"
                    type="number"
                    value={inviteHourlyRate}
                    onChange={(e) => setInviteHourlyRate(Number(e.target.value))}
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
                  <Button onClick={handleCreateInvite} disabled={createInviteMutation.isPending} className="flex-1">
                    {createInviteMutation.isPending ? t("common.loading") : t("people.invite.send")}
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
              <Button onClick={() => setShowInviteForm(true)} className="w-full">
                {t("people.invite_button")}
              </Button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
