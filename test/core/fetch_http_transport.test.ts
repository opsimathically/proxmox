import assert from "node:assert";
import { EventEmitter } from "node:events";
import * as http from "node:http";
import * as https from "node:https";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FetchHttpTransport } from "../../src/core/http/fetch_http_transport";

function CreateMockClientRequest(): http.ClientRequest {
  const request_emitter = new EventEmitter() as unknown as {
    setTimeout: (timeout: number, callback?: () => void) => unknown;
    destroy: (error?: Error) => unknown;
    write: (chunk: string | Buffer) => boolean;
    end: (chunk?: string | Buffer) => unknown;
    emit: (event_name: string, ...event_args: unknown[]) => boolean;
  };

  request_emitter.setTimeout = (_timeout: number, _callback?: () => void) => request_emitter;
  request_emitter.destroy = (error?: Error) => {
    if (error) {
      request_emitter.emit("error", error);
    }
    return request_emitter;
  };
  request_emitter.write = (_chunk: string | Buffer) => true;
  request_emitter.end = () => request_emitter;

  return request_emitter as unknown as http.ClientRequest;
}

function CreateMockIncomingMessage(params: {
  status_code: number;
  status_message: string;
  headers: Record<string, string>;
  body: string;
}): http.IncomingMessage {
  const incoming_message = new EventEmitter() as http.IncomingMessage & {
    statusCode: number;
    statusMessage: string;
    headers: http.IncomingHttpHeaders;
  };
  incoming_message.statusCode = params.status_code;
  incoming_message.statusMessage = params.status_message;
  incoming_message.headers = params.headers;

  process.nextTick(() => {
    incoming_message.emit("data", Buffer.from(params.body));
    incoming_message.emit("end");
  });

  return incoming_message;
}

test("FetchHttpTransport applies ca_bundle_path to HTTPS agent.", async () => {
  const scratch_dir = mkdtempSync(join(tmpdir(), "proxmoxlib-fetch-transport-"));
  const ca_bundle_path = join(scratch_dir, "proxmox-ca.pem");
  const ca_bundle = "-----BEGIN CERTIFICATE-----\\ntransport-test-ca\\n-----END CERTIFICATE-----\\n";
  writeFileSync(ca_bundle_path, ca_bundle);

  let captured_options: https.RequestOptions | undefined;
  const https_request_stub = ((
    _url: URL | string,
    options: https.RequestOptions | undefined,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest => {
    captured_options = options;
    if (callback) {
      callback(CreateMockIncomingMessage({
        status_code: 200,
        status_message: "OK",
        headers: { "content-type": "application/json" },
        body: "{\"data\":\"ok\"}",
      }));
    }
    return CreateMockClientRequest();
  }) as typeof https.request;

  try {
    const transport = new FetchHttpTransport({
      keep_alive_ms_default: 30000,
      https_request_impl: https_request_stub,
    });
    const response = await transport.request({
      request: {
        method: "GET",
        path: "/api2/json/version",
      },
      context: {
        base_url: "https://proxmox.internal:8006",
        verify_tls: true,
        keep_alive_ms: 30000,
        ca_bundle_path,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(captured_options !== undefined, true);
    assert.equal(captured_options?.agent instanceof https.Agent, true);
    const agent = captured_options?.agent as https.Agent & {
      options?: {
        ca?: string;
        rejectUnauthorized?: boolean;
      };
    };
    assert.equal(agent.options?.ca, ca_bundle);
    assert.equal(agent.options?.rejectUnauthorized, true);
  } finally {
    rmSync(scratch_dir, { recursive: true, force: true });
  }
});

test("FetchHttpTransport reports transport error when ca_bundle_path cannot be read.", async () => {
  const transport = new FetchHttpTransport({
    keep_alive_ms_default: 30000,
  });

  await assert.rejects(
    async () => transport.request({
      request: {
        method: "GET",
        path: "/api2/json/version",
      },
      context: {
        base_url: "https://proxmox.internal:8006",
        verify_tls: true,
        keep_alive_ms: 30000,
        ca_bundle_path: "/nonexistent/path/proxmox-ca.pem",
      },
    }),
    {
      name: "ProxmoxTransportError",
      message: "Request to Proxmox host failed.",
    },
  );
});

test("FetchHttpTransport supports verify_tls false for HTTPS requests.", async () => {
  let captured_options: https.RequestOptions | undefined;
  const https_request_stub = ((
    _url: URL | string,
    options: https.RequestOptions | undefined,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest => {
    captured_options = options;
    if (callback) {
      callback(CreateMockIncomingMessage({
        status_code: 200,
        status_message: "OK",
        headers: { "content-type": "application/json" },
        body: "{\"data\":\"ok\"}",
      }));
    }
    return CreateMockClientRequest();
  }) as typeof https.request;

  const transport = new FetchHttpTransport({
    keep_alive_ms_default: 30000,
    https_request_impl: https_request_stub,
  });
  const response = await transport.request({
    request: {
      method: "GET",
      path: "/api2/json/version",
    },
    context: {
      base_url: "https://proxmox.internal:8006",
      verify_tls: false,
      keep_alive_ms: 30000,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(captured_options?.agent instanceof https.Agent, true);
  const agent = captured_options?.agent as https.Agent & {
    options?: {
      rejectUnauthorized?: boolean;
    };
  };
  assert.equal(agent.options?.rejectUnauthorized, false);
});

test("FetchHttpTransport avoids TLS-only options for HTTP requests.", async () => {
  let captured_options: http.RequestOptions | undefined;
  const http_request_stub = ((
    _url: URL | string,
    options: http.RequestOptions | undefined,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest => {
    captured_options = options;
    if (callback) {
      callback(CreateMockIncomingMessage({
        status_code: 200,
        status_message: "OK",
        headers: { "content-type": "application/json" },
        body: "{\"data\":\"ok\"}",
      }));
    }
    return CreateMockClientRequest();
  }) as typeof http.request;

  const transport = new FetchHttpTransport({
    keep_alive_ms_default: 30000,
    http_request_impl: http_request_stub,
  });
  const response = await transport.request({
    request: {
      method: "GET",
      path: "/api2/json/version",
    },
    context: {
      base_url: "http://proxmox.internal:8006",
      verify_tls: true,
      keep_alive_ms: 30000,
    },
  });

  assert.equal(response.status, 200);
  assert.equal(captured_options?.agent instanceof http.Agent, true);
  const agent = captured_options?.agent as http.Agent & {
    options?: {
      rejectUnauthorized?: boolean;
      ca?: string;
    };
  };
  assert.equal(agent.options?.rejectUnauthorized, undefined);
  assert.equal(agent.options?.ca, undefined);
});

test("FetchHttpTransport sets content-length for JSON request bodies to avoid chunked encoding.", async () => {
  let captured_options: http.RequestOptions | undefined;
  const http_request_stub = ((
    _url: URL | string,
    options: http.RequestOptions | undefined,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest => {
    captured_options = options;
    if (callback) {
      callback(CreateMockIncomingMessage({
        status_code: 200,
        status_message: "OK",
        headers: { "content-type": "application/json" },
        body: "{\"data\":\"ok\"}",
      }));
    }
    return CreateMockClientRequest();
  }) as typeof http.request;

  const transport = new FetchHttpTransport({
    keep_alive_ms_default: 30000,
    http_request_impl: http_request_stub,
  });

  await transport.request({
    request: {
      method: "POST",
      path: "/api2/json/nodes/node-a/lxc",
      body: {
        hostname: "ct.example",
        rootfs: "local-lvm:8",
      },
    },
    context: {
      base_url: "http://proxmox.internal:8006",
      verify_tls: true,
      keep_alive_ms: 30000,
    },
  });

  const headers = captured_options?.headers as Record<string, string> | undefined;
  assert.equal(typeof headers?.["content-length"], "string");
  assert.equal(Number.parseInt(headers?.["content-length"] ?? "", 10) > 0, true);
  assert.equal(headers?.["content-type"], "application/json");
});
