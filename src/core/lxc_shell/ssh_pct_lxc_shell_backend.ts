import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client, ConnectConfig, ClientChannel } from "ssh2";
import { proxmox_auth_t, proxmox_ssh_shell_t } from "../../types/proxmox_config_types";
import { proxmox_node_connection_i } from "../request/proxmox_request_client";
import {
  ProxmoxCommandExitError,
  ProxmoxCommandTimeoutError,
  ProxmoxSshShellError,
  ProxmoxValidationError,
} from "../../errors/proxmox_error";
import {
  proxmox_lxc_run_command_result_t,
  proxmox_lxc_terminal_event_t,
  proxmox_lxc_terminal_session_t,
} from "../../types/proxmox_service_types";
import {
  proxmox_lxc_shell_backend_command_input_i,
  proxmox_lxc_shell_backend_i,
  proxmox_lxc_shell_backend_open_input_i,
} from "./lxc_shell_backend";
import { ResolveSopsToken } from "../auth/sops_token_resolver";
import { ResolveVaultToken } from "../auth/vault_token_resolver";

interface ssh_interactive_session_runtime_i {
  client: Client;
  channel: ClientChannel;
  session: proxmox_lxc_terminal_session_t;
  events: proxmox_lxc_terminal_event_t[];
  close_promise: Promise<void>;
  close_resolve: () => void;
  close_event_recorded: boolean;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_COMMAND_TIMEOUT_MS = 60000;
const DEFAULT_IDLE_TIMEOUT_MS = 180000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export class SshPctLxcShellBackend implements proxmox_lxc_shell_backend_i {
  private readonly interactive_sessions: Map<string, ssh_interactive_session_runtime_i>;

  constructor() {
    this.interactive_sessions = new Map<string, ssh_interactive_session_runtime_i>();
  }

  public async runCommand(params: {
    node_connection: proxmox_node_connection_i;
    command_input: proxmox_lxc_shell_backend_command_input_i;
  }): Promise<proxmox_lxc_run_command_result_t> {
    const ssh_shell = ResolveSshShellConfig(params.node_connection);
    const started_at_epoch_ms = Date.now();
    const command_preview = BuildSafeCommandPreview({
      command_argv: params.command_input.command_argv,
      shell_mode: params.command_input.shell_mode,
      shell_command: params.command_input.shell_command,
    });
    const command_timeout_ms = params.command_input.timeout_ms ?? ssh_shell.command_timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const max_output_bytes = params.command_input.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const shell_command = BuildContainerCommand(params.command_input);
    const wrapped_shell_command = `/bin/sh -lc ${ShellEscapeToken(shell_command)}`;
    const execute_command = `pct exec ${ShellEscapeToken(params.command_input.container_id)} -- ${wrapped_shell_command}`;

    const client = await ConnectSshClient({
      node_connection: params.node_connection,
      ssh_shell,
    });
    let timed_out = false;
    try {
      const command_result = await ExecuteSshCommand({
        client,
        command: execute_command,
        timeout_ms: command_timeout_ms,
        max_output_bytes,
        stdin_text: params.command_input.stdin_text,
        pty: false,
      });
      timed_out = command_result.timed_out;
      const finished_at_epoch_ms = Date.now();
      const result: proxmox_lxc_run_command_result_t = {
        session_id: BuildSshSessionId({
          node_id: params.command_input.node_id,
          container_id: params.command_input.container_id,
        }),
        node_id: params.command_input.node_id,
        container_id: params.command_input.container_id,
        command: command_preview,
        execution_mode: "ssh_pct",
        started_at: new Date(started_at_epoch_ms).toISOString(),
        finished_at: new Date(finished_at_epoch_ms).toISOString(),
        duration_ms: finished_at_epoch_ms - started_at_epoch_ms,
        succeeded: command_result.exit_code === 0,
        timed_out,
        exit_code: command_result.exit_code,
        stdout: command_result.stdout,
        stderr: command_result.stderr,
        combined_output: `${command_result.stdout}${command_result.stderr}`,
        truncated_output: command_result.truncated_output,
        handshake: {
          backend: "ssh_pct",
          transport: "ssh",
          task_id: undefined,
          user: ssh_shell.username,
          endpoint: `ssh://${params.node_connection.host}:${ssh_shell.port ?? 22}`,
        },
      };
      if (
        result.exit_code !== undefined
        && result.exit_code !== 0
        && params.command_input.fail_on_non_zero_exit !== false
      ) {
        throw new ProxmoxCommandExitError({
          code: "proxmox.lxc.command_non_zero_exit",
          message: `LXC command exited with status ${result.exit_code}.`,
          details: {
            field: "run_command.exit_code",
            value: String(result.exit_code),
          },
        });
      }
      return result;
    } finally {
      if (timed_out) {
        try {
          client.destroy();
        } catch {
          // no-op
        }
      } else {
        try {
          client.end();
        } catch {
          // no-op
        }
      }
    }
  }

  public async openInteractiveSession(params: {
    node_connection: proxmox_node_connection_i;
    session_input: proxmox_lxc_shell_backend_open_input_i;
  }): Promise<proxmox_lxc_terminal_session_t> {
    const ssh_shell = ResolveSshShellConfig(params.node_connection);
    const client = await ConnectSshClient({
      node_connection: params.node_connection,
      ssh_shell,
    });
    const session_id = BuildSshSessionId({
      node_id: params.session_input.node_id,
      container_id: params.session_input.container_id,
    });
    const session: proxmox_lxc_terminal_session_t = {
      session_id,
      node_id: params.session_input.node_id,
      container_id: params.session_input.container_id,
      command: params.session_input.command,
      columns: params.session_input.columns,
      rows: params.session_input.rows,
      opened_at: new Date().toISOString(),
      status: "opening",
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        task_id: undefined,
        user: ssh_shell.username,
        endpoint: `ssh://${params.node_connection.host}:${ssh_shell.port ?? 22}`,
      },
    };
    const events: proxmox_lxc_terminal_event_t[] = [];
    let close_resolve: () => void = (): void => undefined;
    const close_promise = new Promise<void>((resolve) => {
      close_resolve = resolve;
    });

    const channel = await OpenSshPtySession({
      client,
      command: `pct exec ${ShellEscapeToken(params.session_input.container_id)} -- /bin/sh -il`,
      columns: params.session_input.columns,
      rows: params.session_input.rows,
      timeout_ms: params.session_input.timeout_ms ?? ssh_shell.connect_timeout_ms ?? DEFAULT_CONNECT_TIMEOUT_MS,
    });

    const append_event = (event: proxmox_lxc_terminal_event_t): void => {
      events.push(event);
    };
    append_event({
      session_id,
      event_type: "open",
      timestamp_iso: new Date().toISOString(),
    });
    session.status = "open";

    channel.on("data", (chunk: Buffer | string) => {
      append_event({
        session_id,
        event_type: "output",
        output_chunk: NormalizeChunk(chunk),
        timestamp_iso: new Date().toISOString(),
      });
    });
    channel.stderr.on("data", (chunk: Buffer | string) => {
      append_event({
        session_id,
        event_type: "output",
        output_chunk: NormalizeChunk(chunk),
        timestamp_iso: new Date().toISOString(),
      });
    });
    channel.on("error", (error: Error) => {
      session.status = "error";
      append_event({
        session_id,
        event_type: "error",
        error_message: error.message,
        timestamp_iso: new Date().toISOString(),
      });
    });
    channel.on("close", () => {
      if (session.status !== "error") {
        session.status = "closed";
      }
      session.closed_at = new Date().toISOString();
      const runtime = this.interactive_sessions.get(session_id);
      if (runtime && !runtime.close_event_recorded) {
        runtime.close_event_recorded = true;
        append_event({
          session_id,
          event_type: "close",
          close_code: 1000,
          close_reason: "ssh_channel_closed",
          timestamp_iso: session.closed_at,
        });
      }
      close_resolve();
      client.end();
    });
    client.on("error", (error: Error) => {
      if (session.status === "closed") {
        return;
      }
      session.status = "error";
      append_event({
        session_id,
        event_type: "error",
        error_message: error.message,
        timestamp_iso: new Date().toISOString(),
      });
    });
    client.on("close", () => {
      if (session.status === "closed") {
        return;
      }
      session.status = "closed";
      session.closed_at = new Date().toISOString();
      const runtime = this.interactive_sessions.get(session_id);
      if (runtime && !runtime.close_event_recorded) {
        runtime.close_event_recorded = true;
        append_event({
          session_id,
          event_type: "close",
          close_code: 1000,
          close_reason: "ssh_connection_closed",
          timestamp_iso: session.closed_at,
        });
      }
      close_resolve();
    });

    this.interactive_sessions.set(session_id, {
      client,
      channel,
      session,
      events,
      close_promise,
      close_resolve,
      close_event_recorded: false,
    });
    return { ...session };
  }

  public async sendInput(params: {
    session_id: string;
    input_text: string;
  }): Promise<void> {
    const runtime = this.resolveInteractiveRuntime(params.session_id);
    const normalized_input_text = NormalizeInteractiveInputText(params.input_text);
    await new Promise<void>((resolve, reject) => {
      runtime.channel.write(normalized_input_text, (error?: Error | null) => {
        if (error) {
          reject(new ProxmoxSshShellError({
            code: "proxmox.ssh.session_io_failed",
            message: "Failed to write to SSH interactive session.",
            details: {
              field: "ssh.channel.write",
              value: params.session_id,
            },
            cause: error,
          }));
          return;
        }
        resolve();
      });
    });
  }

  public async resize(params: {
    session_id: string;
    columns: number;
    rows: number;
  }): Promise<void> {
    const runtime = this.resolveInteractiveRuntime(params.session_id);
    runtime.channel.setWindow(params.rows, params.columns, 0, 0);
    runtime.session.columns = params.columns;
    runtime.session.rows = params.rows;
  }

  public async readEvents(params: {
    session_id: string;
    max_events?: number;
  }): Promise<proxmox_lxc_terminal_event_t[]> {
    const runtime = this.resolveInteractiveRuntime(params.session_id);
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
    const runtime = this.resolveInteractiveRuntime(params.session_id);
    const close_reason = params.reason ?? "client_requested_close";
    try {
      runtime.channel.end("exit\n");
      runtime.channel.close();
    } catch {
      // no-op
    }
    const closed_at = runtime.session.closed_at ?? new Date().toISOString();
    runtime.session.status = "closed";
    runtime.session.closed_at = closed_at;
    if (!runtime.close_event_recorded) {
      runtime.close_event_recorded = true;
      runtime.events.push({
        session_id: params.session_id,
        event_type: "close",
        close_code: params.code ?? 1000,
        close_reason,
        timestamp_iso: closed_at,
      });
    }
    runtime.close_resolve();
    runtime.client.end();
    this.interactive_sessions.delete(params.session_id);
    await Promise.resolve(runtime.close_promise);
  }

  public getSession(params: { session_id: string }): proxmox_lxc_terminal_session_t | undefined {
    const runtime = this.interactive_sessions.get(params.session_id);
    if (!runtime) {
      return undefined;
    }
    return { ...runtime.session };
  }

  public ownsSession(session_id: string): boolean {
    return this.interactive_sessions.has(session_id);
  }

  private resolveInteractiveRuntime(session_id: string): ssh_interactive_session_runtime_i {
    const runtime = this.interactive_sessions.get(session_id);
    if (!runtime) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "SSH interactive session was not found.",
        details: {
          field: "session_id",
          value: session_id,
        },
      });
    }
    return runtime;
  }
}

async function ConnectSshClient(params: {
  node_connection: proxmox_node_connection_i;
  ssh_shell: proxmox_ssh_shell_t;
}): Promise<Client> {
  const connect_config = await BuildConnectConfig(params);
  const client = new Client();
  return new Promise<Client>((resolve, reject) => {
    let resolved = false;
    client.on("ready", () => {
      resolved = true;
      resolve(client);
    });
    client.on("error", (error: Error) => {
      if (resolved) {
        return;
      }
      reject(MapSshConnectError(error));
    });
    client.on("close", () => {
      if (!resolved) {
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.connection_failed",
          message: "SSH connection closed before becoming ready.",
          details: {
            field: "ssh.connection",
            value: params.node_connection.node_id,
          },
        }));
      }
    });
    client.connect(connect_config);
  });
}

async function OpenSshPtySession(params: {
  client: Client;
  command: string;
  columns: number;
  rows: number;
  timeout_ms: number;
}): Promise<ClientChannel> {
  return new Promise<ClientChannel>((resolve, reject) => {
    let timed_out = false;
    const timeout_handle = setTimeout(() => {
      timed_out = true;
      reject(new ProxmoxSshShellError({
        code: "proxmox.ssh.session_open_failed",
        message: "Timed out while opening SSH PTY session.",
        details: {
          field: "ssh.exec.timeout_ms",
          value: String(params.timeout_ms),
        },
      }));
    }, Math.max(250, params.timeout_ms));
    params.client.exec(params.command, {
      pty: {
        cols: params.columns,
        rows: params.rows,
        term: "xterm-256color",
      },
    }, (error, channel) => {
      if (timed_out) {
        return;
      }
      clearTimeout(timeout_handle);
      if (error) {
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.session_open_failed",
          message: "Failed to open SSH PTY session.",
          details: {
            field: "ssh.exec",
          },
          cause: error,
        }));
        return;
      }
      resolve(channel);
    });
  });
}

async function ExecuteSshCommand(params: {
  client: Client;
  command: string;
  timeout_ms: number;
  max_output_bytes: number;
  stdin_text?: string;
  pty: boolean;
}): Promise<{
  stdout: string;
  stderr: string;
  exit_code?: number;
  truncated_output: boolean;
  timed_out: boolean;
}> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let exit_code: number | undefined;
    let truncated_output = false;
    let resolved = false;
    let timed_out = false;
    const timeout_handle = setTimeout(() => {
      timed_out = true;
      reject(new ProxmoxCommandTimeoutError({
        code: "proxmox.lxc.command_timeout",
        message: "SSH command timed out.",
        details: {
          field: "ssh.command.timeout_ms",
          value: String(params.timeout_ms),
        },
      }));
    }, Math.max(250, params.timeout_ms));

    const on_exec = (error: Error | undefined, channel: ClientChannel): void => {
      if (error) {
        clearTimeout(timeout_handle);
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.session_open_failed",
          message: "SSH command channel could not be opened.",
          details: {
            field: "ssh.exec",
          },
          cause: error,
        }));
        return;
      }

      const append_chunk = (target: "stdout" | "stderr", chunk: Buffer | string): void => {
        const chunk_text = NormalizeChunk(chunk);
        if (!chunk_text) {
          return;
        }
        const current_total = stdout.length + stderr.length;
        if (current_total >= params.max_output_bytes) {
          truncated_output = true;
          return;
        }
        const remaining = params.max_output_bytes - current_total;
        const selected_chunk = chunk_text.length > remaining
          ? chunk_text.slice(0, remaining)
          : chunk_text;
        if (selected_chunk.length < chunk_text.length) {
          truncated_output = true;
        }
        if (target === "stdout") {
          stdout += selected_chunk;
          return;
        }
        stderr += selected_chunk;
      };

      channel.on("data", (chunk: Buffer | string) => {
        append_chunk("stdout", chunk);
      });
      channel.stderr.on("data", (chunk: Buffer | string) => {
        append_chunk("stderr", chunk);
      });
      channel.on("exit", (code: number | null) => {
        if (typeof code === "number") {
          exit_code = code;
        }
      });
      channel.on("close", () => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout_handle);
        resolve({
          stdout,
          stderr,
          exit_code,
          truncated_output,
          timed_out,
        });
      });
      channel.on("error", (channel_error: Error) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout_handle);
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.session_io_failed",
          message: "SSH command channel reported an I/O error.",
          details: {
            field: "ssh.channel",
          },
          cause: channel_error,
        }));
      });

      if (params.stdin_text !== undefined && params.stdin_text.length > 0) {
        channel.write(params.stdin_text);
      }
      channel.end();
    };
    if (params.pty) {
      params.client.exec(params.command, {
        pty: {
          cols: 120,
          rows: 30,
          term: "xterm-256color",
        },
      }, on_exec);
      return;
    }
    params.client.exec(params.command, on_exec);
  });
}

async function BuildConnectConfig(params: {
  node_connection: proxmox_node_connection_i;
  ssh_shell: proxmox_ssh_shell_t;
}): Promise<ConnectConfig> {
  const host = params.ssh_shell.host ?? params.node_connection.host;
  const port = params.ssh_shell.port ?? 22;
  const username = params.ssh_shell.username;
  const ready_timeout = params.ssh_shell.connect_timeout_ms ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const config: ConnectConfig = {
    host,
    port,
    username,
    readyTimeout: ready_timeout,
    keepaliveInterval: Math.min(30000, params.ssh_shell.idle_timeout_ms ?? DEFAULT_IDLE_TIMEOUT_MS),
    keepaliveCountMax: 3,
  };

  if (params.ssh_shell.password_auth !== undefined) {
    config.password = await ResolveSecretFromAuth(params.ssh_shell.password_auth, "ssh.password_auth");
  }
  if (params.ssh_shell.private_key_auth !== undefined) {
    const private_key = await ResolveSecretFromAuth(params.ssh_shell.private_key_auth, "ssh.private_key_auth");
    config.privateKey = NormalizePrivateKeyValue(private_key);
  }
  if (params.ssh_shell.private_key_passphrase_auth !== undefined) {
    config.passphrase = await ResolveSecretFromAuth(
      params.ssh_shell.private_key_passphrase_auth,
      "ssh.private_key_passphrase_auth",
    );
  }

  const strict_host_key = params.ssh_shell.strict_host_key === true;
  const expected_fingerprint = NormalizeFingerprint(params.ssh_shell.host_fingerprint_sha256);
  if (strict_host_key && expected_fingerprint.length === 0) {
    throw new ProxmoxSshShellError({
      code: "proxmox.ssh.host_verification_failed",
      message: "strict_host_key is enabled but host_fingerprint_sha256 is missing.",
      details: {
        field: "ssh_shell.host_fingerprint_sha256",
        value: params.node_connection.node_id,
      },
    });
  }
  if (expected_fingerprint.length > 0) {
    config.hostHash = "sha256";
    config.hostVerifier = (key_hash: string): boolean => {
      const normalized_remote_hash = NormalizeFingerprint(key_hash);
      const allowed = normalized_remote_hash === expected_fingerprint;
      if (!allowed && strict_host_key) {
        throw new ProxmoxSshShellError({
          code: "proxmox.ssh.host_verification_failed",
          message: "SSH host fingerprint did not match configured fingerprint.",
          details: {
            field: "ssh_shell.host_fingerprint_sha256",
            value: params.node_connection.node_id,
          },
        });
      }
      return allowed || !strict_host_key;
    };
  }

  return config;
}

function ResolveSshShellConfig(node_connection: proxmox_node_connection_i): proxmox_ssh_shell_t {
  if (node_connection.ssh_shell === undefined) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "SSH shell backend is not configured for this node.",
      details: {
        field: "node.ssh_shell",
        value: node_connection.node_id,
      },
    });
  }
  return node_connection.ssh_shell;
}

async function ResolveSecretFromAuth(auth: proxmox_auth_t, field_name: string): Promise<string> {
  if (auth.provider === "env") {
    if (!auth.env_var || auth.env_var.trim().length === 0) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "env auth provider requires env_var for SSH secret.",
        details: {
          field: `${field_name}.env_var`,
        },
      });
    }
    const env_value = process.env[auth.env_var];
    if (!env_value || env_value.trim().length === 0) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "SSH secret env variable was missing or empty.",
        details: {
          field: auth.env_var,
        },
      });
    }
    return env_value;
  }

  if (auth.provider === "file") {
    if (!auth.file_path || auth.file_path.trim().length === 0) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "file auth provider requires file_path for SSH secret.",
        details: {
          field: `${field_name}.file_path`,
        },
      });
    }
    try {
      return readFileSync(auth.file_path, "utf8");
    } catch (error) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "Could not read SSH secret file.",
        details: {
          field: auth.file_path,
        },
        cause: error,
      });
    }
  }

  if (auth.provider === "vault") {
    return ResolveVaultToken({
      secret_ref: auth.secret_ref ?? "",
    });
  }

  if (auth.provider === "sops") {
    return ResolveSopsToken({
      secret_ref: auth.secret_ref ?? "",
    });
  }

  throw new ProxmoxSshShellError({
    code: "proxmox.ssh.auth_failed",
    message: "Unsupported SSH auth provider.",
    details: {
      field: `${field_name}.provider`,
      value: String(auth.provider),
    },
  });
}

function BuildContainerCommand(params: proxmox_lxc_shell_backend_command_input_i): string {
  let command = params.shell_mode
    ? (params.shell_command ?? "")
    : params.command_argv.map((token) => ShellEscapeToken(token)).join(" ");

  if (params.env && Object.keys(params.env).length > 0) {
    const env_segment = Object.entries(params.env)
      .map(([environment_name, environment_value]) => `${environment_name}=${ShellEscapeToken(environment_value)}`)
      .join(" ");
    command = `env ${env_segment} ${command}`;
  }
  if (params.cwd && params.cwd.length > 0) {
    command = `cd ${ShellEscapeToken(params.cwd)} && ${command}`;
  }
  if (params.user && params.user.length > 0) {
    command = `su -s /bin/sh -c ${ShellEscapeToken(command)} ${ShellEscapeToken(params.user)}`;
  }
  return command;
}

function BuildSafeCommandPreview(params: {
  command_argv: string[];
  shell_mode: boolean;
  shell_command?: string;
}): string {
  if (params.shell_mode) {
    return "[shell_command_redacted]";
  }
  return params.command_argv.join(" ");
}

function ShellEscapeToken(raw_token: string): string {
  const token = String(raw_token);
  return `'${token.replace(/'/g, `'\"'\"'`)}'`;
}

function BuildSshSessionId(params: {
  node_id: string;
  container_id: string;
}): string {
  const random_suffix = createHash("sha256")
    .update(`${params.node_id}:${params.container_id}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  return `sshpct:${params.node_id}:${params.container_id}:${random_suffix}`;
}

function NormalizeChunk(chunk: Buffer | string): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  return chunk.toString("utf8");
}

function NormalizeInteractiveInputText(raw_input_text: string): string {
  if (raw_input_text.length === 0) {
    return raw_input_text;
  }
  return raw_input_text.replace(/\r?\n/g, "\r\n");
}

function NormalizePrivateKeyValue(private_key: string): string {
  if (private_key.includes("\n")) {
    return private_key;
  }
  return private_key.replace(/\\n/g, "\n");
}

function NormalizeFingerprint(raw_fingerprint: string | undefined): string {
  if (!raw_fingerprint) {
    return "";
  }
  const trimmed = raw_fingerprint.trim();
  if (trimmed.toLowerCase().startsWith("sha256:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function MapSshConnectError(error: Error): ProxmoxSshShellError {
  const lowered_message = error.message.toLowerCase();
  if (
    lowered_message.includes("all configured authentication methods failed")
    || lowered_message.includes("permission denied")
    || lowered_message.includes("authentication")
  ) {
    return new ProxmoxSshShellError({
      code: "proxmox.ssh.auth_failed",
      message: "SSH authentication failed.",
      details: {
        field: "ssh.auth",
      },
      cause: error,
    });
  }
  if (lowered_message.includes("host verification failed") || lowered_message.includes("host fingerprint")) {
    return new ProxmoxSshShellError({
      code: "proxmox.ssh.host_verification_failed",
      message: "SSH host verification failed.",
      details: {
        field: "ssh.host_verification",
      },
      cause: error,
    });
  }
  return new ProxmoxSshShellError({
    code: "proxmox.ssh.connection_failed",
    message: "SSH connection to node failed.",
    details: {
      field: "ssh.connection",
    },
    cause: error,
  });
}
