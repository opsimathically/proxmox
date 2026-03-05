import assert from "node:assert";
import test from "node:test";
import { prox_mox_http_transport_i } from "../../src/core/http/proxmox_http_transport_i";
import { ProxmoxApiParser } from "../../src/core/parser/proxmox_api_parser";
import { BuildRequestClientNode, ProxmoxRequestClient } from "../../src/core/request/proxmox_request_client";
import { proxmox_retry_policy_t } from "../../src/types/proxmox_config_types";
import { proxmox_http_request_t, proxmox_http_response_t } from "../../src/types/proxmox_http_types";
import { proxmox_request_client_i } from "../../src/core/request/proxmox_request_client";

class FakeTransport implements prox_mox_http_transport_i {
  public request_call_count = 0;
  public request_path = "";
  public context_base_url = "";
  public context_headers: Record<string, string> = {};

  public async Request(params: {
    request: proxmox_http_request_t;
    context: {
      base_url: string;
      verify_tls: boolean;
      keep_alive_ms: number;
      ca_bundle_path?: string;
      request_timeout_ms?: number;
    };
  }): Promise<proxmox_http_response_t> {
    this.request_call_count += 1;
    this.request_path = params.request.path;
    this.context_base_url = params.context.base_url;
    this.context_headers = params.request.headers ?? {};

    const response_body = JSON.stringify({
      data: {
        upid: "UPID:node-a:999:1",
      },
    });
    return {
      status: 200,
      status_text: "OK",
      headers: {},
      body: response_body,
    };
  }
}

test("Transport request construction sets safe URL, method, and auth header.", async () => {
  process.env.PROXMOX_TEST_TOKEN = "top-secret-token";

  const transport = new FakeTransport();
  const parser = new ProxmoxApiParser();
  const node = BuildRequestClientNode({
    node_id: "node-a",
    host: "pve-a.internal",
    protocol: "https",
    port: 8006,
    auth: {
      provider: "env",
      env_var: "PROXMOX_TEST_TOKEN",
    },
    token_id: "root@pam!builder",
  });

  const request_client: proxmox_request_client_i = new ProxmoxRequestClient({
    transport,
    parser,
    nodes: [node],
    retry_policy: {
      enabled: true,
      max_retries: 1,
      base_delay_ms: 10,
      max_delay_ms: 100,
      jitter_ratio: 0.25,
      retry_on_429: true,
      retry_on_500: true,
    } as proxmox_retry_policy_t,
    request_timeout_ms: 30000,
    keep_alive_ms: 30000,
    default_headers: {
      "User-Agent": "test-agent",
    },
  });

  await request_client.Request({
    method: "GET",
    path: "/api2/json/nodes/node-a/qemu",
    node_id: "node-a",
  });

  delete process.env.PROXMOX_TEST_TOKEN;

  assert.equal(transport.request_call_count, 1);
  assert.equal(transport.request_path, "/api2/json/nodes/node-a/qemu");
  assert.equal(transport.context_base_url, "https://pve-a.internal:8006");
  assert.equal(typeof transport.context_headers.Authorization, "string");
  assert.equal(transport.context_headers.Authorization.includes("PVEAPIToken root@pam!builder=top-secret-token"), true);
});
