import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import {
  ProxmoxHttpError,
  ProxmoxValidationError,
} from "../../src/errors/proxmox_error";
import { DrService } from "../../src/services/dr_service";
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
  public response_by_key = new Map<string, unknown>();
  public error_by_key = new Map<string, Error>();

  public resolveNode(node_id?: string): proxmox_node_connection_i {
    return {
      node_id: node_id ?? "node-a",
      host: "pve-a",
      protocol: "https",
      verify_tls: true,
      auth_provider: new FakeAuthProvider(),
    };
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    this.requests.push(params);
    const key = BuildKey(params);
    const error_to_throw = this.error_by_key.get(key);
    if (error_to_throw !== undefined) {
      throw error_to_throw;
    }
    return {
      success: true,
      status_code: 200,
      data: (this.response_by_key.get(key) ?? []) as T,
    };
  }
}

function BuildKey(params: proxmox_request_i): string {
  const node_query = typeof params.query?.node === "string" ? params.query.node : "";
  return `${params.path}?node=${node_query}`;
}

test("DrService discoverReplicationCapabilities detects supported cluster and node endpoints.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_by_key.set("/api2/json/cluster/replication?node=", [{ id: "job-1" }]);
  request_client.response_by_key.set("/api2/json/nodes/node-a/replication?node=", [{ id: "job-2" }]);
  const service = new DrService({
    request_client,
  });

  const response = await service.discoverReplicationCapabilities({
    node_id: "node-a",
  });

  assert.equal(response.data.supported, true);
  assert.equal(response.data.cluster_jobs_count, 1);
  assert.equal(response.data.node_jobs_count, 1);
  assert.equal(response.data.checks.length, 2);
  assert.equal(response.data.checks.every((check) => check.supported), true);
});

test("DrService marks unsupported replication endpoints without hard-failing.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_by_key.set(
    "/api2/json/cluster/replication?node=",
    new ProxmoxHttpError({
      code: "proxmox.http.server_error",
      message: "Not implemented",
      status_code: 501,
    }),
  );
  const service = new DrService({
    request_client,
  });

  const response = await service.discoverReplicationCapabilities();

  assert.equal(response.data.supported, false);
  assert.equal(response.data.cluster_jobs_count, 0);
  assert.equal(response.data.checks[0].reason, "endpoint_unsupported");
  assert.equal(response.data.checks[0].status_code, 501);
});

test("DrService discoverBackupCapabilities supports node-filter fallback and backup storage detection.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_by_key.set("/api2/json/cluster/backup?node=", []);
  request_client.error_by_key.set(
    "/api2/json/storage?node=node-a",
    new ProxmoxHttpError({
      code: "proxmox.http.client_error",
      message: "Parameter verification failed",
      status_code: 400,
    }),
  );
  request_client.response_by_key.set("/api2/json/storage?node=", [
    {
      storage: "local",
      content: "backup,iso",
      node: "node-a",
    },
    {
      storage: "other",
      content: "images",
      node: "node-a",
    },
  ]);
  const service = new DrService({
    request_client,
  });

  const response = await service.discoverBackupCapabilities({
    node_id: "node-a",
  });

  assert.equal(response.data.supported, true);
  assert.equal(response.data.backup_storage_count, 1);
  assert.deepEqual(response.data.backup_storage_ids, ["local"]);
  assert.equal(
    response.data.checks.some(
      (check) => check.reason === "node_scope_unsupported_unscoped_fallback_used",
    ),
    true,
  );
});

test("DrService checkDrReadiness reports failed policy checks when required capabilities are missing.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_by_key.set(
    "/api2/json/cluster/replication?node=",
    new ProxmoxHttpError({
      code: "proxmox.http.server_error",
      message: "Not implemented",
      status_code: 501,
    }),
  );
  request_client.response_by_key.set("/api2/json/cluster/backup?node=", []);
  request_client.response_by_key.set("/api2/json/storage?node=", []);
  const service = new DrService({
    request_client,
  });

  const response = await service.checkDrReadiness({
    require_replication_jobs: true,
    require_backup_storage: true,
    minimum_backup_storage_count: 1,
  });

  assert.equal(response.data.allowed, false);
  assert.equal(response.data.failed_checks >= 2, true);
  assert.equal(
    response.data.checks.some((check) => check.reason === "replication_jobs_missing"),
    true,
  );
  assert.equal(
    response.data.checks.some((check) => check.reason === "backup_storage_threshold_not_met"),
    true,
  );
});

test("DrService validates node_id and readiness threshold input.", async () => {
  const service = new DrService({
    request_client: new FakeRequestClient(),
  });

  await assert.rejects(
    async () => service.discoverReplicationCapabilities({
      node_id: "bad node id",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "node_id");
      return true;
    },
  );

  await assert.rejects(
    async () => service.checkDrReadiness({
      minimum_backup_storage_count: -1,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "minimum_backup_storage_count");
      return true;
    },
  );
});
