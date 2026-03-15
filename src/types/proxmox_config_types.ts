export type proxmox_schema_version_t = 1;
export type proxmox_log_level_t = "error" | "warn" | "info" | "debug";
export type proxmox_env_t = "prod" | "stage" | "dev";
export type proxmox_protocol_t = "https" | "http";
export type proxmox_auth_provider_t = "env" | "file" | "vault" | "sops";
export type proxmox_tls_version_t = "TLSv1.2" | "TLSv1.3";
export type proxmox_lxc_shell_backend_t = "ssh_pct";

export interface proxmox_auth_i {
  provider: proxmox_auth_provider_t;
  env_var?: string;
  file_path?: string;
  secret_ref?: string;
  token_id_override?: string;
}

export type proxmox_auth_t = proxmox_auth_i;

export interface proxmox_privileged_auth_i {
  provider: "ticket";
  username: string;
  password: proxmox_auth_t;
  renew_skew_seconds?: number;
}

export type proxmox_privileged_auth_t = proxmox_privileged_auth_i;

export interface proxmox_ssh_shell_i {
  host?: string;
  port?: number;
  username: string;
  password_auth?: proxmox_auth_t;
  private_key_auth?: proxmox_auth_t;
  private_key_passphrase_auth?: proxmox_auth_t;
  connect_timeout_ms?: number;
  command_timeout_ms?: number;
  idle_timeout_ms?: number;
  strict_host_key?: boolean;
  host_fingerprint_sha256?: string;
  known_hosts_path?: string;
}

export type proxmox_ssh_shell_t = proxmox_ssh_shell_i;

export interface proxmox_node_i {
  id: string;
  hostname: string;
  host: string;
  port?: number;
  protocol?: proxmox_protocol_t;
  token_id: string;
  auth: proxmox_auth_t;
  privileged_auth?: proxmox_privileged_auth_t;
  shell_backend?: proxmox_lxc_shell_backend_t;
  ssh_shell?: proxmox_ssh_shell_t;
  verify_tls?: boolean;
  ca_bundle_path?: string;
}

export type proxmox_node_t = proxmox_node_i;

export interface proxmox_cluster_i {
  id: string;
  name: string;
  environment: proxmox_env_t;
  default_node?: string;
  nodes: proxmox_node_t[];
}

export type proxmox_cluster_t = proxmox_cluster_i;

export interface proxmox_transport_i {
  request_timeout_ms?: number;
  connect_timeout_ms?: number;
  keep_alive_ms?: number;
  user_agent?: string;
  verify_tls?: boolean;
  ca_bundle_path?: string;
}

export interface proxmox_transport_resolved_i {
  request_timeout_ms: number;
  connect_timeout_ms: number;
  keep_alive_ms: number;
  user_agent: string;
  verify_tls: boolean;
  ca_bundle_path?: string;
}

export type proxmox_transport_t = proxmox_transport_i;
export type proxmox_transport_resolved_t = proxmox_transport_resolved_i;

export interface proxmox_retry_policy_i {
  enabled?: boolean;
  max_retries?: number;
  base_delay_ms?: number;
  max_delay_ms?: number;
  jitter_ratio?: number;
  retry_on_429?: boolean;
  retry_on_500?: boolean;
}

export interface proxmox_retry_policy_resolved_i {
  enabled: boolean;
  max_retries: number;
  base_delay_ms: number;
  max_delay_ms: number;
  jitter_ratio: number;
  retry_on_429: boolean;
  retry_on_500: boolean;
}

export type proxmox_retry_policy_t = proxmox_retry_policy_i;
export type proxmox_retry_policy_resolved_t = proxmox_retry_policy_resolved_i;

export interface proxmox_task_poller_i {
  enabled?: boolean;
  poll_interval_ms?: number;
  poll_timeout_ms?: number;
  max_poll_failures?: number;
}

export interface proxmox_task_poller_resolved_i {
  enabled: boolean;
  poll_interval_ms: number;
  poll_timeout_ms: number;
  max_poll_failures: number;
}

export type proxmox_task_poller_t = proxmox_task_poller_i;
export type proxmox_task_poller_resolved_t = proxmox_task_poller_resolved_i;

export interface proxmox_runtime_defaults_i {
  request_timeout_ms?: number;
  connect_timeout_ms?: number;
  keep_alive_ms?: number;
  user_agent?: string;
  max_concurrency?: number;
}

export interface proxmox_runtime_defaults_resolved_i {
  request_timeout_ms: number;
  connect_timeout_ms: number;
  keep_alive_ms: number;
  user_agent: string;
  max_concurrency: number;
}

export interface proxmox_logging_i {
  level?: proxmox_log_level_t;
  include_request_id?: boolean;
  redact_headers?: string[];
  structured?: boolean;
}

export interface proxmox_logging_resolved_i {
  level: proxmox_log_level_t;
  include_request_id: boolean;
  redact_headers: string[];
  structured: boolean;
}

export type proxmox_runtime_defaults_t = proxmox_runtime_defaults_i;
export type proxmox_runtime_defaults_resolved_t = proxmox_runtime_defaults_resolved_i;
export type proxmox_logging_t = proxmox_logging_i;
export type proxmox_logging_resolved_t = proxmox_logging_resolved_i;

export interface proxmox_security_i {
  redact_secrets_in_logs?: boolean;
  allow_plaintext_api_key_in_file?: boolean;
  minimum_tls_version?: proxmox_tls_version_t;
  allowed_hostname_patterns?: string[];
  disable_ssl_verification?: boolean;
  secret_rotation_reminder_days?: number;
}

export interface proxmox_security_resolved_i {
  redact_secrets_in_logs: boolean;
  allow_plaintext_api_key_in_file: boolean;
  minimum_tls_version: proxmox_tls_version_t;
  allowed_hostname_patterns: string[];
  disable_ssl_verification: boolean;
  secret_rotation_reminder_days: number;
}

export type proxmox_security_t = proxmox_security_i;
export type proxmox_security_resolved_t = proxmox_security_resolved_i;

export interface proxmox_profile_i {
  name: string;
  description?: string;
  cluster_id: string;
  transport_overrides?: proxmox_transport_t;
  retry_policy?: proxmox_retry_policy_t;
  task_poller?: proxmox_task_poller_t;
}

export interface proxmox_profile_resolved_i {
  name: string;
  description?: string;
  cluster_id: string;
  transport: proxmox_transport_resolved_t;
  retry_policy: proxmox_retry_policy_resolved_t;
  task_poller: proxmox_task_poller_resolved_t;
}

export type proxmox_profile_t = proxmox_profile_i;
export type proxmox_profile_resolved_t = proxmox_profile_resolved_i;

export interface proxmoxlib_config_i {
  schema_version: number;
  active_profile: string;
  profiles: proxmox_profile_t[];
  clusters: proxmox_cluster_t[];
  defaults?: proxmox_runtime_defaults_t;
  logging?: proxmox_logging_t;
  security?: proxmox_security_t;
}

export interface proxmoxlib_resolved_config_i {
  schema_version: proxmox_schema_version_t;
  active_profile: string;
  profiles: proxmox_profile_t[];
  clusters: proxmox_cluster_t[];
  defaults: proxmox_runtime_defaults_resolved_t;
  logging: proxmox_logging_resolved_t;
  security: proxmox_security_resolved_t;
}

export type proxmoxlib_config_t = proxmoxlib_config_i;
export type proxmoxlib_resolved_config_t = proxmoxlib_resolved_config_i;

export interface proxmox_node_secret_i {
  node_id: string;
  cluster_id: string;
  token_id: string;
  provider: proxmox_auth_provider_t;
  token: string;
  token_fingerprint: string;
}

export interface proxmox_secret_store_i {
  [node_id: string]: proxmox_node_secret_i;
}

export type proxmox_node_secret_t = proxmox_node_secret_i;
export type proxmox_secret_store_t = proxmox_secret_store_i;

export interface proxmox_load_config_i {
  config_path?: string;
}
