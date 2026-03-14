import assert from "node:assert";
import test from "node:test";
import { ProxmoxHttpError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import { NodeMaintenanceHelper } from "../../src/helpers/node_maintenance_helper";

class FakeClusterService {
  public node_ids = ["node-a", "node-b", "node-c"];

  public async listNodes() {
    return {
      success: true,
      status_code: 200,
      data: this.node_ids.map((node_id) => ({
        node: node_id,
      })),
    };
  }
}

class FakeDatacenterService {
  public async listStorage(_params?: { node?: string }) {
    return {
      success: true,
      status_code: 200,
      data: [
        {
          storage: "local-lvm",
          content: "rootdir,images",
          enabled: 1,
          shared: 0,
        },
        {
          storage: "local",
          content: "backup,iso,vztmpl",
          enabled: 1,
          shared: 0,
        },
      ],
    };
  }
}

class FakeVmService {
  public migrate_calls: Record<string, unknown>[] = [];
  public migrate_error?: Error;

  public async listVms(_params?: { node_id?: string }) {
    return {
      success: true,
      status_code: 200,
      data: [
        {
          vmid: 101,
          name: "vm-101",
          status: "running",
          cpus: 2,
          maxmem: 1024 * 1024 * 1024,
        },
      ],
    };
  }

  public async migrateVm(params: {
    node_id: string;
    vm_id: string | number;
    target_node_id: string;
    online?: boolean;
    force?: boolean;
    wait_for_task?: boolean;
    timeout_ms?: number;
    retry_allowed?: boolean;
  }) {
    this.migrate_calls.push(params);
    if (this.migrate_error !== undefined) {
      throw this.migrate_error;
    }
    return {
      resource_type: "qemu" as const,
      resource_id: String(params.vm_id),
      node_id: params.node_id,
      task_id: "UPID:vm:migrate:1",
      operation: "migrate" as const,
    };
  }
}

class FakeLxcService {
  public migrate_calls: Record<string, unknown>[] = [];
  public migrate_error?: Error;

  public async listContainers(_params?: { node_id?: string }) {
    return {
      success: true,
      status_code: 200,
      data: [
        {
          vmid: 201,
          name: "lxc-201",
          status: "running",
          cpus: 1,
          maxmem: 512 * 1024 * 1024,
        },
      ],
    };
  }

  public async migrateContainer(params: {
    node_id: string;
    container_id: string | number;
    target_node_id: string;
    restart?: boolean;
    migrate_volumes?: boolean;
    wait_for_task?: boolean;
    timeout_ms?: number;
    retry_allowed?: boolean;
  }) {
    this.migrate_calls.push(params);
    if (this.migrate_error !== undefined) {
      throw this.migrate_error;
    }
    return {
      resource_type: "lxc" as const,
      resource_id: String(params.container_id),
      node_id: params.node_id,
      task_id: "UPID:lxc:migrate:1",
      operation: "migrate" as const,
    };
  }
}

class FakeNodeService {
  public reboot_calls: Record<string, unknown>[] = [];

  public async rebootNode(params: {
    node_id: string;
    wait_for_task?: boolean;
    timeout_ms?: number;
    force?: boolean;
  }) {
    this.reboot_calls.push(params);
    return {
      task_id: "UPID:node:reboot:1",
      operation: "reboot",
      resource_id: params.node_id,
      resource_type: "node",
      node_id: params.node_id,
    };
  }
}

class FakeClusterOrchestrationHelper {
  public vm_plan_calls: Record<string, unknown>[] = [];
  public lxc_plan_calls: Record<string, unknown>[] = [];

  public async planVmPlacement(params: {
    required_storage_id: string;
    required_bridge?: string;
    requested_cores?: number;
    requested_memory_bytes?: number;
    candidate_node_ids?: string[];
    scoring_mode?: "balanced" | "capacity_first" | "strict";
    strict_permissions?: boolean;
  }) {
    this.vm_plan_calls.push(params);
    const target_node = params.candidate_node_ids?.[0] ?? "node-b";
    return {
      success: true,
      status_code: 200,
      data: {
        resource_type: "qemu" as const,
        scoring_mode: params.scoring_mode ?? "balanced",
        strict_permissions: params.strict_permissions === true,
        required_storage_id: params.required_storage_id,
        required_storage_content: "images" as const,
        required_bridge: params.required_bridge,
        checked_node_count: params.candidate_node_ids?.length ?? 1,
        allowed_node_count: 1,
        denied_node_count: 0,
        recommended_node_id: target_node,
        candidates: [
          {
            node_id: target_node,
            allowed: true,
            score: 95,
            failed_required_checks: 0,
            checks: [],
            metrics: {},
            evidence: {
              evaluated_at_iso: "2026-01-01T00:00:00.000Z",
            },
          },
        ],
      },
    };
  }

  public async planLxcPlacement(params: {
    required_storage_id: string;
    required_bridge?: string;
    requested_cores?: number;
    requested_memory_bytes?: number;
    candidate_node_ids?: string[];
    scoring_mode?: "balanced" | "capacity_first" | "strict";
    strict_permissions?: boolean;
  }) {
    this.lxc_plan_calls.push(params);
    const target_node = params.candidate_node_ids?.[0] ?? "node-b";
    return {
      success: true,
      status_code: 200,
      data: {
        resource_type: "lxc" as const,
        scoring_mode: params.scoring_mode ?? "balanced",
        strict_permissions: params.strict_permissions === true,
        required_storage_id: params.required_storage_id,
        required_storage_content: "rootdir" as const,
        required_bridge: params.required_bridge,
        checked_node_count: params.candidate_node_ids?.length ?? 1,
        allowed_node_count: 1,
        denied_node_count: 0,
        recommended_node_id: target_node,
        candidates: [
          {
            node_id: target_node,
            allowed: true,
            score: 93,
            failed_required_checks: 0,
            checks: [],
            metrics: {},
            evidence: {
              evaluated_at_iso: "2026-01-01T00:00:00.000Z",
            },
          },
        ],
      },
    };
  }
}

function BuildHelper(): {
  helper: NodeMaintenanceHelper;
  vm_service: FakeVmService;
  lxc_service: FakeLxcService;
  node_service: FakeNodeService;
  orchestration_helper: FakeClusterOrchestrationHelper;
} {
  const vm_service = new FakeVmService();
  const lxc_service = new FakeLxcService();
  const node_service = new FakeNodeService();
  const orchestration_helper = new FakeClusterOrchestrationHelper();
  const helper = new NodeMaintenanceHelper({
    cluster_service: new FakeClusterService() as any,
    datacenter_service: new FakeDatacenterService() as any,
    vm_service: vm_service as any,
    lxc_service: lxc_service as any,
    node_service: node_service as any,
    cluster_orchestration_helper: orchestration_helper as any,
  });

  return {
    helper,
    vm_service,
    lxc_service,
    node_service,
    orchestration_helper,
  };
}

test("NodeMaintenanceHelper prepareNodeMaintenance builds migration plan from source resources.", async () => {
  const { helper, orchestration_helper } = BuildHelper();

  const response = await helper.prepareNodeMaintenance({
    node_id: "node-a",
    target_node_ids: ["node-b", "node-c"],
    include_stopped: false,
    scoring_mode: "balanced",
  });

  assert.equal(response.status_code, 200);
  assert.equal(response.data.source_node_id, "node-a");
  assert.equal(response.data.selected_resource_count, 2);
  assert.equal(response.data.migration_candidate_count, 2);
  assert.equal(response.data.blocked_resource_count, 0);
  assert.equal(response.data.resources.every((resource) => resource.selected_for_drain), true);
  assert.equal(response.data.resources.every((resource) => resource.target_node_id === "node-b"), true);
  assert.equal(orchestration_helper.vm_plan_calls.length, 1);
  assert.equal(orchestration_helper.lxc_plan_calls.length, 1);
});

test("NodeMaintenanceHelper drainNode returns dry-run plan without mutating.", async () => {
  const { helper, vm_service, lxc_service, node_service } = BuildHelper();

  const response = await helper.drainNode({
    node_id: "node-a",
    target_node_ids: ["node-b"],
  });

  assert.equal(response.data.dry_run, true);
  assert.equal(response.data.summary.requested, 2);
  assert.equal(response.data.summary.attempted, 0);
  assert.equal(response.data.summary.skipped, 2);
  assert.equal(response.data.migrations.every((migration) => migration.submitted === false), true);
  assert.equal(vm_service.migrate_calls.length, 0);
  assert.equal(lxc_service.migrate_calls.length, 0);
  assert.equal(node_service.reboot_calls.length, 0);
});

test("NodeMaintenanceHelper drainNode handles partial migration failures with sanitized records.", async () => {
  const { helper, vm_service, lxc_service } = BuildHelper();
  lxc_service.migrate_error = new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "lxc migration failed",
    status_code: 500,
    details: {
      path: "/api2/json/nodes/node-a/lxc/201/migrate",
    },
    cause: {
      token: "must-not-leak",
    },
  });

  const response = await helper.drainNode({
    node_id: "node-a",
    target_node_ids: ["node-b"],
    dry_run: false,
    fail_fast: false,
    max_parallel_migrations: 1,
    wait_for_tasks: true,
  });

  assert.equal(response.status_code, 207);
  assert.equal(response.data.summary.attempted, 2);
  assert.equal(response.data.summary.succeeded, 1);
  assert.equal(response.data.summary.failed, 1);
  assert.equal(vm_service.migrate_calls.length, 1);
  assert.equal(lxc_service.migrate_calls.length, 1);

  const failed_migration = response.data.migrations.find((migration) => !migration.success);
  assert.ok(failed_migration !== undefined);
  assert.equal(failed_migration?.error?.code, "proxmox.http.server_error");
  assert.equal(failed_migration?.error?.message.includes("must-not-leak"), false);
});

test("NodeMaintenanceHelper drainNode supports fail-fast with skipped remaining migrations.", async () => {
  const { helper, vm_service, lxc_service } = BuildHelper();
  vm_service.migrate_error = new Error("vm migration fail");

  const response = await helper.drainNode({
    node_id: "node-a",
    target_node_ids: ["node-b"],
    dry_run: false,
    fail_fast: true,
    max_parallel_migrations: 1,
  });

  assert.equal(response.status_code, 207);
  assert.equal(response.data.summary.attempted, 1);
  assert.equal(response.data.summary.failed, 1);
  assert.equal(response.data.summary.skipped, 1);
  assert.equal(vm_service.migrate_calls.length, 1);
  assert.equal(lxc_service.migrate_calls.length, 0);
  assert.equal(
    response.data.migrations.some(
      (migration) => migration.submitted === false && migration.error?.field === "fail_fast",
    ),
    true,
  );
});

test("NodeMaintenanceHelper validates reboot guardrails and input fields.", async () => {
  const { helper } = BuildHelper();

  await assert.rejects(
    async () => helper.drainNode({
      node_id: "node-a",
      reboot_after_drain: true,
      allow_reboot: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "allow_reboot");
      return true;
    },
  );

  await assert.rejects(
    async () => helper.prepareNodeMaintenance({
      node_id: "bad node id",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "node_id");
      return true;
    },
  );
});
