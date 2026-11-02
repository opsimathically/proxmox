import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { ProxmoxAuthError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { PoolService } from "../../src/services/pool_service";

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
  public error_to_throw?: Error;

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
    if (this.error_to_throw !== undefined) {
      throw this.error_to_throw;
    }
    return {
      data: this.response_data as T,
      success: true,
      status_code: 200,
    };
  }
}

test("PoolService listPools builds expected request path and normalizes sparse records.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = [
    {
      poolid: "production",
      comment: "Primary workloads",
      custom_field: "preserved",
    },
    {
      pool: "lab",
      comment: "",
    },
    "not-an-object",
    null,
  ];
  const service = new PoolService({
    request_client,
  });

  const response = await service.listPools();

  const request = request_client.requests.at(-1) as proxmox_request_i;
  assert.equal(request.path, "/api2/json/pools");
  assert.equal(response.data.length, 2);
  assert.equal(response.data[0].pool_id, "production");
  assert.equal(response.data[0].comment, "Primary workloads");
  assert.equal(
    (response.data[0].raw as Record<string, unknown>).custom_field,
    "preserved",
  );
  assert.equal(response.data[1].pool_id, "lab");
  assert.equal(response.data[1].comment, undefined);
});

test("PoolService getPool builds expected request path and normalizes members.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    poolid: "production",
    comment: "Primary workloads",
    members: [
      {
        id: "qemu/100",
        type: "qemu",
        vmid: 100,
        node: "g75",
        name: "web-01",
        status: "running",
      },
      {
        id: "lxc/200",
        type: "lxc",
        vmid: "200",
        node: "g75",
      },
      "invalid-member",
    ],
  };
  const service = new PoolService({
    request_client,
  });

  const response = await service.getPool({
    pool_id: "production",
  });

  const request = request_client.requests.at(-1) as proxmox_request_i;
  assert.equal(request.path, "/api2/json/pools/production");
  assert.equal(response.data.pool_id, "production");
  assert.equal(response.data.comment, "Primary workloads");
  assert.equal(response.data.members.length, 2);
  assert.equal(response.data.members[0].id, "qemu/100");
  assert.equal(response.data.members[0].type, "qemu");
  assert.equal(response.data.members[0].vmid, 100);
  assert.equal(response.data.members[1].id, "lxc/200");
  assert.equal(response.data.members[1].type, "lxc");
  assert.equal(response.data.members[1].vmid, "200");
});

test("PoolService listPoolResources returns normalized members for a pool.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    poolid: "lab",
    members: [
      {
        id: "qemu/9000",
        type: "qemu",
      },
    ],
  };
  const service = new PoolService({
    request_client,
  });

  const response = await service.listPoolResources({
    pool_id: "lab",
  });

  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].id, "qemu/9000");
  assert.equal(response.data[0].type, "qemu");
});

test("PoolService validates required pool_id input.", async () => {
  const request_client = new FakeRequestClient();
  const service = new PoolService({
    request_client,
  });

  await assert.rejects(
    async () => service.getPool({
      pool_id: " ",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "pool_id");
      return true;
    },
  );
});

test("PoolService propagates auth/permission failures from request client.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_to_throw = new ProxmoxAuthError({
    code: "proxmox.auth.invalid_token",
    message: "Authorization failed for Proxmox request.",
    status_code: 403,
  });
  const service = new PoolService({
    request_client,
  });

  await assert.rejects(
    async () => service.listPools(),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxAuthError);
      assert.equal(error.code, "proxmox.auth.invalid_token");
      return true;
    },
  );
});
