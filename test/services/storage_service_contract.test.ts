import assert from "node:assert";
import { EventEmitter } from "node:events";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import * as http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { StorageService } from "../../src/services/storage_service";
import { proxmox_access_privilege_check_response_t } from "../../src/types/proxmox_service_types";

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
  public response_data: unknown = [];

  public resolveNode(): proxmox_node_connection_i {
    return {
      node_id: "node-a",
      host: "127.0.0.1",
      protocol: "https",
      port: 8006,
      verify_tls: false,
      auth_provider: new FakeAuthProvider(),
    };
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    this.requests.push(params);
    return {
      data: this.response_data as T,
      success: true,
      status_code: 200,
    };
  }
}

class FakeAccessService {
  public current_calls: Array<{ path: string; privilege: string }> = [];
  public target_calls: Array<{ path: string; auth_id: string; privilege: string }> = [];

  public async hasCurrentPrivilege(params: {
    path: string;
    privilege: string;
  }): Promise<proxmox_access_privilege_check_response_t> {
    this.current_calls.push(params);
    return {
      status_code: 200,
      success: true,
      data: {
        requested_path: params.path,
        identity: "current",
        privilege: params.privilege,
        allowed: true,
        privileges: {
          [params.privilege]: true,
        },
      },
    };
  }

  public async hasIdentityPrivilege(params: {
    path: string;
    auth_id: string;
    privilege: string;
  }): Promise<proxmox_access_privilege_check_response_t> {
    this.target_calls.push(params);
    return {
      status_code: 200,
      success: true,
      data: {
        requested_path: params.path,
        identity: "target",
        auth_id: params.auth_id,
        privilege: params.privilege,
        allowed: true,
        privileges: {
          [params.privilege]: true,
        },
      },
    };
  }
}

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

test("StorageService listBackups/listIsoImages/listCtTemplates build expected request paths and filters.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = [
    {
      volid: "local:backup/vzdump-qemu-100.vma.zst",
      content: "backup",
      size: 1234,
    },
  ];
  const service = new StorageService({
    request_client,
  });

  await service.listBackups({
    node_id: "node-a",
    storage: "local",
    vmid: 100,
  });
  await service.listIsoImages({
    node_id: "node-a",
    storage: "local",
  });
  await service.listCtTemplates({
    node_id: "node-a",
    storage: "local",
  });

  assert.equal(request_client.requests.length, 3);
  const backups_request = request_client.requests[0];
  const iso_request = request_client.requests[1];
  const template_request = request_client.requests[2];

  assert.equal(backups_request.path, "/api2/json/nodes/node-a/storage/local/content");
  assert.equal((backups_request.query as Record<string, string>).content, "backup");
  assert.equal((backups_request.query as Record<string, string>).vmid, "100");
  assert.equal((iso_request.query as Record<string, string>).content, "iso");
  assert.equal((template_request.query as Record<string, string>).content, "vztmpl");
});

test("StorageService listTemplateCatalog builds expected path/query and normalizes response.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = [
    {
      package: "ubuntu-24.04-standard",
      version: "24.04-2",
      section: "system",
      type: "tar.zst",
      arch: "amd64",
      description: "Ubuntu container template",
      checksum: "abc123",
      url: "http://download.example/templates/ubuntu.tar.zst",
      size: "1024",
      unexpected_field: "preserved-in-raw",
    },
    "not-an-object",
    null,
    {
      pkgname: "fedora-43-default",
      desc: "Fedora default template",
      source: "pveam",
    },
  ];
  const service = new StorageService({
    request_client,
  });

  const response = await service.listTemplateCatalog({
    node_id: "node-a",
  });

  assert.equal(request_client.requests.length, 1);
  const request = request_client.requests[0];
  assert.equal(request.path, "/api2/json/nodes/node-a/aplinfo");
  assert.equal(request.query, undefined);
  assert.equal(response.data.length, 2);
  assert.equal(response.data[0].package, "ubuntu-24.04-standard");
  assert.equal(response.data[0].version, "24.04-2");
  assert.equal(response.data[0].section, "system");
  assert.equal(response.data[0].type, "tar.zst");
  assert.equal(response.data[0].arch, "amd64");
  assert.equal(response.data[0].description, "Ubuntu container template");
  assert.equal(response.data[0].size, 1024);
  assert.equal(
    (response.data[0].raw as Record<string, unknown>).unexpected_field,
    "preserved-in-raw",
  );
  assert.equal(response.data[1].package, "fedora-43-default");
  assert.equal(response.data[1].description, "Fedora default template");
});

test("StorageService listTemplateCatalog supports section filter query.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = [];
  const service = new StorageService({
    request_client,
  });

  await service.listTemplateCatalog({
    node_id: "node-a",
    section: "system",
  });

  const request = request_client.requests.at(-1) as proxmox_request_i;
  assert.equal(request.path, "/api2/json/nodes/node-a/aplinfo");
  assert.equal((request.query as Record<string, string>).section, "system");
});

test("StorageService deleteContent returns typed task response and request construction.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = "UPID:node-a:200:abcd";
  const service = new StorageService({
    request_client,
  });

  const response = await service.deleteContent({
    node_id: "node-a",
    storage: "local",
    volume_id: "local:iso/debian.iso",
    delay: 15,
  });

  assert.equal(response.data.operation, "delete_content");
  assert.equal(response.data.task_id, "UPID:node-a:200:abcd");
  const request = request_client.requests.at(-1) as proxmox_request_i;
  assert.equal(request.method, "DELETE");
  assert.equal(
    request.path,
    "/api2/json/nodes/node-a/storage/local/content/local%3Aiso%2Fdebian.iso",
  );
  assert.equal((request.query as Record<string, string>).delay, "15");
});

test("StorageService permission helpers resolve storage ACL path and call current/target checks.", async () => {
  const request_client = new FakeRequestClient();
  const access_service = new FakeAccessService();
  const service = new StorageService({
    request_client,
    access_service,
  });

  await service.canAuditStorage({
    node_id: "node-a",
    storage: "local",
  });
  await service.canAllocateSpace({
    node_id: "node-a",
    storage: "local",
    auth_id: "root@pam!automation",
  });

  assert.equal(access_service.current_calls.length, 1);
  assert.equal(access_service.current_calls[0].path, "/storage/local");
  assert.equal(access_service.current_calls[0].privilege, "Datastore.Audit");
  assert.equal(access_service.target_calls.length, 1);
  assert.equal(access_service.target_calls[0].path, "/storage/local");
  assert.equal(access_service.target_calls[0].auth_id, "root@pam!automation");
  assert.equal(access_service.target_calls[0].privilege, "Datastore.AllocateSpace");
});

test("StorageService validates required input fields.", async () => {
  const request_client = new FakeRequestClient();
  const service = new StorageService({
    request_client,
  });

  await assert.rejects(
    async () => service.listStorageContent({
      node_id: " ",
      storage: "local",
    }),
    {
      name: "ProxmoxValidationError",
    },
  );

  await assert.rejects(
    async () => service.deleteContent({
      node_id: "node-a",
      storage: " ",
      volume_id: "local:iso/debian.iso",
    }),
    {
      name: "ProxmoxValidationError",
    },
  );

  await assert.rejects(
    async () => service.listTemplateCatalog({
      node_id: " ",
    }),
    {
      name: "ProxmoxValidationError",
    },
  );

  await assert.rejects(
    async () => service.listTemplateCatalog({
      node_id: "node-a",
      section: " ",
    }),
    {
      name: "ProxmoxValidationError",
    },
  );
});

test("StorageService uploadContent builds multipart request and resolves task id.", async () => {
  const scratch_dir = mkdtempSync(join(tmpdir(), "proxmoxlib-storage-upload-"));
  const upload_file_path = join(scratch_dir, "debian.iso");
  writeFileSync(upload_file_path, Buffer.from("fake-iso-content"));

  let captured_method = "";
  let captured_url = "";
  let captured_headers: unknown = {};
  let body_bytes = 0;
  const https_request_stub = ((
    url: URL | string,
    options: http.RequestOptions | undefined,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest => {
    captured_method = String(options?.method ?? "");
    captured_url = String(url);
    captured_headers = options?.headers;

    const request = CreateMockClientRequest() as unknown as {
      write: (chunk: string | Buffer) => boolean;
      end: () => unknown;
    };
    request.write = (chunk: string | Buffer) => {
      body_bytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      return true;
    };
    request.end = () => {
      if (callback) {
        callback(CreateMockIncomingMessage({
          status_code: 200,
          status_message: "OK",
          headers: { "content-type": "application/json" },
          body: "{\"data\":\"UPID:node-a:301:upload\"}",
        }));
      }
      return request;
    };
    return request as unknown as http.ClientRequest;
  }) as typeof http.request;

  const request_client = new FakeRequestClient();
  const service = new StorageService({
    request_client,
    https_request_impl: https_request_stub as unknown as typeof import("node:https").request,
  });

  try {
    const response = await service.uploadContent({
      node_id: "node-a",
      storage: "local",
      content_type: "iso",
      file_path: upload_file_path,
      filename: "custom.iso",
    });

    assert.equal(response.data.operation, "upload_content");
    assert.equal(response.data.task_id, "UPID:node-a:301:upload");
    assert.equal(captured_method, "POST");
    assert.equal(
      captured_url.includes("/api2/json/nodes/node-a/storage/local/upload"),
      true,
    );
    const normalized_headers = (captured_headers ?? {}) as http.OutgoingHttpHeaders;
    assert.equal(String(normalized_headers.Authorization).startsWith("PVEAPIToken "), true);
    assert.equal(String(normalized_headers["Content-Type"]).includes("multipart/form-data"), true);
    assert.equal(body_bytes > 0, true);
  } finally {
    rmSync(scratch_dir, { recursive: true, force: true });
  }
});

test("StorageService downloadContent streams file data to destination and enforces overwrite policy.", async () => {
  const scratch_dir = mkdtempSync(join(tmpdir(), "proxmoxlib-storage-download-"));
  const destination_path = join(scratch_dir, "downloaded.iso");

  const https_request_stub = ((
    _url: URL | string,
    _options: http.RequestOptions | undefined,
    callback?: (res: http.IncomingMessage) => void,
  ): http.ClientRequest => {
    if (callback) {
      const response = new EventEmitter() as http.IncomingMessage & {
        statusCode: number;
        statusMessage: string;
        headers: http.IncomingHttpHeaders;
        pipe: <T extends NodeJS.WritableStream>(destination: T) => T;
      };
      response.statusCode = 200;
      response.statusMessage = "OK";
      response.headers = {};
      response.pipe = (<T extends NodeJS.WritableStream>(destination: T): T => {
        destination.write(Buffer.from("download-content"));
        destination.end();
        return destination;
      });
      callback(response);
    }
    return CreateMockClientRequest();
  }) as typeof http.request;

  const request_client = new FakeRequestClient();
  const service = new StorageService({
    request_client,
    https_request_impl: https_request_stub as unknown as typeof import("node:https").request,
  });

  try {
    const response = await service.downloadContent({
      node_id: "node-a",
      storage: "local",
      volume_id: "local:iso/debian.iso",
      destination_path,
      overwrite: false,
    });

    assert.equal(response.data.bytes_written > 0, true);
    assert.equal(readFileSync(destination_path, "utf8"), "download-content");

    await assert.rejects(
      async () => service.downloadContent({
        node_id: "node-a",
        storage: "local",
        volume_id: "local:iso/debian.iso",
        destination_path,
        overwrite: false,
      }),
      {
        name: "ProxmoxValidationError",
      },
    );
  } finally {
    rmSync(scratch_dir, { recursive: true, force: true });
  }
});
