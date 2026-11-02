export type proxmox_http_method_t =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

export type proxmox_http_query_value_t = string | number | boolean;

export interface proxmox_http_query_t {
  [key: string]: proxmox_http_query_value_t;
}

export interface proxmox_http_request_t {
  method: proxmox_http_method_t;
  path: string;
  query?: proxmox_http_query_t;
  headers?: Record<string, string>;
  body?: unknown;
  timeout_ms?: number;
}

export interface proxmox_http_response_t {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: string;
}

export interface proxmox_api_response_t<T> {
  data: T;
  success: boolean;
  status_code: number;
  message?: string;
}

export interface proxmox_task_status_payload_t {
  task_id: string;
  node: string;
  status: "running" | "stopped" | "ok" | "error" | "unknown";
  percent?: number;
  exit_status?: "OK" | "ERROR";
  message?: string;
}

export interface proxmox_transport_context_t {
  protocol: "https" | "http";
  host: string;
  port?: number;
  base_url?: string;
  request_timeout_ms: number;
  keep_alive_ms: number;
  verify_tls: boolean;
  ca_bundle_path?: string;
  headers?: Record<string, string>;
}
