import assert from "node:assert";
import test from "node:test";
import { ProxmoxAuthError, ProxmoxHttpError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import { LxcClusterPreflightHelper } from "../../src/helpers/lxc_cluster_preflight_helper";
import {
  proxmox_lxc_cluster_preflight_input_i,
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
} from "../../src/types/proxmox_service_types";

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
        compatible_nodes: params.node_ids.filter(
          (node_id) => this.storage_nodes.get(node_id)?.compatible === true,
        ),
        incompatible_nodes: params.node_ids.filter(
          (node_id) => this.storage_nodes.get(node_id)?.compatible !== true,
        ),
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
        compatible_nodes: params.node_ids.filter(
          (node_id) => this.bridge_nodes.get(node_id)?.compatible === true,
        ),
        incompatible_nodes: params.node_ids.filter(
          (node_id) => this.bridge_nodes.get(node_id)?.compatible !== true,
        ),
        nodes: params.node_ids.map((node_id) => ({
          node_id,
          bridge: params.bridge,
          compatible: this.bridge_nodes.get(node_id)?.compatible === true,
          reason: this.bridge_nodes.get(node_id)?.reason ?? "bridge_not_found",
          bridge_found: true,
          is_bridge: this.bridge_nodes.get(node_id)?.compatible === true,
        })),
      },
    };
  }
}

class FakeDatacenterService {
  public records_by_node = new Map<string, unknown[]>();
  public throw_for_node = new Map<string, Error>();

  public async listStorage(params?: { node?: string }) {
    const node_id = params?.node;
    if (node_id !== undefined) {
      const mapped_error = this.throw_for_node.get(node_id);
      if (mapped_error !== undefined) {
        throw mapped_error;
      }
      return {
        success: true,
        status_code: 200,
        data: (this.records_by_node.get(node_id) ?? []) as any,
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
  public error_to_throw?: Error;

  public async hasCurrentPrivilege(params: {
    path: string;
    privilege: string;
  }) {
    if (this.error_to_throw !== undefined) {
      throw this.error_to_throw;
    }
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

class FakeLxcHelper {
  public preflight_by_node = new Map<string, proxmox_lxc_helper_create_response_t["data"]["preflight"]>();

  public async createLxcContainer(
    params: proxmox_lxc_helper_create_input_i,
  ): Promise<proxmox_lxc_helper_create_response_t> {
    const node_id = params.general.node_id;
    const preflight = this.preflight_by_node.get(node_id) ?? {
      executed: true,
      enforce: false,
      failed_checks: 0,
      checks: [],
    };
    return {
      success: true,
      status_code: 200,
      data: {
        node_id,
        container_id: String(params.general.container_id),
        dry_run: true,
        config: {},
        preflight,
      },
    };
  }
}

function BuildCreateInput(): proxmox_lxc_helper_create_input_i {
  return {
    general: {
      node_id: "node-a",
      container_id: 9800,
      hostname: "cluster-preflight.local",
    },
    template: {
      storage: "local",
      template: "local:vztmpl/debian-12.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 8,
    },
    cpu: {
      cores: 2,
    },
    memory: {
      memory_mib: 1024,
    },
    network: {
      bridge: "vmbr0",
    },
  };
}

function BuildHelper() {
  const cluster_service = new FakeClusterService();
  const datacenter_service = new FakeDatacenterService();
  const access_service = new FakeAccessService();
  const lxc_helper = new FakeLxcHelper();
  return {
    helper: new LxcClusterPreflightHelper({
      cluster_service: cluster_service as any,
      datacenter_service: datacenter_service as any,
      access_service: access_service as any,
      lxc_helper: lxc_helper as any,
    }),
    cluster_service,
    datacenter_service,
    access_service,
    lxc_helper,
  };
}

function AllowAllPermissions(access_service: FakeAccessService): void {
  access_service.allowed.set("/vms::VM.Allocate", true);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);
  access_service.allowed.set("/storage/local::Datastore.AllocateTemplate", true);
}

test("LxcClusterPreflightHelper aggregates candidate checks and ranks compatible nodes first.", async () => {
  const { helper, cluster_service, datacenter_service, access_service, lxc_helper } = BuildHelper();
  cluster_service.storage_nodes.set("node-a", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.storage_nodes.set("node-b", { compatible: false, reason: "storage_missing_required_content" });
  cluster_service.bridge_nodes.set("node-a", { compatible: true, reason: "bridge_found" });
  cluster_service.bridge_nodes.set("node-b", { compatible: true, reason: "bridge_found" });
  datacenter_service.records_by_node.set("node-a", [
    { storage: "local", content: ["vztmpl"] },
  ]);
  datacenter_service.records_by_node.set("node-b", [
    { storage: "local", content: ["vztmpl"] },
  ]);
  lxc_helper.preflight_by_node.set("node-a", {
    executed: true,
    enforce: false,
    failed_checks: 0,
    checks: [
      { check: "container_id_available", passed: true, reason: "container_id_available" },
    ],
  });
  lxc_helper.preflight_by_node.set("node-b", {
    executed: true,
    enforce: false,
    failed_checks: 1,
    checks: [
      { check: "container_id_available", passed: false, reason: "container_id_already_exists" },
    ],
  });
  AllowAllPermissions(access_service);

  const response = await helper.preflightLxcCreateCluster({
    create_input: BuildCreateInput(),
    candidate_node_ids: ["node-a", "node-b"],
  });

  assert.equal(response.data.checked_node_count, 2);
  assert.equal(response.data.allowed_node_count, 1);
  assert.equal(response.data.recommended_node_id, "node-a");
  assert.equal(response.data.candidates[0].node_id, "node-a");
  assert.equal(response.data.candidates[1].node_id, "node-b");
});

test("LxcClusterPreflightHelper does not fail candidates on denied permissions when strict_permissions is false.", async () => {
  const { helper, cluster_service, datacenter_service, access_service, lxc_helper } = BuildHelper();
  cluster_service.storage_nodes.set("node-a", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.bridge_nodes.set("node-a", { compatible: true, reason: "bridge_found" });
  datacenter_service.records_by_node.set("node-a", [{ storage: "local", content: ["vztmpl"] }]);
  lxc_helper.preflight_by_node.set("node-a", {
    executed: true,
    enforce: false,
    failed_checks: 0,
    checks: [],
  });
  access_service.allowed.set("/vms::VM.Allocate", false);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);
  access_service.allowed.set("/storage/local::Datastore.AllocateTemplate", true);

  const response = await helper.preflightLxcCreateCluster({
    create_input: BuildCreateInput(),
    candidate_node_ids: ["node-a"],
    strict_permissions: false,
  });

  assert.equal(response.data.candidates[0].allowed, true);
});

test("LxcClusterPreflightHelper fails candidates on denied permissions when strict_permissions is true.", async () => {
  const { helper, cluster_service, datacenter_service, access_service, lxc_helper } = BuildHelper();
  cluster_service.storage_nodes.set("node-a", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.bridge_nodes.set("node-a", { compatible: true, reason: "bridge_found" });
  datacenter_service.records_by_node.set("node-a", [{ storage: "local", content: ["vztmpl"] }]);
  lxc_helper.preflight_by_node.set("node-a", {
    executed: true,
    enforce: false,
    failed_checks: 0,
    checks: [],
  });
  access_service.allowed.set("/vms::VM.Allocate", false);
  access_service.allowed.set("/storage/local-lvm::Datastore.AllocateSpace", true);
  access_service.allowed.set("/storage/local::Datastore.AllocateTemplate", true);

  const response = await helper.preflightLxcCreateCluster({
    create_input: BuildCreateInput(),
    candidate_node_ids: ["node-a"],
    strict_permissions: true,
  });

  assert.equal(response.data.candidates[0].allowed, false);
  assert.equal(response.data.candidates[0].failed_required_checks > 0, true);
});

test("LxcClusterPreflightHelper validates candidate node input.", async () => {
  const { helper } = BuildHelper();
  const input: proxmox_lxc_cluster_preflight_input_i = {
    create_input: BuildCreateInput(),
    candidate_node_ids: ["node-a", "node-a"],
  };

  await assert.rejects(
    async () => helper.preflightLxcCreateCluster(input),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "candidate_node_ids");
      return true;
    },
  );
});

test("LxcClusterPreflightHelper propagates auth failures from access checks.", async () => {
  const { helper, cluster_service, datacenter_service, access_service } = BuildHelper();
  cluster_service.storage_nodes.set("node-a", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.bridge_nodes.set("node-a", { compatible: true, reason: "bridge_found" });
  datacenter_service.records_by_node.set("node-a", [{ storage: "local", content: ["vztmpl"] }]);
  access_service.error_to_throw = new ProxmoxAuthError({
    code: "proxmox.auth.invalid_token",
    message: "Authorization failed",
    status_code: 403,
  });

  await assert.rejects(
    async () => helper.preflightLxcCreateCluster({
      create_input: BuildCreateInput(),
      candidate_node_ids: ["node-a"],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxAuthError);
      assert.equal(error.code, "proxmox.auth.invalid_token");
      return true;
    },
  );
});

test("LxcClusterPreflightHelper supports storage query fallback when node-scoped query is unavailable.", async () => {
  const { helper, cluster_service, datacenter_service, access_service, lxc_helper } = BuildHelper();
  cluster_service.storage_nodes.set("node-a", { compatible: true, reason: "storage_supports_required_content" });
  cluster_service.bridge_nodes.set("node-a", { compatible: true, reason: "bridge_found" });
  datacenter_service.throw_for_node.set(
    "node-a",
    new ProxmoxHttpError({
      code: "proxmox.http.client_error",
      message: "Parameter verification failed.",
      status_code: 400,
    }),
  );
  datacenter_service.records_by_node.set("node-a", [{ storage: "local", node: "node-a", content: "vztmpl" }]);
  lxc_helper.preflight_by_node.set("node-a", {
    executed: true,
    enforce: false,
    failed_checks: 0,
    checks: [],
  });
  AllowAllPermissions(access_service);

  const response = await helper.preflightLxcCreateCluster({
    create_input: BuildCreateInput(),
    candidate_node_ids: ["node-a"],
  });

  assert.equal(response.data.allowed_node_count, 1);
});
