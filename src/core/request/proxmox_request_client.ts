import {
  proxmox_api_response_t,
  proxmox_http_method_t,
  proxmox_http_query_t,
  proxmox_http_request_t,
} from "../../types/proxmox_http_types";
import { proxmox_retry_policy_t } from "../../types/proxmox_config_types";
import { proxmox_api_parser_i } from "../parser/proxmox_api_parser";
import { prox_mox_http_transport_i } from "../http/proxmox_http_transport_i";
import { BuildProxmoxUrl } from "../http/http_url_builder";
import { BuildAuthProvider } from "../auth/proxmox_auth_factory";
import { proxmox_auth_provider_i } from "../auth/auth_provider_i";
import { MapHttpStatusToProxmoxError, ProxmoxValidationError } from "../../errors/proxmox_error";
import { EvaluateRetry } from "../retry/retry_policy";

export interface proxmox_node_connection_i {
  node_id: string;
  host: string;
  protocol: "http" | "https";
  port?: number;
  verify_tls: boolean;
  ca_bundle_path?: string;
  auth_provider: proxmox_auth_provider_i;
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
    return this.sendWithRetry<T>({
      method: params.method,
      path: params.path,
      node_id: params.node_id,
      query: params.query,
      headers: params.headers,
      body: params.body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed,
      attempt_number: 1,
    });
  }

  private async sendWithRetry<T>(params: proxmox_request_i & { attempt_number: number }): Promise<proxmox_api_response_t<T>> {
    const selected_node = this.resolveNode(params.node_id);
    const normalized_path = BuildApiPath(params.path);
    const request: proxmox_http_request_t = {
      method: params.method,
      path: normalized_path,
      query: params.query,
      headers: await this.buildHeaders({
        node: selected_node,
        headers: params.headers,
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
        const message = typeof parsed_error.message === "string"
          ? parsed_error.message
          : typeof parsed_error.data === "string"
            ? parsed_error.data
            : "Proxmox request returned an error response.";
        throw MapHttpStatusToProxmoxError({
          status_code: raw_response.status,
          message,
          path: normalized_path,
          body: parsed_error.data,
        });
      }

      return this.parser.parseResponse<T>(raw_response);
    } catch (error) {
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
  }): Promise<Record<string, string>> {
    const auth_header = await ResolveAuthHeader(params.node);
    const merged_headers: Record<string, string> = {};
    if (this.default_headers) {
      Object.assign(merged_headers, this.default_headers);
    }
    if (params.headers) {
      Object.assign(merged_headers, params.headers);
    }
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

export function BuildRequestClientNode(params: {
  node_id: string;
  host: string;
  protocol: "http" | "https";
  port?: number;
  verify_tls?: boolean;
  ca_bundle_path?: string;
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
  };
}
