import assert from "node:assert";
import test from "node:test";
import { LxcExpectService } from "../../src/services/lxc_expect_service";
import {
  ProxmoxExpectSessionClosedError,
  ProxmoxTerminalSessionError,
} from "../../src/errors/proxmox_error";
import { proxmox_lxc_terminal_event_t, proxmox_lxc_terminal_session_t } from "../../src/types/proxmox_service_types";

interface fake_terminal_action_i {
  type: "output" | "close";
  text?: string;
}

interface fake_terminal_runtime_i {
  session: proxmox_lxc_terminal_session_t;
  events: proxmox_lxc_terminal_event_t[];
}

class FakeExpectLxcService {
  private readonly runtimes: Map<string, fake_terminal_runtime_i>;
  private session_counter: number;
  public readonly sent_inputs: Array<{ session_id: string; input_text: string }>;
  public on_send_input?: (params: { session_id: string; input_text: string }) => fake_terminal_action_i[];
  public open_output_chunks: string[];

  constructor() {
    this.runtimes = new Map<string, fake_terminal_runtime_i>();
    this.session_counter = 0;
    this.sent_inputs = [];
    this.open_output_chunks = [];
  }

  public async openTerminalSession(params: {
    node_id: string;
    container_id: string | number;
    shell_mode?: boolean;
    shell_command?: string;
    columns?: number;
    rows?: number;
  }): Promise<proxmox_lxc_terminal_session_t> {
    this.session_counter += 1;
    const session_id = `fake-session-${this.session_counter}`;
    const session: proxmox_lxc_terminal_session_t = {
      session_id,
      node_id: params.node_id,
      container_id: String(params.container_id),
      command: params.shell_mode === true
        ? params.shell_command ?? "/bin/sh -il"
        : "/bin/sh -il",
      columns: params.columns ?? 120,
      rows: params.rows ?? 30,
      opened_at: new Date().toISOString(),
      status: "open",
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: "ssh://fake-node:22",
      },
    };
    const runtime: fake_terminal_runtime_i = {
      session,
      events: [
        {
          session_id,
          event_type: "open",
          timestamp_iso: new Date().toISOString(),
        },
      ],
    };
    for (const output_chunk of this.open_output_chunks) {
      runtime.events.push({
        session_id,
        event_type: "output",
        output_chunk,
        timestamp_iso: new Date().toISOString(),
      });
    }
    this.runtimes.set(session_id, runtime);
    return { ...session };
  }

  public async sendTerminalInput(params: { session_id: string; input_text: string }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    this.sent_inputs.push({
      session_id: params.session_id,
      input_text: params.input_text,
    });
    const actions = this.on_send_input?.({
      session_id: params.session_id,
      input_text: params.input_text,
    }) ?? [];
    for (const action of actions) {
      if (action.type === "output") {
        runtime.events.push({
          session_id: params.session_id,
          event_type: "output",
          output_chunk: action.text ?? "",
          timestamp_iso: new Date().toISOString(),
        });
        continue;
      }
      runtime.events.push({
        session_id: params.session_id,
        event_type: "close",
        close_code: 1000,
        close_reason: "script_close",
        timestamp_iso: new Date().toISOString(),
      });
      runtime.session.status = "closed";
      runtime.session.closed_at = new Date().toISOString();
    }
  }

  public async resizeTerminal(params: {
    session_id: string;
    columns: number;
    rows: number;
  }): Promise<proxmox_lxc_terminal_session_t> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.session.columns = params.columns;
    runtime.session.rows = params.rows;
    return { ...runtime.session };
  }

  public async readTerminalEvents(params: {
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
    const selected = runtime.events.slice(0, max_events);
    runtime.events.splice(0, selected.length);
    if (runtime.session.status === "closed" && runtime.events.length === 0) {
      this.runtimes.delete(params.session_id);
    }
    return selected;
  }

  public getTerminalSession(params: { session_id: string }): proxmox_lxc_terminal_session_t {
    const runtime = this.runtimes.get(params.session_id);
    if (!runtime) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "Terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: params.session_id,
        },
      });
    }
    return { ...runtime.session };
  }

  public async closeTerminalSession(params: {
    session_id: string;
    reason?: string;
    code?: number;
  }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.events.push({
      session_id: params.session_id,
      event_type: "close",
      close_code: params.code ?? 1000,
      close_reason: params.reason ?? "closed",
      timestamp_iso: new Date().toISOString(),
    });
    runtime.session.status = "closed";
    runtime.session.closed_at = new Date().toISOString();
    this.runtimes.delete(params.session_id);
  }

  public pushOutput(session_id: string, output_chunk: string): void {
    const runtime = this.resolveRuntime(session_id);
    runtime.events.push({
      session_id,
      event_type: "output",
      output_chunk,
      timestamp_iso: new Date().toISOString(),
    });
  }

  public pushClose(session_id: string): void {
    const runtime = this.resolveRuntime(session_id);
    runtime.events.push({
      session_id,
      event_type: "close",
      close_code: 1000,
      close_reason: "pushed_close",
      timestamp_iso: new Date().toISOString(),
    });
  }

  private resolveRuntime(session_id: string): fake_terminal_runtime_i {
    const runtime = this.runtimes.get(session_id);
    if (!runtime) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "Terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: session_id,
        },
      });
    }
    return runtime;
  }
}

test("LxcExpectService waitFor returns matched when output contains expected text.", async () => {
  const fake_lxc_service = new FakeExpectLxcService();
  const session = await fake_lxc_service.openTerminalSession({
    node_id: "node-a",
    container_id: 100,
  });
  fake_lxc_service.pushOutput(session.session_id, "hello expect world\n");

  const expect_service = new LxcExpectService({
    lxc_service: fake_lxc_service,
  });
  const result = await expect_service.waitFor({
    session_id: session.session_id,
    expect: {
      kind: "string",
      value: "expect world",
    },
    timeout_ms: 500,
    poll_interval_ms: 20,
  });

  assert.equal(result.status, "matched");
  assert.equal(result.matched, true);
  assert.equal(result.match?.matcher_kind, "string");
});

test("LxcExpectService waitFor returns timeout when expected text is absent.", async () => {
  const fake_lxc_service = new FakeExpectLxcService();
  const session = await fake_lxc_service.openTerminalSession({
    node_id: "node-a",
    container_id: 100,
  });
  const expect_service = new LxcExpectService({
    lxc_service: fake_lxc_service,
  });

  const result = await expect_service.waitFor({
    session_id: session.session_id,
    expect: {
      kind: "string",
      value: "never-arrives",
    },
    timeout_ms: 120,
    poll_interval_ms: 20,
  });

  assert.equal(result.status, "timeout");
  assert.equal(result.timed_out, true);
});

test("LxcExpectService runScript supports matcher-id branching.", async () => {
  const fake_lxc_service = new FakeExpectLxcService();
  fake_lxc_service.on_send_input = ({ input_text }): fake_terminal_action_i[] => {
    if (input_text.includes("check")) {
      return [{ type: "output", text: "MODE=B\n" }];
    }
    if (input_text.includes("branch-b")) {
      return [{ type: "output", text: "BRANCH_B_DONE\n" }];
    }
    return [];
  };
  const expect_service = new LxcExpectService({
    lxc_service: fake_lxc_service,
  });

  const script_result = await expect_service.runScript({
    target: {
      open_terminal_input: {
        node_id: "node-a",
        container_id: 100,
        shell_mode: true,
        shell_command: "/bin/sh -il",
      },
      close_on_finish: true,
    },
    script: {
      steps: [
        {
          step_id: "detect_mode",
          send_input: "check\n",
          expect: [
            { matcher_id: "mode_a", kind: "string", value: "MODE=A" },
            { matcher_id: "mode_b", kind: "string", value: "MODE=B" },
          ],
          next_step_by_matcher_id: {
            mode_a: "branch_a",
            mode_b: "branch_b",
          },
        },
        {
          step_id: "branch_a",
          send_input: "branch-a\n",
          expect: { kind: "string", value: "BRANCH_A_DONE" },
        },
        {
          step_id: "branch_b",
          send_input: "branch-b\n",
          expect: { kind: "string", value: "BRANCH_B_DONE" },
        },
      ],
      start_step_id: "detect_mode",
      default_timeout_ms: 500,
      default_poll_interval_ms: 20,
    },
  });

  assert.equal(script_result.succeeded, true);
  assert.equal(script_result.step_results.some((step) => step.step_id === "branch_b"), true);
  assert.equal(script_result.step_results.some((step) => step.step_id === "branch_a"), false);
});

test("LxcExpectService waitFor throws typed error when terminal closes mid-wait.", async () => {
  const fake_lxc_service = new FakeExpectLxcService();
  const session = await fake_lxc_service.openTerminalSession({
    node_id: "node-a",
    container_id: 100,
  });
  fake_lxc_service.pushClose(session.session_id);
  const expect_service = new LxcExpectService({
    lxc_service: fake_lxc_service,
  });

  await assert.rejects(
    async () => expect_service.waitFor({
      session_id: session.session_id,
      expect: { kind: "string", value: "anything" },
      timeout_ms: 400,
      poll_interval_ms: 20,
    }),
    (error: unknown): boolean => error instanceof ProxmoxExpectSessionClosedError,
  );
});

test("LxcExpectService runScript transcript uses bounded buffer and marks truncation.", async () => {
  const fake_lxc_service = new FakeExpectLxcService();
  const long_output = "x".repeat(4096);
  fake_lxc_service.on_send_input = (): fake_terminal_action_i[] => [
    { type: "output", text: long_output },
    { type: "output", text: "DONE\n" },
  ];
  const expect_service = new LxcExpectService({
    lxc_service: fake_lxc_service,
  });

  const result = await expect_service.runScript({
    target: {
      open_terminal_input: {
        node_id: "node-a",
        container_id: 100,
        shell_mode: true,
        shell_command: "/bin/sh -il",
      },
      close_on_finish: true,
    },
    script: {
      max_buffer_bytes: 512,
      steps: [
        {
          step_id: "long_output_step",
          send_input: "emit-long\n",
          expect: { kind: "string", value: "DONE" },
          timeout_ms: 500,
          poll_interval_ms: 20,
        },
      ],
    },
  });

  assert.equal(result.succeeded, true);
  assert.equal(result.transcript.truncated, true);
  const retained_text = result.transcript.entries.map((entry) => entry.text).join("");
  assert.equal(retained_text.includes("DONE"), true);
});

test("LxcExpectService runScript redacts sensitive input in transcript.", async () => {
  const fake_lxc_service = new FakeExpectLxcService();
  fake_lxc_service.on_send_input = (): fake_terminal_action_i[] => [
    { type: "output", text: "password accepted\n" },
  ];
  const expect_service = new LxcExpectService({
    lxc_service: fake_lxc_service,
  });

  const result = await expect_service.runScript({
    target: {
      open_terminal_input: {
        node_id: "node-a",
        container_id: 100,
        shell_mode: true,
        shell_command: "/bin/sh -il",
      },
      close_on_finish: true,
    },
    script: {
      steps: [
        {
          step_id: "enter_password",
          send_input: "super-secret-password\n",
          sensitive_input: true,
          expect: { kind: "string", value: "accepted" },
          timeout_ms: 500,
          poll_interval_ms: 20,
        },
      ],
    },
  });

  const input_entry = result.transcript.entries.find((entry) => entry.entry_type === "input");
  assert.equal(input_entry?.redacted, true);
  assert.equal(input_entry?.text, "[redacted]");
});

test("LxcExpectService supports login/menu style script sequencing.", async () => {
  const fake_lxc_service = new FakeExpectLxcService();
  fake_lxc_service.open_output_chunks = ["login: "];
  fake_lxc_service.on_send_input = ({ input_text }): fake_terminal_action_i[] => {
    const normalized_input = input_text.trim();
    if (normalized_input === "root") {
      return [{ type: "output", text: "Password: " }];
    }
    if (normalized_input === "passw0rd") {
      return [{ type: "output", text: "menu> " }];
    }
    if (normalized_input === "status") {
      return [{ type: "output", text: "system:ok\nmenu> " }];
    }
    if (normalized_input === "quit") {
      return [
        { type: "output", text: "bye\n" },
        { type: "close" },
      ];
    }
    return [];
  };
  const expect_service = new LxcExpectService({
    lxc_service: fake_lxc_service,
  });

  const result = await expect_service.runScript({
    target: {
      open_terminal_input: {
        node_id: "node-a",
        container_id: 100,
        shell_mode: true,
        shell_command: "/bin/sh -il",
      },
      close_on_finish: false,
    },
    script: {
      steps: [
        {
          step_id: "wait_login",
          expect: { kind: "string", value: "login:" },
        },
        {
          step_id: "send_user",
          send_input: "root\n",
          expect: { kind: "string", value: "Password:" },
        },
        {
          step_id: "send_password",
          send_input: "passw0rd\n",
          sensitive_input: true,
          expect: { kind: "string", value: "menu>" },
        },
        {
          step_id: "run_status",
          send_input: "status\n",
          expect: { kind: "string", value: "system:ok" },
        },
        {
          step_id: "quit",
          send_input: "quit\n",
          expect: { kind: "string", value: "bye" },
          fail_on_timeout: true,
        },
      ],
      default_timeout_ms: 500,
      default_poll_interval_ms: 20,
    },
  });

  assert.equal(result.succeeded, true);
  assert.equal(result.step_results.length, 5);
  assert.equal(result.step_results.every((entry) => entry.status === "matched"), true);
});
