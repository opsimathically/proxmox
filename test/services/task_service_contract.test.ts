import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import {
  ProxmoxTimeoutError,
  ProxmoxValidationError,
} from "../../src/errors/proxmox_error";
import { TaskService } from "../../src/services/task_service";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";

class FakeAuthProvider {
  public async getAuthHeader(): Promise<string> {
    return "PVEAPIToken root@pam!builder=token-value";
  }

  public async getTokenFingerprint(): Promise<string> {
    return "fingerprint";
  }
}

class FakeRequestClient implements proxmox_request_client_i {
  public resolveNode(node_id?: string): proxmox_node_connection_i {
    return {
      node_id: node_id ?? "node-a",
      host: "pve-a",
      protocol: "https",
      verify_tls: true,
      auth_provider: new FakeAuthProvider(),
    };
  }

  public async request<T>(_params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    return {
      success: true,
      status_code: 200,
      data: {} as T,
    };
  }
}

type fake_task_behavior_t = {
  kind: "success";
  status: "running" | "stopped" | "ok" | "error" | "unknown";
  exit_status?: "OK" | "ERROR";
  percent?: number;
  message?: string;
} | {
  kind: "error";
  error: Error;
};

class FakeTaskPoller {
  public calls: Array<{ node: string; task_id: string }> = [];
  public behavior_by_task = new Map<string, fake_task_behavior_t>();

  public async waitForTaskCompletion(params: {
    node: string;
    task_id: string;
  }): Promise<{
    task_id: string;
    node: string;
    status: "running" | "stopped" | "ok" | "error" | "unknown";
    exit_status?: "OK" | "ERROR";
    percent?: number;
    message?: string;
    raw?: unknown;
  }> {
    this.calls.push({
      node: params.node,
      task_id: params.task_id,
    });
    const behavior = this.behavior_by_task.get(`${params.node}::${params.task_id}`);
    if (behavior === undefined || behavior.kind === "success") {
      return {
        task_id: params.task_id,
        node: params.node,
        status: behavior?.status ?? "ok",
        exit_status: behavior?.exit_status ?? "OK",
        percent: behavior?.percent,
        message: behavior?.message,
        raw: {
          source: "fake",
        },
      };
    }
    throw behavior.error;
  }
}

test("TaskService waitForTasks aggregates successful records.", async () => {
  const task_poller = new FakeTaskPoller();
  const service = new TaskService({
    request_client: new FakeRequestClient(),
    task_poller: task_poller as unknown as any,
  });

  task_poller.behavior_by_task.set("node-a::UPID:1", {
    kind: "success",
    status: "ok",
    exit_status: "OK",
    percent: 100,
  });
  task_poller.behavior_by_task.set("node-b::UPID:2", {
    kind: "success",
    status: "stopped",
    exit_status: "OK",
  });

  const response = await service.waitForTasks({
    tasks: [
      {
        node_id: "node-a",
        task_id: "UPID:1",
      },
      {
        node_id: "node-b",
        task_id: "UPID:2",
      },
    ],
    max_parallel_tasks: 2,
  });

  assert.equal(response.status_code, 200);
  assert.equal(response.data.summary.requested, 2);
  assert.equal(response.data.summary.completed, 2);
  assert.equal(response.data.summary.failed, 0);
  assert.equal(response.data.summary.succeeded, 2);
  assert.equal(response.data.summary.pending, 0);
  assert.equal(task_poller.calls.length, 2);
});

test("TaskService waitForTasks captures timeout failures in collect-all mode.", async () => {
  const task_poller = new FakeTaskPoller();
  const service = new TaskService({
    request_client: new FakeRequestClient(),
    task_poller: task_poller as unknown as any,
  });

  task_poller.behavior_by_task.set("node-a::UPID:1", {
    kind: "error",
    error: new ProxmoxTimeoutError({
      code: "proxmox.transport.timeout",
      message: "Timed out waiting for task.",
      details: {
        field: "task.poll.timeout",
      },
    }),
  });

  const response = await service.waitForTasks({
    tasks: [
      {
        node_id: "node-a",
        task_id: "UPID:1",
      },
      {
        node_id: "node-b",
        task_id: "UPID:2",
      },
    ],
    fail_fast: false,
    max_parallel_tasks: 1,
  });

  assert.equal(response.status_code, 200);
  assert.equal(response.data.summary.requested, 2);
  assert.equal(response.data.summary.failed, 1);
  assert.equal(response.data.summary.succeeded, 1);

  const failed_record = response.data.tasks.find((record) => record.task_id === "UPID:1");
  assert.ok(failed_record !== undefined);
  assert.equal(failed_record?.error?.code, "proxmox.transport.timeout");
});

test("TaskService waitForTasks applies fail-fast and marks remaining tasks as skipped.", async () => {
  const task_poller = new FakeTaskPoller();
  const service = new TaskService({
    request_client: new FakeRequestClient(),
    task_poller: task_poller as unknown as any,
  });

  task_poller.behavior_by_task.set("node-a::UPID:1", {
    kind: "error",
    error: new Error("intentional failure"),
  });

  const response = await service.waitForTasks({
    tasks: [
      {
        node_id: "node-a",
        task_id: "UPID:1",
      },
      {
        node_id: "node-b",
        task_id: "UPID:2",
      },
      {
        node_id: "node-c",
        task_id: "UPID:3",
      },
    ],
    fail_fast: true,
    max_parallel_tasks: 1,
  });

  assert.equal(response.status_code, 207);
  assert.equal(response.data.summary.requested, 3);
  assert.equal(response.data.summary.completed, 1);
  assert.equal(response.data.summary.pending, 2);

  const skipped_records = response.data.tasks.filter(
    (record) => record.completed === false && record.error?.field === "fail_fast",
  );
  assert.equal(skipped_records.length, 2);
  assert.equal(task_poller.calls.length, 1);
});

test("TaskService validates task polling availability and max_parallel_tasks bounds.", async () => {
  const no_poller_service = new TaskService({
    request_client: new FakeRequestClient(),
  });

  await assert.rejects(
    async () => no_poller_service.waitForTasks({
      tasks: [
        {
          node_id: "node-a",
          task_id: "UPID:1",
        },
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "task_poller");
      return true;
    },
  );

  const service = new TaskService({
    request_client: new FakeRequestClient(),
    task_poller: new FakeTaskPoller() as unknown as any,
  });

  await assert.rejects(
    async () => service.waitForTasks({
      tasks: [
        {
          node_id: "node-a",
          task_id: "UPID:1",
        },
      ],
      max_parallel_tasks: 99,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "max_parallel_tasks");
      return true;
    },
  );
});
