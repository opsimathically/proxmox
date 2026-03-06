import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import {
  ProxmoxHttpError,
  ProxmoxNotFoundError,
  ProxmoxValidationError,
} from "../../src/errors/proxmox_error";
import { LxcHelper } from "../../src/helpers/lxc_helper";
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
  public requests: proxmox_request_i[] = [];
  public response_data: unknown = {};
  public response_data_by_path: Record<string, unknown> = {};
  public error_by_path = new Map<string, Error>();

  public resolveNode(): proxmox_node_connection_i {
    return {
      node_id: "node-a",
      host: "pve-a",
      protocol: "https",
      verify_tls: true,
      auth_provider: new FakeAuthProvider(),
    };
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    this.requests.push(params);
    const mapped_error = this.error_by_path.get(params.path);
    if (mapped_error !== undefined) {
      throw mapped_error;
    }
    const mapped_response = this.response_data_by_path[params.path];
    const resolved_data = mapped_response !== undefined ? mapped_response : this.response_data;
    return {
      success: true,
      status_code: 200,
      data: resolved_data as T,
    };
  }
}

class FakeLxcService {
  public create_calls: Record<string, unknown>[] = [];
  public start_calls: Record<string, unknown>[] = [];
  public error_on_create?: Error;
  public error_on_start?: Error;
  public create_result: unknown = {
    operation: "create",
    resource_type: "lxc",
    resource_id: "101",
    node_id: "node-a",
    task_id: "UPID:create:1",
  };
  public start_result: unknown = {
    operation: "start",
    resource_type: "lxc",
    resource_id: "101",
    node_id: "node-a",
    task_id: "UPID:start:1",
  };

  public async createContainer(params: Record<string, unknown>): Promise<unknown> {
    this.create_calls.push(params);
    if (this.error_on_create !== undefined) {
      throw this.error_on_create;
    }
    return this.create_result;
  }

  public async startContainer(params: Record<string, unknown>): Promise<unknown> {
    this.start_calls.push(params);
    if (this.error_on_start !== undefined) {
      throw this.error_on_start;
    }
    return this.start_result;
  }
}

class FakeNodeService {
  public list_nodes_response: unknown[] = [{ node: "node-a", status: "online" }];
  public list_bridges_response: unknown[] = [{ interface_id: "vmbr0", type: "bridge", is_bridge: true, raw: {} }];
  public cpu_preflight_response = { allowed: true, reason: "within_limit" };
  public memory_preflight_response = { allowed: true, reason: "within_limit" };

  public async listNodes(): Promise<proxmox_api_response_t<unknown[]>> {
    return {
      success: true,
      status_code: 200,
      data: this.list_nodes_response,
    };
  }

  public async listBridges(): Promise<proxmox_api_response_t<unknown[]>> {
    return {
      success: true,
      status_code: 200,
      data: this.list_bridges_response,
    };
  }

  public async canAllocateCores(): Promise<proxmox_api_response_t<unknown>> {
    return {
      success: true,
      status_code: 200,
      data: this.cpu_preflight_response,
    };
  }

  public async canAllocateMemory(): Promise<proxmox_api_response_t<unknown>> {
    return {
      success: true,
      status_code: 200,
      data: this.memory_preflight_response,
    };
  }
}

class FakeDatacenterService {
  public storage_records: unknown[] = [
    {
      storage: "local-lvm",
      content: ["images", "rootdir"],
    },
    {
      storage: "local",
      content: ["iso", "vztmpl", "backup"],
    },
  ];
  public scoped_call_count = 0;
  public throw_on_scoped = false;

  public async listStorage(params?: {
    node?: string;
  }): Promise<proxmox_api_response_t<unknown[]>> {
    if (params?.node !== undefined) {
      this.scoped_call_count += 1;
      if (this.throw_on_scoped) {
        throw new ProxmoxValidationError({
          code: "proxmox.http.client_error",
          message: "Parameter verification failed.",
        });
      }
    }
    return {
      success: true,
      status_code: 200,
      data: this.storage_records,
    };
  }
}

class FakePoolService {
  public async getPool(params: { pool_id: string }): Promise<proxmox_api_response_t<unknown>> {
    return {
      success: true,
      status_code: 200,
      data: {
        pool_id: params.pool_id,
        members: [],
      },
    };
  }
}

function BuildHelper(params: {
  request_client?: FakeRequestClient;
  lxc_service?: FakeLxcService;
  node_service?: FakeNodeService;
  datacenter_service?: FakeDatacenterService;
  pool_service?: FakePoolService;
} = {}): {
  helper: LxcHelper;
  request_client: FakeRequestClient;
  lxc_service: FakeLxcService;
  node_service: FakeNodeService;
  datacenter_service: FakeDatacenterService;
  pool_service: FakePoolService;
} {
  const request_client = params.request_client ?? new FakeRequestClient();
  const lxc_service = params.lxc_service ?? new FakeLxcService();
  const node_service = params.node_service ?? new FakeNodeService();
  const datacenter_service = params.datacenter_service ?? new FakeDatacenterService();
  const pool_service = params.pool_service ?? new FakePoolService();

  request_client.response_data_by_path["/api2/json/nodes/node-a/lxc"] = [];
  request_client.response_data_by_path["/api2/json/nodes/node-a/qemu"] = [];
  request_client.response_data_by_path["/api2/json/nodes/node-a/storage/local/content"] = [
    {
      volid: "local:vztmpl/debian-12.tar.zst",
    },
    {
      volid: "local:vztmpl/alpine.tar.zst",
    },
  ];

  const helper = new LxcHelper({
    request_client,
    lxc_service: lxc_service as unknown as any,
    node_service: node_service as unknown as any,
    datacenter_service: datacenter_service as unknown as any,
    pool_service: pool_service as unknown as any,
  });

  return {
    helper,
    request_client,
    lxc_service,
    node_service,
    datacenter_service,
    pool_service,
  };
}

test("LxcHelper createLxcContainer submits create config and returns task metadata.", async () => {
  const { helper, lxc_service } = BuildHelper();

  const response = await helper.createLxcContainer({
    general: {
      node_id: "node-a",
      container_id: 101,
      hostname: "web-01.domain",
      unprivileged_container: true,
      nesting: true,
      tags: ["prod", "web"],
    },
    template: {
      storage: "local",
      template: "debian-12-standard_12.0-1_amd64.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 8,
    },
    cpu: {
      cores: 2,
      cpu_units: 100,
    },
    memory: {
      memory_mib: 1024,
      swap_mib: 512,
    },
    dns: {
      dns_servers: ["1.1.1.1", "8.8.8.8"],
    },
  });

  assert.equal(lxc_service.create_calls.length, 1);
  assert.equal(lxc_service.start_calls.length, 0);
  const create_call = lxc_service.create_calls[0] as {
    config: Record<string, unknown>;
    container_id: string;
  };
  assert.equal(create_call.container_id, "101");
  assert.equal(create_call.config.hostname, "web-01.domain");
  assert.equal(create_call.config.ostemplate, "local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst");
  assert.equal(create_call.config.rootfs, "local-lvm:8");
  assert.equal(create_call.config.unprivileged, 1);
  assert.equal(create_call.config.features, "nesting=1");
  assert.equal(create_call.config.tags, "prod;web");
  assert.equal(create_call.config.memory, 1024);
  assert.equal(response.data.dry_run, false);
  assert.equal(response.data.create_task?.operation, "create");
});

test("LxcHelper createLxcContainer supports create and start flow when start_after_created is true.", async () => {
  const { helper, lxc_service } = BuildHelper();

  const response = await helper.createLxcContainer({
    general: {
      node_id: "node-a",
      container_id: 102,
      hostname: "api-01.domain",
    },
    template: {
      storage: "local",
      template: "local:vztmpl/alpine.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 4,
    },
    start_after_created: true,
    wait_for_task: true,
  });

  assert.equal(lxc_service.create_calls.length, 1);
  assert.equal(lxc_service.start_calls.length, 1);
  const create_call = lxc_service.create_calls[0] as { wait_for_task?: boolean };
  const start_call = lxc_service.start_calls[0] as { wait_for_task?: boolean };
  assert.equal(create_call.wait_for_task, true);
  assert.equal(start_call.wait_for_task, true);
  assert.equal(response.data.start_task?.operation, "start");
});

test("LxcHelper validates static IP combinations and rejects missing CIDR.", async () => {
  const { helper } = BuildHelper();

  await assert.rejects(
    async () => helper.createLxcContainer({
      general: {
        node_id: "node-a",
        container_id: 103,
        hostname: "bad-ip.domain",
      },
      template: {
        storage: "local",
        template: "debian-12.tar.zst",
      },
      disks: {
        storage: "local-lvm",
        disk_size_gib: 8,
      },
      network: {
        bridge: "vmbr0",
        ipv4_mode: "static",
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "network.ipv4_cidr");
      return true;
    },
  );
});

test("LxcHelper preflight enforcement blocks create on bridge/storage failures and keeps secrets out errors.", async () => {
  const { helper, lxc_service, datacenter_service, node_service, request_client } = BuildHelper();
  datacenter_service.storage_records = [
    {
      storage: "local-lvm",
      content: ["images"],
    },
    {
      storage: "local",
      content: ["iso"],
    },
  ];
  node_service.list_bridges_response = [
    {
      interface_id: "vmbr1",
      type: "bridge",
      is_bridge: true,
      raw: {},
    },
  ];
  request_client.response_data_by_path["/api2/json/nodes/node-a/storage/local/content"] = [];

  await assert.rejects(
    async () => helper.createLxcContainer({
      general: {
        node_id: "node-a",
        container_id: 104,
        hostname: "preflight.domain",
        password: "SuperSecretPasswordValue",
      },
      template: {
        storage: "local",
        template: "debian-12.tar.zst",
      },
      disks: {
        storage: "local-lvm",
        disk_size_gib: 8,
      },
      network: {
        bridge: "vmbr0",
      },
      preflight: {
        enabled: true,
        enforce: true,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "preflight");
      assert.equal(String(error.message).includes("SuperSecretPasswordValue"), false);
      assert.equal(String(error.details?.value ?? "").includes("SuperSecretPasswordValue"), false);
      return true;
    },
  );

  assert.equal(lxc_service.create_calls.length, 0);
});

test("LxcHelper preflight non-enforced mode reports cpu/memory failures without blocking dry-run.", async () => {
  const { helper, node_service } = BuildHelper();
  node_service.cpu_preflight_response = {
    allowed: false,
    reason: "exceeds_limit",
  };
  node_service.memory_preflight_response = {
    allowed: false,
    reason: "capacity_unknown",
  };

  const response = await helper.createLxcContainer({
    general: {
      node_id: "node-a",
      container_id: 105,
      hostname: "dryrun.domain",
    },
    template: {
      storage: "local",
      template: "debian-12.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 8,
    },
    cpu: {
      cores: 16,
    },
    memory: {
      memory_mib: 8192,
    },
    dry_run: true,
    preflight: {
      enabled: true,
      enforce: false,
      check_cpu: true,
      check_memory: true,
      memory_mode: "allocated_headroom",
    },
  });

  assert.equal(response.data.dry_run, true);
  assert.equal(response.data.preflight.executed, true);
  assert.equal(response.data.preflight.failed_checks, 2);
  assert.equal(
    response.data.preflight.checks.some(
      (check_record) => check_record.check === "cpu_headroom" && check_record.reason === "exceeds_limit",
    ),
    true,
  );
  assert.equal(
    response.data.preflight.checks.some(
      (check_record) => check_record.check === "memory_headroom" && check_record.reason === "capacity_unknown",
    ),
    true,
  );
});

test("LxcHelper add_to_ha posts HA registration request after create.", async () => {
  const { helper, request_client } = BuildHelper();

  await helper.createLxcContainer({
    general: {
      node_id: "node-a",
      container_id: 106,
      hostname: "ha.domain",
      add_to_ha: true,
    },
    template: {
      storage: "local",
      template: "debian-12.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 8,
    },
  });

  const ha_request = request_client.requests.find(
    (request_record) => request_record.path === "/api2/json/cluster/ha/resources",
  );
  assert.ok(ha_request);
  const ha_body = (ha_request as { body?: { sid?: string } }).body;
  assert.equal(ha_body?.sid, "ct:106");
});

test("LxcHelper add_to_ha reports unsupported context as typed validation error.", async () => {
  const { helper, request_client } = BuildHelper();
  request_client.error_by_path.set(
    "/api2/json/cluster/ha/resources",
    new ProxmoxNotFoundError({
      code: "proxmox.http.not_found",
      message: "Not found",
      status_code: 404,
    }),
  );

  await assert.rejects(
    async () => helper.createLxcContainer({
      general: {
        node_id: "node-a",
        container_id: 107,
        hostname: "no-ha.domain",
        add_to_ha: true,
      },
      template: {
        storage: "local",
        template: "debian-12.tar.zst",
      },
      disks: {
        storage: "local-lvm",
        disk_size_gib: 8,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "general.add_to_ha");
      return true;
    },
  );
});

test("LxcHelper preflight detects container_id collisions across VM/LXC IDs.", async () => {
  const { helper, request_client, lxc_service } = BuildHelper();
  request_client.response_data_by_path["/api2/json/nodes/node-a/lxc"] = [
    {
      vmid: 108,
    },
  ];
  request_client.response_data_by_path["/api2/json/nodes/node-a/qemu"] = [];

  await assert.rejects(
    async () => helper.createLxcContainer({
      general: {
        node_id: "node-a",
        container_id: 108,
        hostname: "collision.domain",
      },
      template: {
        storage: "local",
        template: "debian-12.tar.zst",
      },
      disks: {
        storage: "local-lvm",
        disk_size_gib: 8,
      },
      preflight: {
        enabled: true,
        enforce: true,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "preflight");
      assert.equal(error.details?.value?.includes("container_id_available"), true);
      return true;
    },
  );

  assert.equal(lxc_service.create_calls.length, 0);
});

test("LxcHelper create failure rethrows with sanitized helper context details.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.error_on_create = new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "rootfs invalid",
    status_code: 500,
    details: {
      path: "/api2/json/nodes/node-a/lxc",
    },
    cause: {
      errors: {
        rootfs: "invalid format",
      },
    },
  });

  await assert.rejects(
    async () => helper.createLxcContainer({
      general: {
        node_id: "node-a",
        container_id: 109,
        hostname: "ctx.domain",
        password: "DoNotLeakMe",
      },
      template: {
        storage: "local",
        template: "debian-12.tar.zst",
      },
      disks: {
        storage: "local-lvm",
        disk_size_gib: 8,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxHttpError);
      assert.equal(error.message.includes("LXC helper create failed"), true);
      assert.equal(error.details?.field, "helpers.create_lxc_container");
      assert.equal(typeof error.details?.value, "string");
      assert.equal(error.details?.value?.includes("DoNotLeakMe"), false);
      assert.equal(error.details?.value?.includes("password"), false);
      assert.equal(error.details?.value?.includes("container_id"), true);
      return true;
    },
  );
});
