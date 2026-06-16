import { describe, expect, test } from "bun:test";
import { createStore, type ApprovalRequest, type User } from "../src/domain";
import { ApprovalError, approveRequest, rejectRequest, reopenRequest } from "../src/service";
import { toApprovalDetailView } from "../src/view-model";

const requester: User = { id: "u-requester", role: "requester" };
const approver: User = { id: "u-approver", role: "approver" };
const owner: User = { id: "u-owner", role: "owner" };

function pendingRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "req-1",
    title: "Purchase approval",
    requesterId: requester.id,
    status: "pending",
    ...overrides,
  };
}

describe("approval service", () => {
  test("approver can approve a pending request and audit includes actor and previous state", () => {
    const store = createStore([pendingRequest()]);

    const result = approveRequest(store, approver, "req-1");

    expect(result.status).toBe("approved");
    expect(store.auditLog).toHaveLength(1);
    expect(store.auditLog[0]).toMatchObject({
      requestId: "req-1",
      actorId: approver.id,
      action: "approve",
      previousStatus: "pending",
      nextStatus: "approved",
    });
  });

  test("requester cannot approve own request", () => {
    const store = createStore([pendingRequest()]);

    expect(() => approveRequest(store, requester, "req-1")).toThrow(ApprovalError);
    expect(store.requests.get("req-1")?.status).toBe("pending");
    expect(store.auditLog).toHaveLength(0);
  });

  test("owner can reopen rejected request", () => {
    const store = createStore([pendingRequest({ status: "rejected" })]);

    const result = reopenRequest(store, owner, "req-1");

    expect(result.status).toBe("pending");
    expect(store.auditLog[0]).toMatchObject({
      actorId: owner.id,
      action: "reopen",
      previousStatus: "rejected",
      nextStatus: "pending",
    });
  });

  test("owner cannot reopen pending request", () => {
    const store = createStore([pendingRequest()]);

    expect(() => reopenRequest(store, owner, "req-1")).toThrow(ApprovalError);
    expect(store.requests.get("req-1")?.status).toBe("pending");
    expect(store.auditLog).toHaveLength(0);
  });

  test("approved request cannot be rejected afterwards", () => {
    const store = createStore([pendingRequest()]);
    approveRequest(store, approver, "req-1");

    expect(() => rejectRequest(store, approver, "req-1")).toThrow(ApprovalError);
    expect(store.requests.get("req-1")?.status).toBe("approved");
    expect(store.auditLog).toHaveLength(1);
  });
});

describe("approval detail view model", () => {
  test("requester sees approve and reject disabled", () => {
    const view = toApprovalDetailView(pendingRequest(), requester);

    expect(view.actions.approveDisabled).toBe(true);
    expect(view.actions.rejectDisabled).toBe(true);
    expect(view.actions.reopenDisabled).toBe(true);
  });

  test("approver sees approve and reject enabled for pending request", () => {
    const view = toApprovalDetailView(pendingRequest(), approver);

    expect(view.actions.approveDisabled).toBe(false);
    expect(view.actions.rejectDisabled).toBe(false);
    expect(view.actions.reopenDisabled).toBe(true);
  });

  test("owner sees reopen enabled only for rejected request", () => {
    const pendingView = toApprovalDetailView(pendingRequest(), owner);
    const rejectedView = toApprovalDetailView(pendingRequest({ status: "rejected" }), owner);

    expect(pendingView.actions.reopenDisabled).toBe(true);
    expect(rejectedView.actions.reopenDisabled).toBe(false);
    expect(rejectedView.actions.approveDisabled).toBe(true);
    expect(rejectedView.actions.rejectDisabled).toBe(true);
  });
});
