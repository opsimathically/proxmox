import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { VmService } from "../../src/services/vm_service";

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
    return {
      data: "UPID:node-a:100:abcd" as T,
      success: true,
      status_code: 200,
    };
  }
}

test("VM create and start methods use typed request contracts and return task IDs.", async () => {
  const request_client = new FakeRequestClient();
  const service = new VmService({ request_client });

  const create_result = await service.createVm({
    node_id: "node-a",
    vm_id: 200,
    config: {
      name: "web-01",
      memory: 2048,
    },
  });

  const create_request = request_client.requests.at(-1) as proxmox_request_i;
  const create_request_http = create_request as { method: string; path: string; body?: Record<string, unknown> };
  assert.equal(create_request_http.method, "POST");
  assert.equal(create_request_http.path, "/api2/json/nodes/node-a/qemu");
  assert.equal((create_request_http.body as Record<string, unknown>).vmid, "200");
  assert.equal(create_result.task_id, "UPID:node-a:100:abcd");
  assert.equal(create_result.operation, "create");
  assert.equal(create_result.resource_id, "200");

  const start_result = await service.startVm({
    node_id: "node-a",
    vm_id: 200,
    retry_allowed: false,
  });

  const start_request = request_client.requests.at(-1) as proxmox_request_i;
  const start_request_http = start_request as { method: string; path: string };
  assert.equal(start_request_http.method, "POST");
  assert.equal(start_request_http.path, "/api2/json/nodes/node-a/qemu/200/status/start");
  assert.equal(start_result.task_id, "UPID:node-a:100:abcd");
  assert.equal(start_result.operation, "start");
});
