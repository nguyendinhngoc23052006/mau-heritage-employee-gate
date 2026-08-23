import type { JSX } from "react";
import type { MemberWithProfile } from "../../services/members";
import { Button } from "../ui/Button";

interface EmployeeRowActionsProps {
  member: MemberWithProfile;
  onEditRate: (userId: string) => void;
  onDeactivate: (userId: string, displayName: string) => void;
  onIssuePrizeFine: (userId: string) => void;
  isEditRateLoading?: boolean;
  isDeactivateLoading?: boolean;
  isLastOwner?: boolean;
  isSelf?: boolean;
}

export function EmployeeRowActions({
  member,
  onEditRate,
  onDeactivate,
  onIssuePrizeFine,
  isEditRateLoading = false,
  isDeactivateLoading = false,
  isLastOwner = false,
  isSelf = false,
}: EmployeeRowActionsProps): JSX.Element {
  const displayName =
    member.profile?.display_name ||
    member.user_id?.substring(0, 8) ||
    "—";

  return (
    <div className="flex gap-2">
      <Button
        onClick={() => onEditRate(member.user_id)}
        disabled={isEditRateLoading}
        className="text-xs"
      >
        Edit Rate
      </Button>
      <Button
        onClick={() => onIssuePrizeFine(member.user_id)}
        className="text-xs"
      >
        Issue Prize/Fine
      </Button>
      <div title={isLastOwner ? "Cannot deactivate the last owner" : undefined}>
        <Button
          variant="danger"
          onClick={() => onDeactivate(member.user_id, displayName)}
          disabled={
            isDeactivateLoading || isLastOwner || isSelf
          }
          className="text-xs"
        >
          Deactivate
        </Button>
      </div>
    </div>
  );
}
