import assert from "node:assert";
import test from "node:test";
import { ProxmoxHttpError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import { ClusterOrchestrationHelper } from "../../src/helpers/cluster_orchestration_helper";

class FakeClusterService {
  public node_ids: string[] = ["node-a", "node-b"];
  public storage_nodes = new Map<string, { compatible: boolean; reason: string }>();
  public bridge_nodes = new Map<string, { compatible: boolean; reason: string }>();

  public async listNodes() {
    return {
      success: true,
      status_code: 200,
      data: this.node_ids.map((node_id) => ({ node: node_id })),
    };
  }

  public async checkStorageCompatibility(params: {
    node_ids: string[];
    required_content: "rootdir" | "images";
    storage_id?: string;
  }) {
    return {
      success: true,
      status_code: 200,
      data: {
        required_content: params.required_content,
        storage_id: params.storage_id,
        checked_node_count: params.node_ids.length,
        compatible_nodes: params.node_ids.filter((node_id) => this.storage_nodes.get(node_id)?.compatible === true),
        incompatible_nodes: params.node_ids.filter((node_id) => this.storage_nodes.get(node_id)?.compatible !== true),
        nodes: params.node_ids.map((node_id) => ({
          node_id,
          compatible: this.storage_nodes.get(node_id)?.compatible === true,
          reason: this.storage_nodes.get(node_id)?.reason ?? "storage_not_found",
          required_content: params.required_content,
          storage_id: params.storage_id,
          matching_storage_ids: [],
          checked_storage_ids: [],
          raw_storage_records: [],
        })),
      },
    };
  }

  public async checkBridgeCompatibility(params: {
    node_ids: string[];
    bridge: string;
  }) {
    return {
      success: true,
      status_code: 200,
      data: {
        bridge: params.bridge,
        checked_node_count: params.node_ids.length,
        compatible_nodes: params.node_ids.filter((node_id) => this.bridge_nodes.get(node_id)?.compatible === true),
        incompatible_nodes: params.node_ids.filter((node_id) => this.bridge_nodes.get(node_id)?.compatible !== true),
        nodes: params.node_ids.map((node_id) => ({
          node_id,
          bridge: params.bridge,
          compatible: this.bridge_nodes.get(node_id)?.compatible === true,
          reason: this.bridge_nodes.get(node_id)?.reason ?? "bridge_not_found",
          bridge_found: this.bridge_nodes.get(node_id)?.compatible === true,
          is_bridge: this.bridge_nodes.get(node_id)?.compatible === true,
        })),
      },
    };
  }
}

class FakeNodeService {
  public cores_by_node = new Map<string, { allowed: boolean; available_cores?: number; reason: string }>();
  public memory_by_node = new Map<string, { allowed: boolean; available_memory_bytes?: number; reason: string }>();

  public async canAllocateCores(params: {
    node_id: string;
    requested_cores: number;
    mode?: "logical" | "physical";
  }) {
    const record = this.cores_by_node.get(params.node_id) ?? {
      allowed: true,
      available_cores: params.requested_cores + 1,
      reason: "within_limit",
    };
    return {
      success: true,
      status_code: 200,
      data: {
        node_id: params.node_id,
        mode: params.mode ?? "logical",
        requested_cores: params.requested_cores,
        available_cores: record.available_cores,
        allowed: record.allowed,
        reason: record.reason as "within_limit" | "exceeds_limit" | "capacity_unknown",
      },
    };
  }

  public async canAllocateMemory(params: {
    node_id: string;
    requested_memory_bytes: number;
    mode?: "free_headroom" | "allocated_headroom";
  }) {
    const record = this.memory_by_node.get(params.node_id) ?? {
      allowed: true,
      available_memory_bytes: params.requested_memory_bytes + 1024,
      reason: "within_limit",
    };
    return {
      success: true,
      status_code: 200,
      data: {
        node_id: params.node_id,
        mode: params.mode ?? "free_headroom",
        requested_memory_bytes: params.requested_memory_bytes,
        available_memory_bytes: record.available_memory_bytes,
        allowed: record.allowed,
        reason: record.reason as "within_limit" | "exceeds_limit" | "capacity_unknown",
      },
    };
  }
}

class FakeDatacenterService {
  public records_by_node = new Map<string, unknown[]>();

  public async listStorage(params?: { node?: string }) {
    if (params?.node !== undefined) {
      return {
        success: true,
        status_code: 200,
        data: (this.records_by_node.get(params.node) ?? []) as any,
      };
    }
    const all_records: unknown[] = [];
    for (const records of this.records_by_node.values()) {
      all_records.push(...records);
    }
    return {
      success: true,
      status_code: 200,
      data: all_records as any,
    };
  }
}

class FakeAccessService {
  public allowed = new Map<string, boolean>();

  public async hasCurrentPrivilege(params: {
    path: string;
    privilege: string;
  }) {
    const key = `${params.path}::${params.privilege}`;
    return {
      success: true,
      status_code: 200,
      data: {
        allowed: this.allowed.get(key) === true,
      },
    };
  }
}

class FakeLxcService {
  public error_to_throw?: Error;
  public last_migrate_call?: Record<string, unknown>;

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
    this.last_migrate_call = params;
    if (this.error_to_throw !== undefined) {
      throw this.error_to_throw;
    }
    return {
      resource_type: "lxc" as const,
      node_id: params.node_id,
      resource_id: String(params.container_id),
      task_id: "UPID:lxc:migrate",
      operation: "migrate" as const,
    };
  }
}

class FakeVmService {
  public error_to_throw?: Error;
  public last_migrate_call?: Record<string, unknown>;

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
    this.last_migrate_call = params;
    if (this.error_to_throw !== undefined) {
      throw this.error_to_throw;
    }
    return {
      resource_type: "qemu" as const,
      node_id: params.node_id,
      resource_id: String(params.vm_id),
      task_id: "UPID:vm:migrate",
      operation: "migrate" as const,
    };
  }
}

function BuildHelper() {
  const cluster_service = new FakeClusterService();
  const node_service = new FakeNodeService();
  const datacenter_service = new FakeDatacenterService();
  const access_service = new FakeAccessService();
  const lxc_service = new FakeLxcService();
  const vm_service = new FakeVmService();
  return {
    helper: new ClusterOrchestrationHelper({
      cluster_service: cluster_service as any,
      node_service: node_service as any,
      datacenter_service: datacenter_service as any,
      access_service: access_service as any,
      lxc_service: lxc_service as any,
      vm_service: vm_service as any,
    }),
    cluster_service,
    node_service,
    datacenter_service,
    access_service,
    lxc_service,
    vm_service,
  };
}

function AllowPlannerPermissions(access_service: FakeAccessService): void {
  access_service.allowed.set("/vms::VM.Allocate", true);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);
  access_service.allowed.set("/storage/local::Datastore.AllocateTemplate", true);
}

test("ClusterOrchestrationHelper planLxcPlacement ranks compatible node highest.", async () => {
  const { helper, cluster_service, node_service, datacenter_service, access_service } = BuildHelper();
  cluster_service.storage_nodes.set("node-a", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.storage_nodes.set("node-b", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.bridge_nodes.set("node-a", { compatible: true, reason: "bridge_found" });
  cluster_service.bridge_nodes.set("node-b", { compatible: false, reason: "bridge_not_found" });
  datacenter_service.records_by_node.set("node-a", [{ storage: "local", content: ["vztmpl"] }]);
  datacenter_service.records_by_node.set("node-b", [{ storage: "local", content: ["vztmpl"] }]);
  node_service.cores_by_node.set("node-a", { allowed: true, available_cores: 8, reason: "within_limit" });
  node_service.cores_by_node.set("node-b", { allowed: true, available_cores: 4, reason: "within_limit" });
  node_service.memory_by_node.set("node-a", { allowed: true, available_memory_bytes: 8 * 1024 * 1024 * 1024, reason: "within_limit" });
  node_service.memory_by_node.set("node-b", { allowed: true, available_memory_bytes: 4 * 1024 * 1024 * 1024, reason: "within_limit" });
  AllowPlannerPermissions(access_service);

  const response = await helper.planLxcPlacement({
    required_storage_id: "local-lvm",
    template_storage_id: "local",
    required_bridge: "vmbr0",
    requested_cores: 2,
    requested_memory_bytes: 512 * 1024 * 1024,
    candidate_node_ids: ["node-a", "node-b"],
    scoring_mode: "balanced",
  });

  assert.equal(response.data.checked_node_count, 2);
  assert.equal(response.data.allowed_node_count, 1);
  assert.equal(response.data.recommended_node_id, "node-a");
  assert.equal(response.data.candidates[0].node_id, "node-a");
  assert.equal(response.data.candidates[0].allowed, true);
  assert.equal(response.data.candidates[1].allowed, false);
});

test("ClusterOrchestrationHelper planVmPlacement enforces strict permission checks when enabled.", async () => {
  const { helper, cluster_service, access_service } = BuildHelper();
  cluster_service.storage_nodes.set("node-a", { compatible: true, reason: "storage_supports_required_content" });
  access_service.allowed.set("/vms::VM.Allocate", false);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);

  const response = await helper.planVmPlacement({
    required_storage_id: "local-lvm",
    candidate_node_ids: ["node-a"],
    strict_permissions: true,
    scoring_mode: "strict",
  });

  assert.equal(response.data.allowed_node_count, 0);
  assert.equal(response.data.candidates[0].allowed, false);
});

test("ClusterOrchestrationHelper migrateLxcWithPreflight performs preflight and returns task metadata.", async () => {
  const { helper, cluster_service, access_service, lxc_service } = BuildHelper();
  cluster_service.storage_nodes.set("node-b", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.bridge_nodes.set("node-b", { compatible: true, reason: "bridge_found" });
  access_service.allowed.set("/vms::VM.Allocate", true);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);
  access_service.allowed.set("/vms/200::VM.Migrate", true);

  const response = await helper.migrateLxcWithPreflight({
    node_id: "node-a",
    container_id: 200,
    target_node_id: "node-b",
    required_storage_id: "local-lvm",
    required_bridge: "vmbr0",
    wait_for_task: false,
  });

  assert.equal(response.data.preflight.allowed, true);
  assert.equal(response.data.migration_task?.task_id, "UPID:lxc:migrate");
  assert.equal(lxc_service.last_migrate_call?.target_node_id, "node-b");
});

test("ClusterOrchestrationHelper migrateVmWithPreflight fails when preflight rejects target.", async () => {
  const { helper, cluster_service, access_service } = BuildHelper();
  cluster_service.storage_nodes.set("node-b", { compatible: false, reason: "storage_missing_required_content" });
  access_service.allowed.set("/vms::VM.Allocate", true);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);
  access_service.allowed.set("/vms/9000::VM.Migrate", true);

  await assert.rejects(
    async () => helper.migrateVmWithPreflight({
      node_id: "node-a",
      vm_id: 9000,
      target_node_id: "node-b",
      required_storage_id: "local-lvm",
      wait_for_task: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "target_node_id");
      return true;
    },
  );
});

test("ClusterOrchestrationHelper migration propagates service migration failures.", async () => {
  const { helper, cluster_service, access_service, lxc_service } = BuildHelper();
  cluster_service.storage_nodes.set("node-b", { compatible: true, reason: "storage_supports_required_content" });
  access_service.allowed.set("/vms::VM.Allocate", true);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);
  access_service.allowed.set("/vms/200::VM.Migrate", true);
  lxc_service.error_to_throw = new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "migration failed",
    status_code: 500,
  });

  await assert.rejects(
    async () => helper.migrateLxcWithPreflight({
      node_id: "node-a",
      container_id: 200,
      target_node_id: "node-b",
      required_storage_id: "local-lvm",
      wait_for_task: false,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxHttpError);
      assert.equal(error.status_code, 500);
      return true;
    },
  );
});

test("ClusterOrchestrationHelper validates planner input fields.", async () => {
  const { helper } = BuildHelper();

  await assert.rejects(
    async () => helper.planLxcPlacement({
      required_storage_id: " ",
      candidate_node_ids: ["node-a"],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "required_storage_id");
      return true;
    },
  );
});
