import type { ApprovalRequest, ApprovalStatus, ApprovalStore, AuditAction, User } from "./domain";

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "invalid_transition",
  ) {
    super(message);
  }
}

function requireRequest(store: ApprovalStore, requestId: string): ApprovalRequest {
  const request = store.requests.get(requestId);
  if (!request) throw new ApprovalError(`Request ${requestId} not found`, "not_found");
  return request;
}

function canApproveOrReject(user: User, request: ApprovalRequest): boolean {
  return user.role === "approver" && user.id !== request.requesterId && request.status === "pending";
}

function canReopen(user: User, request: ApprovalRequest): boolean {
  return user.role === "owner" && request.status === "rejected";
}

function recordAudit(
  store: ApprovalStore,
  request: ApprovalRequest,
  actor: User,
  action: AuditAction,
  previousStatus: ApprovalStatus,
  nextStatus: ApprovalStatus,
): void {
  store.auditLog.push({
    requestId: request.id,
    actorId: actor.id,
    action,
    previousStatus,
    nextStatus,
    createdAt: new Date().toISOString(),
  });
}

function transition(
  store: ApprovalStore,
  actor: User,
  requestId: string,
  action: AuditAction,
  nextStatus: ApprovalStatus,
): ApprovalRequest {
  const request = requireRequest(store, requestId);
  const allowed = action === "reopen" ? canReopen(actor, request) : canApproveOrReject(actor, request);
  if (!allowed) {
    const code = request.status === "pending" ? "forbidden" : "invalid_transition";
    throw new ApprovalError(`${actor.role} cannot ${action} request ${request.id}`, code);
  }

  const previousStatus = request.status;
  request.status = nextStatus;
  recordAudit(store, request, actor, action, previousStatus, nextStatus);
  return { ...request };
}

export function approveRequest(store: ApprovalStore, actor: User, requestId: string): ApprovalRequest {
  return transition(store, actor, requestId, "approve", "approved");
}

export function rejectRequest(store: ApprovalStore, actor: User, requestId: string): ApprovalRequest {
  return transition(store, actor, requestId, "reject", "rejected");
}

export function reopenRequest(store: ApprovalStore, actor: User, requestId: string): ApprovalRequest {
  return transition(store, actor, requestId, "reopen", "pending");
}

export function getPermissions(request: ApprovalRequest, actor: User) {
  return {
    canApprove: canApproveOrReject(actor, request),
    canReject: canApproveOrReject(actor, request),
    canReopen: canReopen(actor, request),
  };
}
