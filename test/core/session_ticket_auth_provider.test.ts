import assert from "node:assert";
import test from "node:test";
import { SessionTicketAuthProvider } from "../../src/core/auth/session_ticket_auth_provider";
import { prox_mox_http_transport_i } from "../../src/core/http/proxmox_http_transport_i";
import { ProxmoxApiParser } from "../../src/core/parser/proxmox_api_parser";
import { proxmox_http_request_t, proxmox_http_response_t } from "../../src/types/proxmox_http_types";

class TicketTransport implements prox_mox_http_transport_i {
  public ticket_calls = 0;

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
    void params.context;
    if (params.request.path === "/api2/json/access/ticket") {
      this.ticket_calls += 1;
      return {
        status: 200,
        status_text: "OK",
        headers: {},
        body: JSON.stringify({
          data: {
            ticket: `PVE:root@pam:test-ticket-${this.ticket_calls}`,
            CSRFPreventionToken: `csrf-${this.ticket_calls}`,
          },
        }),
      };
    }
    return {
      status: 500,
      status_text: "Unexpected",
      headers: {},
      body: "unexpected path",
    };
  }
}

test("SessionTicketAuthProvider caches tickets and emits Cookie/CSRF headers safely.", async () => {
  process.env.PROXMOX_TEST_PRIVILEGED_PASSWORD = "privileged-password";
  const transport = new TicketTransport();
  const provider = new SessionTicketAuthProvider({
    username: "root@pam",
    password_auth: {
      provider: "env",
      env_var: "PROXMOX_TEST_PRIVILEGED_PASSWORD",
    },
    protocol: "https",
    host: "pve-a.internal",
    port: 8006,
    verify_tls: true,
    request_timeout_ms: 30000,
    keep_alive_ms: 30000,
    transport,
    parser: new ProxmoxApiParser(),
  });

  const first_headers = await provider.getSessionHeaders({
    method: "POST",
  });
  const second_headers = await provider.getSessionHeaders({
    method: "GET",
  });

  assert.equal(transport.ticket_calls, 1);
  assert.equal(typeof first_headers.Cookie, "string");
  assert.equal(typeof first_headers.CSRFPreventionToken, "string");
  assert.equal(typeof second_headers.Cookie, "string");
  assert.equal(second_headers.CSRFPreventionToken, undefined);

  const refreshed_headers = await provider.getSessionHeaders({
    method: "POST",
    force_refresh: true,
  });
  assert.equal(transport.ticket_calls, 2);
  assert.equal(
    refreshed_headers.Cookie !== first_headers.Cookie,
    true,
  );

  delete process.env.PROXMOX_TEST_PRIVILEGED_PASSWORD;
});
