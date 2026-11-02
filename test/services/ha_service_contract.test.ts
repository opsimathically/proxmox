import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { ProxmoxHttpError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import { HaService } from "../../src/services/ha_service";
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
      success: true,
      status_code: 200,
      data: this.response_data as T,
    };
  }
}

test("HaService listResources normalizes sparse records.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = [
    {
      sid: "ct:101",
      state: "started",
      group: "default",
      max_relocate: "3",
      max_restart: 2,
      comment: "cluster lxc",
      status: "started",
      custom: "preserved",
    },
    {
      sid: "vm:9000",
    },
    "not-an-object",
  ];
  const service = new HaService({
    request_client,
  });

  const response = await service.listResources({
    type: "ct",
  });

  const request = request_client.requests.at(-1) as proxmox_request_i;
  assert.equal(request.path, "/api2/json/cluster/ha/resources");
  assert.equal(request.query?.type, "ct");
  assert.equal(response.data.length, 2);
  assert.equal(response.data[0].sid, "ct:101");
  assert.equal(response.data[0].max_relocate, 3);
  assert.equal((response.data[0].raw as Record<string, unknown>).custom, "preserved");
});

test("HaService addResource/updateResource/removeResource build expected request payloads.", async () => {
  const request_client = new FakeRequestClient();
  const service = new HaService({
    request_client,
  });

  request_client.response_data = "UPID:node-a:0001:0001:add";
  const add_response = await service.addResource({
    sid: "ct:300",
    group: "default",
    state: "started",
    max_relocate: 3,
    max_restart: 1,
  });
  assert.equal(add_response.data.operation, "add_resource");
  assert.equal(add_response.data.sid, "ct:300");
  assert.equal(add_response.data.task_id, "UPID:node-a:0001:0001:add");
  assert.equal(request_client.requests[0].path, "/api2/json/cluster/ha/resources");
  assert.equal((request_client.requests[0].body as Record<string, unknown>).sid, "ct:300");

  request_client.response_data = {
    upid: "UPID:node-a:0001:0002:update",
  };
  const update_response = await service.updateResource({
    sid: "ct:300",
    state: "disabled",
  });
  assert.equal(update_response.data.operation, "update_resource");
  assert.equal(update_response.data.task_id, "UPID:node-a:0001:0002:update");
  assert.equal(request_client.requests[1].path, "/api2/json/cluster/ha/resources/ct%3A300");
  assert.equal((request_client.requests[1].body as Record<string, unknown>).state, "disabled");

  request_client.response_data = {
    taskid: "UPID:node-a:0001:0003:remove",
  };
  const remove_response = await service.removeResource({
    sid: "ct:300",
  });
  assert.equal(remove_response.data.operation, "remove_resource");
  assert.equal(remove_response.data.task_id, "UPID:node-a:0001:0003:remove");
  assert.equal(request_client.requests[2].path, "/api2/json/cluster/ha/resources/ct%3A300");
});

test("HaService listGroups normalizes records.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = [
    {
      group: "default",
      nodes: "node-a,node-b",
      restricted: 1,
      nofailback: 0,
      comment: "Default HA group",
    },
  ];
  const service = new HaService({
    request_client,
  });

  const response = await service.listGroups();

  assert.equal(request_client.requests[0].path, "/api2/json/cluster/ha/groups");
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].group, "default");
  assert.equal(response.data[0].restricted, true);
  assert.equal(response.data[0].nofailback, false);
});

test("HaService validates sid format.", async () => {
  const service = new HaService({
    request_client: new FakeRequestClient(),
  });

  await assert.rejects(
    async () => service.addResource({
      sid: "bad sid",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "sid");
      return true;
    },
  );
});

test("HaService maps unsupported HA context errors to typed validation errors.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_to_throw = new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "HA manager is not enabled.",
    status_code: 501,
  });
  const service = new HaService({
    request_client,
  });

  await assert.rejects(
    async () => service.listResources(),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "ha_service.listResources");
      return true;
    },
  );
});
