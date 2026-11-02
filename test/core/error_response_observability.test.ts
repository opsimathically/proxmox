import assert from "node:assert";
import test from "node:test";
import { prox_mox_http_transport_i } from "../../src/core/http/proxmox_http_transport_i";
import { ProxmoxApiParser } from "../../src/core/parser/proxmox_api_parser";
import { BuildRequestClientNode, ProxmoxRequestClient } from "../../src/core/request/proxmox_request_client";
import { ProxmoxHttpError } from "../../src/errors/proxmox_error";
import { proxmox_retry_policy_t } from "../../src/types/proxmox_config_types";
import { proxmox_http_request_t, proxmox_http_response_t } from "../../src/types/proxmox_http_types";

class StaticResponseTransport implements prox_mox_http_transport_i {
  public readonly response: proxmox_http_response_t;

  constructor(response: proxmox_http_response_t) {
    this.response = response;
  }

  public async request(params: {
    request: proxmox_http_request_t;
    context: {
      base_url: string;
      verify_tls: boolean;
      keep_alive_ms: number;
      ca_bundle_path?: string;
      request_timeout_ms?: number;
    };
  }): Promise<proxmox_http_response_t> {
    void params;
    return this.response;
  }
}

test("ProxmoxApiParser preserves non-JSON response text for actionable errors.", () => {
  const parser = new ProxmoxApiParser();
  const response = parser.parseResponse<string>({
    status: 500,
    status_text: "Internal Server Error",
    headers: {},
    body: "parameter verification failed - net0: invalid format",
  });

  assert.equal(response.status_code, 500);
  assert.equal(response.data, "parameter verification failed - net0: invalid format");
  assert.equal(response.message, "parameter verification failed - net0: invalid format");
});

test("ProxmoxApiParser derives message from structured errors maps.", () => {
  const parser = new ProxmoxApiParser();
  const response = parser.parseResponse<Record<string, unknown>>({
    status: 400,
    status_text: "Bad Request",
    headers: {},
    body: JSON.stringify({
      errors: {
        rootfs: "invalid value",
        net0: "invalid format",
      },
    }),
  });

  assert.equal(response.status_code, 400);
  assert.equal(typeof response.message, "string");
  assert.equal(response.message?.includes("rootfs: invalid value"), true);
  assert.equal(response.message?.includes("net0: invalid format"), true);
});

test("ProxmoxRequestClient surfaces actionable non-2xx messages and safe cause excerpts.", async () => {
  process.env.PROXMOX_TEST_TOKEN = "test-token";

  const request_client = new ProxmoxRequestClient({
    transport: new StaticResponseTransport({
      status: 500,
      status_text: "Internal Server Error",
      headers: {},
      body: "rootfs: invalid format",
    }),
    parser: new ProxmoxApiParser(),
    nodes: [
      BuildRequestClientNode({
        node_id: "node-a",
        host: "pve-a.internal",
        protocol: "https",
        port: 8006,
        auth: {
          provider: "env",
          env_var: "PROXMOX_TEST_TOKEN",
        },
        token_id: "root@pam!builder",
      }),
    ],
    retry_policy: {
      enabled: false,
      max_retries: 0,
      base_delay_ms: 10,
      max_delay_ms: 10,
      jitter_ratio: 0,
      retry_on_429: false,
      retry_on_500: false,
    } as proxmox_retry_policy_t,
    request_timeout_ms: 30000,
    keep_alive_ms: 30000,
  });

  await assert.rejects(
    async () => request_client.request({
      method: "POST",
      path: "/api2/json/nodes/node-a/lxc",
      node_id: "node-a",
      body: {
        rootfs: "local-lvm:8",
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxHttpError);
      assert.equal(error.code, "proxmox.http.server_error");
      assert.equal(error.message.includes("rootfs: invalid format"), true);
      assert.equal(typeof error.cause, "object");
      const cause_record = error.cause as { body_excerpt?: string };
      assert.equal(cause_record.body_excerpt?.includes("rootfs: invalid format"), true);
      return true;
    },
  );

  delete process.env.PROXMOX_TEST_TOKEN;
});
