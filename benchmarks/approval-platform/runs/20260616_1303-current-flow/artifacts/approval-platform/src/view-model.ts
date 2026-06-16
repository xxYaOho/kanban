import type { ApprovalRequest, User } from "./domain";
import { getPermissions } from "./service";

export interface ApprovalDetailView {
  id: string;
  title: string;
  statusLabel: "Pending" | "Approved" | "Rejected";
  actions: {
    approveDisabled: boolean;
    rejectDisabled: boolean;
    reopenDisabled: boolean;
  };
}

const statusLabel = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export function toApprovalDetailView(request: ApprovalRequest, actor: User): ApprovalDetailView {
  const permissions = getPermissions(request, actor);
  return {
    id: request.id,
    title: request.title,
    statusLabel: statusLabel[request.status],
    actions: {
      approveDisabled: !permissions.canApprove,
      rejectDisabled: !permissions.canReject,
      reopenDisabled: !permissions.canReopen,
    },
  };
}
