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
import {
  proxmox_lxc_run_command_result_t,
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

  constructor() {
    this.terminal_sessions = new Map<string, fake_terminal_runtime_i>();
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
