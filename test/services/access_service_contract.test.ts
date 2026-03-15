import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { ProxmoxAuthError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { AccessService } from "../../src/services/access_service";

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

test("AccessService getCurrentPermissions returns normalized privileges for current identity.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    "VM.Audit": 1,
    "VM.PowerMgmt": 0,
  };
  const service = new AccessService({ request_client });

  const result = await service.getCurrentPermissions({
    path: "/vms/100",
  });

  const request = request_client.requests.at(-1) as proxmox_request_i;
  const request_with_query = request as proxmox_request_i & {
    query: { path: string; userid?: string };
  };
  assert.equal(request.method, "GET");
  assert.equal(request.path, "/api2/json/access/permissions");
  assert.equal(request_with_query.query.path, "/vms/100");
  assert.equal(request_with_query.query.userid, undefined);
  assert.equal(result.data.identity, "current");
  assert.equal(result.data.requested_path, "/vms/100");
  assert.equal(result.data.privileges["VM.Audit"], true);
  assert.equal(result.data.privileges["VM.PowerMgmt"], false);
});

test("AccessService getIdentityPermissions targets a requested auth_id.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    privs: {
      "Datastore.Audit": true,
    },
  };
  const service = new AccessService({ request_client });

  const result = await service.getIdentityPermissions({
    path: "vms/100",
    auth_id: "root@pam!automation",
  });

  const request = request_client.requests.at(-1) as proxmox_request_i;
  const request_with_query = request as proxmox_request_i & {
    query: { path: string; userid?: string };
  };
  assert.equal(request_with_query.query.path, "/vms/100");
  assert.equal(request_with_query.query.userid, "root@pam!automation");
  assert.equal(result.data.identity, "target");
  assert.equal(result.data.auth_id, "root@pam!automation");
  assert.equal(result.data.privileges["Datastore.Audit"], true);
});

test("AccessService resolves path-scoped permission maps from Proxmox response.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    "/": {
      "Sys.Audit": 1,
    },
    "/vms": {
      "VM.Audit": 1,
      "VM.PowerMgmt": 0,
    },
  };
  const service = new AccessService({ request_client });

  const result = await service.getCurrentPermissions({
    path: "/vms",
  });

  assert.equal(result.data.requested_path, "/vms");
  assert.equal(result.data.privileges["VM.Audit"], true);
  assert.equal(result.data.privileges["VM.PowerMgmt"], false);
});

test("AccessService falls back to nearest parent path in scoped permission map.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    "/vms": {
      "VM.Audit": 1,
    },
  };
  const service = new AccessService({ request_client });

  const result = await service.getCurrentPermissions({
    path: "/vms/9000",
  });

  assert.equal(result.data.requested_path, "/vms/9000");
  assert.equal(result.data.privileges["VM.Audit"], true);
});

test("AccessService validates required path input.", async () => {
  const request_client = new FakeRequestClient();
  const service = new AccessService({ request_client });

  await assert.rejects(
    async () => service.getCurrentPermissions({ path: "  " }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "path");
      return true;
    },
  );
});

test("AccessService validates malformed target auth_id input.", async () => {
  const request_client = new FakeRequestClient();
  const service = new AccessService({ request_client });

  await assert.rejects(
    async () => service.getIdentityPermissions({
      path: "/vms/100",
      auth_id: "bad auth id",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "auth_id");
      return true;
    },
  );
});

test("AccessService propagates auth/permission failures from request client.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_to_throw = new ProxmoxAuthError({
    code: "proxmox.auth.invalid_token",
    message: "Authorization failed for Proxmox request.",
    status_code: 403,
  });
  const service = new AccessService({ request_client });

  await assert.rejects(
    async () => service.getCurrentPermissions({ path: "/" }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxAuthError);
      assert.equal(error.code, "proxmox.auth.invalid_token");
      return true;
    },
  );
});

test("AccessService privilege helpers report allowed true/false with normalized checks.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    privileges: {
      "VM.Audit": true,
      "VM.Console": false,
    },
  };
  const service = new AccessService({ request_client });

  const allowed_result = await service.hasCurrentPrivilege({
    path: "/vms/100",
    privilege: "VM.Audit",
  });
  const denied_result = await service.hasIdentityPrivilege({
    path: "/vms/100",
    auth_id: "root@pam!automation",
    privilege: "VM.Console",
  });

  assert.equal(allowed_result.data.allowed, true);
  assert.equal(allowed_result.data.privilege, "VM.Audit");
  assert.equal(denied_result.data.allowed, false);
  assert.equal(denied_result.data.identity, "target");
});
