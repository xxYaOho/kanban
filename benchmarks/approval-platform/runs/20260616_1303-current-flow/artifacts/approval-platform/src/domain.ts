export type Role = "requester" | "approver" | "owner";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  role: Role;
}

export interface ApprovalRequest {
  id: string;
  title: string;
  requesterId: string;
  status: ApprovalStatus;
}

export type AuditAction = "approve" | "reject" | "reopen";

export interface AuditEntry {
  requestId: string;
  actorId: string;
  action: AuditAction;
  previousStatus: ApprovalStatus;
  nextStatus: ApprovalStatus;
  createdAt: string;
}

export interface ApprovalStore {
  requests: Map<string, ApprovalRequest>;
  auditLog: AuditEntry[];
}

export function createStore(requests: ApprovalRequest[] = []): ApprovalStore {
  return {
    requests: new Map(requests.map((request) => [request.id, { ...request }])),
    auditLog: [],
  };
}
