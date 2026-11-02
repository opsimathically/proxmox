import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import {
  ProxmoxAuthError,
  ProxmoxHttpError,
  ProxmoxNotFoundError,
  ProxmoxValidationError,
} from "../../src/errors/proxmox_error";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { ClusterService } from "../../src/services/cluster_service";

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
  public response_data_by_key: Record<string, unknown> = {};
  public error_by_key = new Map<string, Error>();

  public resolveNode(): proxmox_node_connection_i {
    return {
      node_id: "node-a",
      host: "pve-a",
      protocol: "https",
      verify_tls: true,
      auth_provider: new FakeAuthProvider(),
    };
  }

  public isPrivilegedOperationEnabled(_operation: string): boolean {
    return false;
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    this.requests.push(params);
    const request_key = BuildRequestKey(params);
    const mapped_error = this.error_by_key.get(request_key)
      ?? this.error_by_key.get(params.path);
    if (mapped_error !== undefined) {
      throw mapped_error;
    }
    const mapped_response = this.response_data_by_key[request_key]
      ?? this.response_data_by_key[params.path];
    return {
      success: true,
      status_code: 200,
      data: mapped_response as T,
    };
  }
}

function BuildRequestKey(params: proxmox_request_i): string {
  if (params.query === undefined) {
    return params.path;
  }
  const sorted_keys = Object.keys(params.query).sort();
  const query = sorted_keys
    .map((key) => `${key}=${String(params.query?.[key])}`)
    .join("&");
  return `${params.path}?${query}`;
}

test("ClusterService allocateNextId returns endpoint-provided next id.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_key["/api2/json/cluster/nextid"] = "9800";
  const service = new ClusterService({
    request_client,
  });

  const response = await service.allocateNextId({
    resource_type: "lxc",
  });

  assert.equal(response.data.next_id, 9800);
  assert.equal(response.data.source, "cluster_nextid_endpoint");
  assert.equal(response.data.resource_type, "lxc");
  assert.equal(request_client.requests.length, 1);
  assert.equal(request_client.requests[0].path, "/api2/json/cluster/nextid");
});

test("ClusterService allocateNextId falls back to cluster resources when nextid endpoint is unavailable.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_by_key.set(
    "/api2/json/cluster/nextid",
    new ProxmoxNotFoundError({
      code: "proxmox.http.not_found",
      message: "Not found",
      status_code: 404,
    }),
  );
  request_client.response_data_by_key["/api2/json/cluster/resources?type=lxc"] = [
    { type: "lxc", vmid: 9900 },
    { type: "lxc", vmid: "9910" },
    { type: "qemu", vmid: 9999 },
  ];
  const service = new ClusterService({
    request_client,
  });

  const response = await service.allocateNextId({
    resource_type: "lxc",
  });

  assert.equal(response.data.next_id, 9911);
  assert.equal(response.data.source, "cluster_resources_fallback");
  assert.equal(request_client.requests.length, 2);
  assert.equal(request_client.requests[1].path, "/api2/json/cluster/resources");
  assert.equal(request_client.requests[1].query?.type, "lxc");
});

test("ClusterService checkStorageCompatibility maps per-node compatibility and reasons.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_key["/api2/json/storage?node=node-a"] = [
    {
      storage: "local-lvm",
      content: ["rootdir", "images"],
      enabled: 1,
    },
  ];
  request_client.response_data_by_key["/api2/json/storage?node=node-b"] = [
    {
      storage: "local-lvm",
      content: "images",
      enabled: 1,
    },
  ];
  const service = new ClusterService({
    request_client,
  });

  const response = await service.checkStorageCompatibility({
    node_ids: ["node-a", "node-b"],
    required_content: "rootdir",
    storage_id: "local-lvm",
  });

  assert.equal(response.data.checked_node_count, 2);
  assert.deepEqual(response.data.compatible_nodes, ["node-a"]);
  assert.deepEqual(response.data.incompatible_nodes, ["node-b"]);
  const node_a = response.data.nodes.find((node) => node.node_id === "node-a");
  const node_b = response.data.nodes.find((node) => node.node_id === "node-b");
  assert.equal(node_a?.reason, "storage_supports_required_content");
  assert.equal(node_b?.reason, "storage_missing_required_content");
});

test("ClusterService checkBridgeCompatibility accepts bridge and OVSBridge interface types.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_key["/api2/json/nodes/node-a/network"] = [
    {
      iface: "vmbr0",
      type: "bridge",
    },
  ];
  request_client.response_data_by_key["/api2/json/nodes/node-b/network"] = [
    {
      iface: "vmbr0",
      type: "eth",
    },
  ];
  request_client.response_data_by_key["/api2/json/nodes/node-c/network"] = [
    {
      iface: "vmbr0",
      type: "OVSBridge",
    },
  ];
  const service = new ClusterService({
    request_client,
  });

  const response = await service.checkBridgeCompatibility({
    node_ids: ["node-a", "node-b", "node-c"],
    bridge: "vmbr0",
  });

  assert.deepEqual(response.data.compatible_nodes, ["node-a", "node-c"]);
  assert.deepEqual(response.data.incompatible_nodes, ["node-b"]);
  assert.equal(
    response.data.nodes.find((node) => node.node_id === "node-b")?.reason,
    "interface_is_not_bridge",
  );
});

test("ClusterService validates node_ids and bridge/storage inputs.", async () => {
  const service = new ClusterService({
    request_client: new FakeRequestClient(),
  });

  await assert.rejects(
    async () => service.checkStorageCompatibility({
      node_ids: [],
      required_content: "rootdir",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "node_ids");
      return true;
    },
  );

  await assert.rejects(
    async () => service.checkBridgeCompatibility({
      node_ids: ["node-a"],
      bridge: " ",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "bridge");
      return true;
    },
  );
});

test("ClusterService propagates auth failures from request client.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_by_key.set(
    "/api2/json/nodes/node-a/network",
    new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Authorization failed",
      status_code: 403,
    }),
  );
  const service = new ClusterService({
    request_client,
  });

  await assert.rejects(
    async () => service.checkBridgeCompatibility({
      node_ids: ["node-a"],
      bridge: "vmbr0",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxAuthError);
      assert.equal(error.code, "proxmox.auth.invalid_token");
      return true;
    },
  );
});

test("ClusterService falls back to unscoped storage list when node filter is rejected.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_by_key.set(
    "/api2/json/storage?node=node-a",
    new ProxmoxHttpError({
      code: "proxmox.http.client_error",
      message: "Parameter verification failed.",
      status_code: 400,
    }),
  );
  request_client.response_data_by_key["/api2/json/storage"] = [
    {
      storage: "local-lvm",
      node: "node-a",
      content: "rootdir,images",
    },
    {
      storage: "remote",
      node: "node-b",
      content: "images",
    },
  ];
  const service = new ClusterService({
    request_client,
  });

  const response = await service.checkStorageCompatibility({
    node_ids: ["node-a"],
    required_content: "rootdir",
  });

  assert.equal(response.data.compatible_nodes.length, 1);
  assert.equal(response.data.compatible_nodes[0], "node-a");
});
