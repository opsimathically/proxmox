import {
  proxmox_api_response_t,
  proxmox_http_method_t,
  proxmox_http_query_t,
  proxmox_http_request_t,
} from "../../types/proxmox_http_types";
import {
  proxmox_retry_policy_t,
  proxmox_lxc_shell_backend_t,
  proxmox_ssh_shell_t,
} from "../../types/proxmox_config_types";
import { proxmox_api_parser_i } from "../parser/proxmox_api_parser";
import { prox_mox_http_transport_i } from "../http/proxmox_http_transport_i";
import { BuildProxmoxUrl } from "../http/http_url_builder";
import { BuildAuthProvider } from "../auth/proxmox_auth_factory";
import { proxmox_auth_provider_i } from "../auth/auth_provider_i";
import {
  MapHttpStatusToProxmoxError,
  ProxmoxAuthError,
  ProxmoxError,
  ProxmoxPrivilegedFallbackError,
  ProxmoxValidationError,
} from "../../errors/proxmox_error";
import { EvaluateRetry } from "../retry/retry_policy";
import { SessionTicketAuthProvider } from "../auth/session_ticket_auth_provider";

export interface proxmox_node_connection_i {
  node_id: string;
  host: string;
  protocol: "http" | "https";
  port?: number;
  verify_tls: boolean;
  ca_bundle_path?: string;
  auth_provider: proxmox_auth_provider_i;
  privileged_ticket_provider?: SessionTicketAuthProvider;
  shell_backend?: proxmox_lxc_shell_backend_t;
  ssh_shell?: proxmox_ssh_shell_t;
}

export interface proxmox_request_client_input_i {
  transport: prox_mox_http_transport_i;
  parser: proxmox_api_parser_i;
  nodes: proxmox_node_connection_i[];
  retry_policy: proxmox_retry_policy_t;
  default_node_id?: string;
  request_timeout_ms: number;
  keep_alive_ms: number;
  default_headers?: Record<string, string>;
}

export interface proxmox_request_i {
  method: proxmox_http_method_t;
  path: string;
  node_id?: string;
  query?: proxmox_http_query_t;
  headers?: Record<string, string>;
  body?: unknown;
  timeout_ms?: number;
  retry_allowed?: boolean;
  auth_context?: "default" | "privileged";
}

export interface proxmox_request_client_i {
  request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>>;
  resolveNode(node_id?: string): proxmox_node_connection_i;
}

export class ProxmoxRequestClient implements proxmox_request_client_i {
  public readonly transport: prox_mox_http_transport_i;
  public readonly parser: proxmox_api_parser_i;
  public readonly nodes: proxmox_node_connection_i[];
  public readonly retry_policy: proxmox_retry_policy_t;
  public readonly request_timeout_ms: number;
  public readonly keep_alive_ms: number;
  public readonly default_headers?: Record<string, string>;
  public readonly default_node_id?: string;

  constructor(params: proxmox_request_client_input_i) {
    this.transport = params.transport;
    this.parser = params.parser;
    this.nodes = params.nodes;
    this.retry_policy = params.retry_policy;
    this.default_node_id = params.default_node_id;
    this.request_timeout_ms = params.request_timeout_ms;
    this.keep_alive_ms = params.keep_alive_ms;
    this.default_headers = params.default_headers;
  }

  public resolveNode(node_id?: string): proxmox_node_connection_i {
    if (this.nodes.length === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.config.cluster_not_found",
        message: "No nodes are available in the selected cluster.",
        details: {
          field: "cluster.nodes",
        },
      });
    }

    const requested_node_id = node_id === undefined || node_id.trim().length === 0
      ? this.default_node_id
      : node_id.trim();

    if (requested_node_id === undefined) {
      return this.nodes[0];
    }

    const selected_node = this.nodes.find((proxmox_node) => proxmox_node.node_id === requested_node_id);
    if (!selected_node) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.missing_input",
        message: "Requested node_id does not exist in cluster configuration.",
        details: {
          field: "node_id",
          value: requested_node_id,
        },
      });
    }

    return selected_node;
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    const use_privileged_auth = params.auth_context === "privileged";
    return this.sendWithRetry<T>({
      method: params.method,
      path: params.path,
      node_id: params.node_id,
      query: params.query,
      headers: params.headers,
      body: params.body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed,
      auth_context: params.auth_context,
      attempt_number: 1,
      use_privileged_auth,
      privileged_ticket_refresh_attempted: false,
    });
  }

  private async sendWithRetry<T>(params: proxmox_request_i & {
    attempt_number: number;
    use_privileged_auth: boolean;
    privileged_ticket_refresh_attempted: boolean;
  }): Promise<proxmox_api_response_t<T>> {
    const selected_node = this.resolveNode(params.node_id);
    const normalized_path = BuildApiPath(params.path);
    const request: proxmox_http_request_t = {
      method: params.method,
      path: normalized_path,
      query: params.query,
      headers: await this.buildHeaders({
        node: selected_node,
        headers: params.headers,
        request_method: params.method,
        use_privileged_auth: params.use_privileged_auth,
        force_privileged_refresh: params.privileged_ticket_refresh_attempted,
      }),
      body: params.body,
      timeout_ms: params.timeout_ms,
    };

    const request_url = BuildProxmoxUrl({
      protocol: selected_node.protocol,
      host: selected_node.host,
      port: selected_node.port,
      path: "",
    });

    const transport_context = {
      base_url: request_url,
      verify_tls: selected_node.verify_tls,
      keep_alive_ms: this.keep_alive_ms,
      ca_bundle_path: selected_node.ca_bundle_path,
      request_timeout_ms: this.request_timeout_ms,
    };

    try {
      const raw_response = await this.transport.request({
        request,
        context: transport_context,
      });

      if (raw_response.status < 200 || raw_response.status >= 300) {
        const parsed_error = this.parser.parseResponse<unknown>(raw_response);
        const message = ResolveErrorMessage({
          parsed_error,
          raw_status: raw_response.status,
          raw_body: raw_response.body,
        });
        throw MapHttpStatusToProxmoxError({
          status_code: raw_response.status,
          message,
          path: normalized_path,
          body: BuildSafeErrorCause({
            parsed_data: parsed_error.data,
            raw_body: raw_response.body,
          }),
        });
      }

      return this.parser.parseResponse<T>(raw_response);
    } catch (error) {
      if (
        params.use_privileged_auth
        && !params.privileged_ticket_refresh_attempted
        && ShouldRefreshPrivilegedSessionTicket(error)
      ) {
        return this.sendWithRetry<T>({
          ...params,
          attempt_number: 1,
          retry_allowed: false,
          use_privileged_auth: true,
          privileged_ticket_refresh_attempted: true,
        });
      }

      const should_retry = params.retry_allowed === false
        ? { should_retry: false, delay_ms: 0 }
        : EvaluateRetry({
        attempt_number: params.attempt_number,
        policy: this.retry_policy,
        error,
      });
      if (!should_retry.should_retry) {
        throw error;
      }
      await SleepMs(should_retry.delay_ms);
      return this.sendWithRetry<T>({
        ...params,
        attempt_number: params.attempt_number + 1,
      });
    }
  }

  private async buildHeaders(params: {
    node: proxmox_node_connection_i;
    headers?: Record<string, string>;
    request_method: proxmox_http_method_t;
    use_privileged_auth: boolean;
    force_privileged_refresh: boolean;
  }): Promise<Record<string, string>> {
    const merged_headers: Record<string, string> = {};
    if (this.default_headers) {
      Object.assign(merged_headers, this.default_headers);
    }
    if (params.headers) {
      Object.assign(merged_headers, params.headers);
    }
    if (params.use_privileged_auth) {
      if (!params.node.privileged_ticket_provider) {
        throw new ProxmoxPrivilegedFallbackError({
          code: "proxmox.auth.privileged_fallback_misconfigured",
          message: "Privileged fallback requested but privileged ticket provider is missing.",
          details: {
            field: "node.privileged_auth",
            value: params.node.node_id,
          },
        });
      }
      delete merged_headers.Authorization;
      delete merged_headers.authorization;
      const privileged_headers = await params.node.privileged_ticket_provider.getSessionHeaders({
        method: params.request_method,
        force_refresh: params.force_privileged_refresh,
      });
      Object.assign(merged_headers, privileged_headers);
      return merged_headers;
    }
    const auth_header = await ResolveAuthHeader(params.node);
    merged_headers.Authorization = auth_header;
    return merged_headers;
  }
}

async function ResolveAuthHeader(node: proxmox_node_connection_i): Promise<string> {
  if (!node.auth_provider) {
    throw new ProxmoxValidationError({
      code: "proxmox.config.auth.missing_token",
      message: "Auth provider is missing for selected node.",
      details: {
        field: "node.auth_provider",
      },
    });
  }
  return node.auth_provider.getAuthHeader();
}

function BuildApiPath(raw_path: string): string {
  if (!raw_path || raw_path.trim().length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.missing_input",
      message: "Request path is required.",
      details: {
        field: "request.path",
      },
    });
  }
  const normalized_path = raw_path.trim();
  if (normalized_path.startsWith("/api2/json/")) {
    return normalized_path;
  }
  const normalized_without_leading = normalized_path.replace(/^\/+/, "");
  return `/api2/json/${normalized_without_leading}`;
}

function SleepMs(delay_ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay_ms);
  });
}

function ResolveErrorMessage(params: {
  parsed_error: proxmox_api_response_t<unknown>;
  raw_status: number;
  raw_body: string;
}): string {
  const parsed_message = typeof params.parsed_error.message === "string"
    ? params.parsed_error.message.trim()
    : "";
  if (parsed_message.length > 0) {
    return parsed_message;
  }

  if (typeof params.parsed_error.data === "string") {
    const summarized = SummarizeText(params.parsed_error.data);
    if (summarized.length > 0) {
      return summarized;
    }
  }

  if (IsRecord(params.parsed_error.data)) {
    const object_summary = SummarizeRecordForMessage(params.parsed_error.data);
    if (object_summary !== undefined) {
      return object_summary;
    }
  }

  const raw_body_summary = SummarizeText(params.raw_body);
  if (raw_body_summary.length > 0 && raw_body_summary !== "{}") {
    return raw_body_summary;
  }

  return `Proxmox request returned HTTP ${params.raw_status}.`;
}

function BuildSafeErrorCause(params: {
  parsed_data: unknown;
  raw_body: string;
}): unknown {
  const parsed_data = SanitizeErrorValue({
    value: params.parsed_data,
    depth: 0,
  });
  if (parsed_data !== undefined) {
    if (IsRecord(parsed_data)) {
      return parsed_data;
    }
    return {
      body_excerpt: ToSafeString(parsed_data) ?? SummarizeText(String(parsed_data)),
    };
  }

  const summarized_body = SummarizeText(params.raw_body);
  if (summarized_body.length > 0) {
    return {
      body_excerpt: summarized_body,
    };
  }

  return {
    body_excerpt: "empty_response_body",
  };
}

function SummarizeRecordForMessage(value: Record<string, unknown>): string | undefined {
  const candidate_keys = ["message", "error", "reason", "errors", "data"];
  for (const key_name of candidate_keys) {
    if (!(key_name in value)) {
      continue;
    }
    const key_value = value[key_name];
    if (typeof key_value === "string" && key_value.trim().length > 0) {
      return SummarizeText(key_value);
    }
    if (IsRecord(key_value)) {
      const pairs: string[] = [];
      for (const [nested_key, nested_value] of Object.entries(key_value)) {
        const nested_text = ToSafeString(nested_value);
        if (!nested_text) {
          continue;
        }
        pairs.push(`${nested_key}: ${nested_text}`);
        if (pairs.length >= 8) {
          break;
        }
      }
      if (pairs.length > 0) {
        return SummarizeText(pairs.join("; "));
      }
    }
    if (Array.isArray(key_value)) {
      const entries = key_value
        .map((entry) => ToSafeString(entry))
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .slice(0, 8);
      if (entries.length > 0) {
        return SummarizeText(entries.join("; "));
      }
    }
  }
  return undefined;
}

function SanitizeErrorValue(params: {
  value: unknown;
  depth: number;
}): unknown {
  if (params.value === undefined || params.value === null) {
    return undefined;
  }

  if (typeof params.value === "string") {
    const summarized = SummarizeText(params.value);
    return summarized.length > 0 ? summarized : undefined;
  }

  if (typeof params.value === "number" || typeof params.value === "boolean") {
    return params.value;
  }

  if (params.depth >= 3) {
    return "[truncated]";
  }

  if (Array.isArray(params.value)) {
    const output: unknown[] = [];
    for (const entry of params.value.slice(0, 20)) {
      const sanitized_entry = SanitizeErrorValue({
        value: entry,
        depth: params.depth + 1,
      });
      if (sanitized_entry !== undefined) {
        output.push(sanitized_entry);
      }
    }
    return output.length > 0 ? output : undefined;
  }

  if (!IsRecord(params.value)) {
    return ToSafeString(params.value) ?? undefined;
  }

  const output: Record<string, unknown> = {};
  let added_count = 0;
  for (const [key_name, key_value] of Object.entries(params.value)) {
    if (added_count >= 20) {
      break;
    }
    if (ShouldRedactErrorField(key_name)) {
      output[key_name] = "[redacted]";
      added_count += 1;
      continue;
    }

    const sanitized_value = SanitizeErrorValue({
      value: key_value,
      depth: params.depth + 1,
    });
    if (sanitized_value !== undefined) {
      output[key_name] = sanitized_value;
      added_count += 1;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function ShouldRedactErrorField(field_name: string): boolean {
  const lowered = field_name.toLowerCase();
  return lowered.includes("token")
    || lowered.includes("password")
    || lowered.includes("secret")
    || lowered.includes("authorization")
    || lowered.includes("authheader")
    || lowered.includes("ssh-public-key")
    || lowered.includes("ssh_public_key");
}

function ToSafeString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    return SummarizeText(normalized);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function SummarizeText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const max_length = 400;
  if (normalized.length <= max_length) {
    return normalized;
  }
  return `${normalized.slice(0, max_length - 3)}...`;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ShouldRefreshPrivilegedSessionTicket(error: unknown): boolean {
  if (error instanceof ProxmoxAuthError && (error.status_code === 401 || error.status_code === 403)) {
    return true;
  }
  if (error instanceof ProxmoxError && error.code === "proxmox.auth.invalid_token") {
    return true;
  }
  return false;
}

export function BuildRequestClientNode(params: {
  node_id: string;
  host: string;
  protocol: "http" | "https";
  port?: number;
  verify_tls?: boolean;
  ca_bundle_path?: string;
  privileged_ticket_provider?: SessionTicketAuthProvider;
  shell_backend?: proxmox_lxc_shell_backend_t;
  ssh_shell?: proxmox_ssh_shell_t;
  auth: {
    provider: "env" | "file" | "vault" | "sops";
    env_var?: string;
    file_path?: string;
    secret_ref?: string;
    token_id_override?: string;
  };
  token_id: string;
}): proxmox_node_connection_i {
  const token_id = params.auth.token_id_override || params.token_id;
  const auth_provider = BuildAuthProvider({
    token_id,
    auth: {
      provider: params.auth.provider,
      env_var: params.auth.env_var,
      file_path: params.auth.file_path,
      secret_ref: params.auth.secret_ref,
      token_id_override: params.auth.token_id_override,
    },
  });

  return {
    node_id: params.node_id,
    host: params.host,
    protocol: params.protocol ?? "https",
    port: params.port,
    verify_tls: params.verify_tls ?? true,
    ca_bundle_path: params.ca_bundle_path,
    auth_provider,
    privileged_ticket_provider: params.privileged_ticket_provider,
    shell_backend: params.shell_backend,
    ssh_shell: params.ssh_shell,
  };
}
