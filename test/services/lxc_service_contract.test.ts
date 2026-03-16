import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { proxmox_lxc_shell_backend_i } from "../../src/core/lxc_shell/lxc_shell_backend";
import { LxcService } from "../../src/services/lxc_service";
import { ProxmoxLxcUploadError } from "../../src/errors/proxmox_error";
import {
  proxmox_lxc_run_command_result_t,
  proxmox_lxc_upload_directory_result_t,
  proxmox_lxc_upload_file_result_t,
  proxmox_lxc_terminal_event_t,
  proxmox_lxc_terminal_session_t,
} from "../../src/types/proxmox_service_types";

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

  public isPrivilegedOperationEnabled(): boolean {
    return false;
  }

  public resolveNode(): proxmox_node_connection_i {
    return {
      node_id: "node-a",
      host: "pve-a.local",
      protocol: "https",
      verify_tls: true,
      auth_provider: new FakeAuthProvider(),
      shell_backend: "ssh_pct",
      ssh_shell: {
        username: "root",
        password_auth: {
          provider: "env",
          env_var: "PROXMOX_TEST_SSH_PASSWORD",
        },
      },
    };
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    this.requests.push(params);
    if (params.path.includes("/status/current")) {
      return {
        data: {
          vmid: "105",
          status: "running",
        } as T,
        success: true,
        status_code: 200,
      };
    }
    return {
      data: "UPID:node-a:200:dcba" as T,
      success: true,
      status_code: 200,
    };
  }
}

interface fake_terminal_runtime_i {
  session: proxmox_lxc_terminal_session_t;
  events: proxmox_lxc_terminal_event_t[];
}

class FakeSshShellBackend implements proxmox_lxc_shell_backend_i {
  private readonly terminal_sessions: Map<string, fake_terminal_runtime_i>;
  public upload_should_fail_conflict: boolean;
  public upload_should_fail_checksum: boolean;

  constructor() {
    this.terminal_sessions = new Map<string, fake_terminal_runtime_i>();
    this.upload_should_fail_conflict = false;
    this.upload_should_fail_checksum = false;
  }

  public async runCommand(params: {
    node_connection: proxmox_node_connection_i;
    command_input: {
      node_id: string;
      container_id: string;
      command_argv: string[];
      shell_mode: boolean;
      shell_command?: string;
      env?: Record<string, string>;
      cwd?: string;
      user?: string;
      stdin_text?: string;
      timeout_ms?: number;
      max_output_bytes?: number;
      fail_on_non_zero_exit?: boolean;
    };
  }): Promise<proxmox_lxc_run_command_result_t> {
    const session_id = `${params.command_input.node_id}:${params.command_input.container_id}:command`;
    return {
      session_id,
      node_id: params.command_input.node_id,
      container_id: params.command_input.container_id,
      command: params.command_input.command_argv.join(" "),
      execution_mode: "ssh_pct",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 15,
      succeeded: true,
      timed_out: false,
      exit_code: 0,
      stdout: "hello from container\n",
      stderr: "",
      combined_output: "hello from container\n",
      truncated_output: false,
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
  }

  public async openInteractiveSession(params: {
    node_connection: proxmox_node_connection_i;
    session_input: {
      node_id: string;
      container_id: string;
      command: string;
      columns: number;
      rows: number;
      timeout_ms?: number;
    };
  }): Promise<proxmox_lxc_terminal_session_t> {
    const session_id = `${params.session_input.node_id}:${params.session_input.container_id}:terminal`;
    const session: proxmox_lxc_terminal_session_t = {
      session_id,
      node_id: params.session_input.node_id,
      container_id: params.session_input.container_id,
      command: params.session_input.command,
      columns: params.session_input.columns,
      rows: params.session_input.rows,
      opened_at: new Date().toISOString(),
      status: "open",
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
    const events: proxmox_lxc_terminal_event_t[] = [
      {
        session_id,
        event_type: "open",
        timestamp_iso: new Date().toISOString(),
      },
    ];
    this.terminal_sessions.set(session_id, {
      session,
      events,
    });
    return { ...session };
  }

  public async uploadFile(params: {
    node_connection: proxmox_node_connection_i;
    upload_input: {
      node_id: string;
      container_id: string;
      source_file_path: string;
      target_file_path: string;
      owner_user?: string;
      owner_group?: string;
      mode_octal?: string;
      create_parent_directories: boolean;
      overwrite: boolean;
      verify_checksum: boolean;
      timeout_ms: number;
      chunk_size_bytes: number;
      high_water_mark_bytes: number;
    };
  }): Promise<proxmox_lxc_upload_file_result_t> {
    if (this.upload_should_fail_conflict) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_conflict",
        message: "Target exists.",
        details: {
          field: "target_file_path",
          value: params.upload_input.target_file_path,
        },
      });
    }
    if (this.upload_should_fail_checksum) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_checksum_mismatch",
        message: "Checksum mismatch.",
        details: {
          field: "verify_checksum",
        },
      });
    }
    return {
      session_id: `${params.upload_input.node_id}:${params.upload_input.container_id}:upload`,
      node_id: params.upload_input.node_id,
      container_id: params.upload_input.container_id,
      source_file_path: params.upload_input.source_file_path,
      target_file_path: params.upload_input.target_file_path,
      bytes_uploaded: 1024,
      elapsed_ms: 50,
      throughput_bytes_per_sec: 20480,
      overwrite: params.upload_input.overwrite,
      verify_checksum: params.upload_input.verify_checksum,
      checksum_source: params.upload_input.verify_checksum ? "a".repeat(64) : undefined,
      checksum_target: params.upload_input.verify_checksum ? "a".repeat(64) : undefined,
      retries: 0,
      truncated: false,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
  }

  public async uploadDirectory(params: {
    node_connection: proxmox_node_connection_i;
    upload_input: {
      node_id: string;
      container_id: string;
      source_directory_path: string;
      target_directory_path: string;
      create_parent_directories: boolean;
      overwrite: boolean;
      verify_checksum: boolean;
      timeout_ms: number;
      chunk_size_bytes: number;
      high_water_mark_bytes: number;
      include_patterns?: string[];
      exclude_patterns?: string[];
      pattern_mode: "regex" | "glob";
      symlink_policy: "skip" | "dereference" | "preserve";
      include_hidden: boolean;
    };
  }): Promise<proxmox_lxc_upload_directory_result_t> {
    if (this.upload_should_fail_conflict) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_conflict",
        message: "Target exists.",
        details: {
          field: "target_directory_path",
          value: params.upload_input.target_directory_path,
        },
      });
    }
    if (this.upload_should_fail_checksum) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_checksum_mismatch",
        message: "Checksum mismatch.",
        details: {
          field: "verify_checksum",
        },
      });
    }
    return {
      session_id: `${params.upload_input.node_id}:${params.upload_input.container_id}:upload_dir`,
      node_id: params.upload_input.node_id,
      container_id: params.upload_input.container_id,
      source_directory_path: params.upload_input.source_directory_path,
      target_directory_path: params.upload_input.target_directory_path,
      files_uploaded: 3,
      directories_created: 2,
      bytes_uploaded: 4096,
      elapsed_ms: 100,
      throughput_bytes_per_sec: 40960,
      skipped_count: 0,
      failed_count: 0,
      checksum_verified_count: params.upload_input.verify_checksum ? 3 : 0,
      overwrite: params.upload_input.overwrite,
      verify_checksum: params.upload_input.verify_checksum,
      checksum_source: params.upload_input.verify_checksum ? "b".repeat(64) : undefined,
      checksum_target: params.upload_input.verify_checksum ? "b".repeat(64) : undefined,
      retries: 0,
      truncated: false,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      failed_entries: [],
      metrics: {
        logical_bytes_uploaded: 4096,
        wire_bytes_uploaded: 2048,
        logical_throughput_bytes_per_sec: 40960,
        wire_throughput_bytes_per_sec: 20480,
        phase_timings: {
          prepare_ms: 10,
          manifest_ms: 10,
          archive_ms: 20,
          transfer_ms: 30,
          extract_ms: 20,
          checksum_ms: params.upload_input.verify_checksum ? 10 : 0,
          total_ms: 100,
        },
      },
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
  }

  public async sendInput(params: {
    session_id: string;
    input_text: string;
  }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.events.push({
      session_id: params.session_id,
      event_type: "output",
      output_chunk: params.input_text,
      timestamp_iso: new Date().toISOString(),
    });
  }

  public async resize(params: {
    session_id: string;
    columns: number;
    rows: number;
  }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.session.columns = params.columns;
    runtime.session.rows = params.rows;
  }

  public async readEvents(params: {
    session_id: string;
    max_events?: number;
  }): Promise<proxmox_lxc_terminal_event_t[]> {
    const runtime = this.resolveRuntime(params.session_id);
    const max_events = params.max_events === undefined
      ? runtime.events.length
      : Math.max(0, Math.floor(params.max_events));
    if (max_events === 0) {
      return [];
    }
    const selected_events = runtime.events.slice(0, max_events);
    runtime.events.splice(0, selected_events.length);
    return selected_events;
  }

  public async close(params: {
    session_id: string;
    reason?: string;
    code?: number;
  }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.session.status = "closed";
    runtime.session.closed_at = new Date().toISOString();
    runtime.events.push({
      session_id: params.session_id,
      event_type: "close",
      close_code: params.code ?? 1000,
      close_reason: params.reason ?? "test_close",
      timestamp_iso: runtime.session.closed_at,
    });
    this.terminal_sessions.delete(params.session_id);
  }

  public getSession(params: {
    session_id: string;
  }): proxmox_lxc_terminal_session_t | undefined {
    const runtime = this.terminal_sessions.get(params.session_id);
    if (!runtime) {
      return undefined;
    }
    return { ...runtime.session };
  }

  public ownsSession(session_id: string): boolean {
    return this.terminal_sessions.has(session_id);
  }

  private resolveRuntime(session_id: string): fake_terminal_runtime_i {
    const runtime = this.terminal_sessions.get(session_id);
    if (!runtime) {
      throw new Error(`Missing runtime for session: ${session_id}`);
    }
    return runtime;
  }
}

test("LXC create and start methods use typed request contracts and return task IDs.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const create_result = await service.createContainer({
    node_id: "node-a",
    container_id: 101,
    config: {
      hostname: "app-01",
      memory: 1024,
      ostemplate: "local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst",
    },
  });

  const create_request = request_client.requests.at(-1) as proxmox_request_i;
  const create_request_http = create_request as { method: string; path: string; body?: Record<string, unknown> };
  assert.equal(create_request_http.method, "POST");
  assert.equal(create_request_http.path, "/api2/json/nodes/node-a/lxc");
  assert.equal((create_request_http.body as Record<string, unknown>).vmid, "101");
  assert.equal(create_result.task_id, "UPID:node-a:200:dcba");
  assert.equal(create_result.operation, "create");

  const start_result = await service.startContainer({
    node_id: "node-a",
    container_id: 101,
    retry_allowed: true,
  });

  const start_request = request_client.requests.at(-1) as proxmox_request_i;
  const start_request_http = start_request as { method: string; path: string };
  assert.equal(start_request_http.method, "POST");
  assert.equal(start_request_http.path, "/api2/json/nodes/node-a/lxc/101/status/start");
  assert.equal(start_result.operation, "start");
});

test("runCommand validates input and returns SSH command result.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const result = await service.runCommand({
    node_id: "node-a",
    container_id: 101,
    command_argv: ["echo", "hello from container"],
    timeout_ms: 3000,
  });

  assert.equal(result.succeeded, true);
  assert.equal(result.exit_code, 0);
  assert.equal(result.stdout.includes("hello from container"), true);
  assert.equal(result.execution_mode, "ssh_pct");

  await assert.rejects(
    async () => service.runCommand({
      node_id: "node-a",
      container_id: 101,
      command_argv: [],
    }),
    {
      name: "ProxmoxValidationError",
      message: /command_argv/i,
    },
  );
});

test("openTerminalSession supports send, resize, read events, and close with SSH backend.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const session = await service.openTerminalSession({
    node_id: "node-a",
    container_id: 105,
    shell_mode: true,
    shell_command: "/bin/bash -il",
    columns: 140,
    rows: 45,
  });

  assert.equal(session.node_id, "node-a");
  assert.equal(session.container_id, "105");
  assert.equal(session.handshake.backend, "ssh_pct");

  await service.sendTerminalInput({
    session_id: session.session_id,
    input_text: "ls -la\n",
  });

  const resized_session = await service.resizeTerminal({
    session_id: session.session_id,
    columns: 180,
    rows: 50,
  });
  assert.equal(resized_session.columns, 180);
  assert.equal(resized_session.rows, 50);

  const events = await service.readTerminalEvents({
    session_id: session.session_id,
    max_events: 10,
  });
  assert.equal(events.some((event_record) => event_record.event_type === "open"), true);
  assert.equal(events.some((event_record) => event_record.event_type === "output"), true);

  await service.closeTerminalSession({
    session_id: session.session_id,
    reason: "test_complete",
    code: 1000,
  });

  await assert.rejects(
    async () => service.getTerminalSession({
      session_id: session.session_id,
    }),
    {
      name: "ProxmoxTerminalSessionError",
      message: /not found/i,
    },
  );
});

test("uploadFile validates request and returns typed upload metadata.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const upload_result = await service.uploadFile({
    node_id: "node-a",
    container_id: 105,
    source_file_path: "/tmp/sample-upload.txt",
    target_file_path: "/root/sample-upload.txt",
    verify_checksum: true,
    chunk_size_bytes: 128 * 1024,
    high_water_mark_bytes: 128 * 1024,
  });

  assert.equal(upload_result.node_id, "node-a");
  assert.equal(upload_result.container_id, "105");
  assert.equal(upload_result.bytes_uploaded > 0, true);
  assert.equal(upload_result.verify_checksum, true);
});

test("uploadFile rejects non-absolute target path.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.uploadFile({
      node_id: "node-a",
      container_id: 105,
      source_file_path: "/tmp/sample-upload.txt",
      target_file_path: "relative/path.txt",
    }),
    {
      name: "ProxmoxValidationError",
      message: /absolute path/i,
    },
  );
});

test("uploadFile surfaces overwrite=false conflict as typed upload error.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.upload_should_fail_conflict = true;
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.uploadFile({
      node_id: "node-a",
      container_id: 105,
      source_file_path: "/tmp/sample-upload.txt",
      target_file_path: "/root/sample-upload.txt",
      overwrite: false,
    }),
    {
      name: "ProxmoxLxcUploadError",
      message: /target exists/i,
    },
  );
});

test("uploadFile surfaces checksum mismatch as typed upload error.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.upload_should_fail_checksum = true;
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.uploadFile({
      node_id: "node-a",
      container_id: 105,
      source_file_path: "/tmp/sample-upload.txt",
      target_file_path: "/root/sample-upload.txt",
      verify_checksum: true,
    }),
    {
      name: "ProxmoxLxcUploadError",
      message: /checksum mismatch/i,
    },
  );
});

test("uploadDirectory validates request and returns typed upload metadata.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const upload_result = await service.uploadDirectory({
    node_id: "node-a",
    container_id: 105,
    source_directory_path: "/tmp/source-dir",
    target_directory_path: "/root/target-dir",
    verify_checksum: true,
      include_patterns: ["^nested/"],
      exclude_patterns: ["\\.tmp$"],
      pattern_mode: "regex",
      symlink_policy: "skip",
      include_hidden: true,
  });

  assert.equal(upload_result.node_id, "node-a");
  assert.equal(upload_result.container_id, "105");
  assert.equal(upload_result.files_uploaded > 0, true);
  assert.equal(upload_result.verify_checksum, true);
});

test("uploadDirectory rejects parent traversal in target path.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.uploadDirectory({
      node_id: "node-a",
      container_id: 105,
      source_directory_path: "/tmp/source-dir",
      target_directory_path: "/tmp/../etc",
    }),
    {
      name: "ProxmoxValidationError",
      message: /parent path traversal/i,
    },
  );
});

test("uploadDirectory accepts glob matcher mode and patterns.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const upload_result = await service.uploadDirectory({
    node_id: "node-a",
    container_id: 105,
    source_directory_path: "/tmp/source-dir",
    target_directory_path: "/root/target-dir",
    pattern_mode: "glob",
    include_patterns: ["nested/**", "root.txt"],
    exclude_patterns: ["**/*.tmp"],
    symlink_policy: "dereference",
  });

  assert.equal(upload_result.files_uploaded, 3);
});

test("uploadDirectory rejects invalid include regex patterns.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.uploadDirectory({
      node_id: "node-a",
      container_id: 105,
      source_directory_path: "/tmp/source-dir",
      target_directory_path: "/root/target-dir",
      include_patterns: ["("],
    }),
    {
      name: "ProxmoxValidationError",
      message: /invalid regex pattern/i,
    },
  );
});

test("uploadDirectory surfaces overwrite=false conflict as typed upload error.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.upload_should_fail_conflict = true;
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.uploadDirectory({
      node_id: "node-a",
      container_id: 105,
      source_directory_path: "/tmp/source-dir",
      target_directory_path: "/root/target-dir",
      overwrite: false,
    }),
    {
      name: "ProxmoxLxcUploadError",
      message: /target exists/i,
    },
  );
});
