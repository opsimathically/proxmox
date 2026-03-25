import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  ProxmoxError,
  ProxmoxAuthError,
} from "../errors/proxmox_error";
import { ResolveSopsToken } from "../core/auth/sops_token_resolver";
import { ResolveVaultToken } from "../core/auth/vault_token_resolver";
import {
  proxmoxlib_config_t,
  proxmoxlib_resolved_config_t,
  proxmox_profile_resolved_t,
  proxmox_secret_store_t,
  proxmox_node_secret_t,
  proxmox_runtime_defaults_i,
  proxmox_runtime_defaults_resolved_t,
  proxmox_logging_i,
  proxmox_logging_resolved_t,
  proxmox_security_i,
  proxmox_security_resolved_t,
  proxmox_task_poller_i,
  proxmox_task_poller_resolved_t,
  proxmox_retry_policy_i,
  proxmox_retry_policy_resolved_t,
  proxmox_transport_i,
  proxmox_transport_resolved_t,
  proxmox_load_config_i,
  proxmox_cluster_t,
  proxmox_node_t,
  proxmox_auth_t,
  proxmox_privileged_auth_t,
  proxmox_log_level_t,
  proxmox_protocol_t,
  proxmox_tls_version_t,
  proxmox_env_t,
  proxmox_auth_provider_t,
  proxmox_schema_version_t,
  proxmox_lxc_shell_backend_t,
  proxmox_ssh_shell_t,
} from "../types/proxmox_config_types";

export interface proxmox_config_diagnostic_logging_i {
  info: (message: string, payload?: Record<string, unknown>) => void;
}

export interface proxmox_config_diagnostics_lookup_i {
  config: proxmoxlib_resolved_config_t;
  profile_name?: string;
  config_path?: string;
  logger?: proxmox_config_diagnostic_logging_i;
}

export interface proxmox_config_diagnostics_i {
  config_path?: string;
  schema_version: proxmox_schema_version_t;
  active_profile: string;
  selected_profile: {
    name: string;
    cluster_id: string;
    description?: string;
  };
  selected_cluster: {
    id: string;
    name: string;
    environment: proxmox_env_t;
    node_count: number;
  };
  runtime_defaults: proxmox_runtime_defaults_resolved_t;
  transport: {
    verify_tls: boolean;
    request_timeout_ms: number;
    connect_timeout_ms: number;
    keep_alive_ms: number;
    user_agent: string;
    ca_bundle_path_defined: boolean;
  };
  retry_policy: proxmox_retry_policy_resolved_t;
  task_poller: proxmox_task_poller_resolved_t;
  logging: proxmox_logging_resolved_t;
  security: proxmox_security_resolved_t;
  profile_count: number;
  cluster_count: number;
  auth_provider_counts: Record<proxmox_auth_provider_t, number>;
  privileged_auth_node_count: number;
}

export type proxmox_config_diagnostics_t = proxmox_config_diagnostics_i;

const default_runtime_defaults_t: proxmox_runtime_defaults_resolved_t = {
  request_timeout_ms: 30000,
  connect_timeout_ms: 8000,
  keep_alive_ms: 30000,
  user_agent: "proxmoxlib-sdk/1.0",
  max_concurrency: 8,
};

const default_transport_t: proxmox_transport_resolved_t = {
  request_timeout_ms: 30000,
  connect_timeout_ms: 8000,
  keep_alive_ms: 30000,
  user_agent: "proxmoxlib-sdk/1.0",
  verify_tls: true,
};

const default_retry_policy_t: proxmox_retry_policy_resolved_t = {
  enabled: true,
  max_retries: 4,
  base_delay_ms: 300,
  max_delay_ms: 8000,
  jitter_ratio: 0.35,
  retry_on_429: true,
  retry_on_500: true,
};

const default_task_poller_t: proxmox_task_poller_resolved_t = {
  enabled: true,
  poll_interval_ms: 1500,
  poll_timeout_ms: 1800000,
  max_poll_failures: 3,
};

const default_logging_t: proxmox_logging_resolved_t = {
  level: "info",
  include_request_id: true,
  redact_headers: ["Authorization", "PVEAPIToken", "Cookie"],
  structured: true,
};

const default_security_t: proxmox_security_resolved_t = {
  redact_secrets_in_logs: true,
  allow_plaintext_api_key_in_file: false,
  minimum_tls_version: "TLSv1.3",
  allowed_hostname_patterns: [],
  disable_ssl_verification: false,
  secret_rotation_reminder_days: 30,
};

export interface proxmox_config_lookup_i {
  config: proxmoxlib_resolved_config_t;
  profile_name?: string;
}

export interface proxmox_config_secret_lookup_i {
  config: proxmoxlib_resolved_config_t;
  profile_name?: string;
}

export function LoadConfig(params: proxmox_load_config_i = {}): proxmoxlib_resolved_config_t {
  const config_path = ResolveConfigPath(params.config_path);

  let raw_config: unknown;
  try {
    const raw_text = readFileSync(config_path, "utf8");
    raw_config = JSON.parse(raw_text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProxmoxError({
        code: "proxmox.config.parse_json",
        message: "Could not parse proxmoxlib config JSON.",
        details: {
          path: config_path,
          field: "proxmoxlib config file",
        },
        cause: error,
      });
    }

    throw new ProxmoxError({
      code: "proxmox.config.load_file",
      message: "Could not read proxmoxlib config file.",
      details: {
        path: config_path,
        field: "proxmoxlib config file",
      },
      cause: error,
    });
  }

  return ValidateConfig({ config: raw_config, config_path });
}

export function ValidateConfig(params: {
  config: unknown;
  config_path?: string;
}): proxmoxlib_resolved_config_t {
  const config_data = EnsureObject(params.config, "config");
  const schema_version = EnsureSchemaVersion(
    LoadField(config_data, "schema_version", "config"),
    "config.schema_version",
  );
  const active_profile = EnsureString(
    LoadField(config_data, "active_profile", "config"),
    "config.active_profile",
    true,
  );

  const profiles = ValidateProfiles(
    LoadField(config_data, "profiles", "config"),
    "config.profiles",
  );
  const clusters = ValidateClusters(
    LoadField(config_data, "clusters", "config"),
    "config.clusters",
  );
  const active_profile_exists = profiles.find(
    (proxmox_profile) => proxmox_profile.name === active_profile,
  );
  if (!active_profile_exists) {
    throw new ProxmoxError({
      code: "proxmox.config.profile_not_found",
      message: "Active profile was not found in profiles list.",
      details: {
        field: "active_profile",
        value: active_profile,
      },
    });
  }

  const defaults = ResolveRuntimeDefaults(
    MaybeObject<proxmox_runtime_defaults_i>(LoadOptionalField(config_data, "defaults", "config")),
  );
  const logging = ResolveLogging(
    MaybeObject<proxmox_logging_i>(LoadOptionalField(config_data, "logging", "config")),
  );
  const security = ResolveSecurity(
    MaybeObject<proxmox_security_i>(LoadOptionalField(config_data, "security", "config")),
  );
  ValidatePlainAuthPolicy({
    clusters,
    security,
  });

  return {
    schema_version,
    active_profile,
    profiles,
    clusters,
    defaults,
    logging,
    security,
  };
}

export function ResolveProfile(params: proxmox_config_lookup_i): proxmox_profile_resolved_t {
  const profile_name = params.profile_name ?? params.config.active_profile;
  const selected_profile = params.config.profiles.find(
    (proxmox_profile) => proxmox_profile.name === profile_name,
  );

  if (!selected_profile) {
    throw new ProxmoxError({
      code: "proxmox.config.profile_not_found",
      message: "Profile was not found in config.",
      details: {
        field: "profile_name",
        value: profile_name,
      },
    });
  }

  const cluster = params.config.clusters.find(
    (proxmox_cluster) => proxmox_cluster.id === selected_profile.cluster_id,
  );
  if (!cluster) {
    throw new ProxmoxError({
      code: "proxmox.config.cluster_not_found",
      message: "Profile cluster_id does not match any configured cluster.",
      details: {
        field: "selected_profile.cluster_id",
        value: selected_profile.cluster_id,
      },
    });
  }

  return {
    name: selected_profile.name,
    description: selected_profile.description,
    cluster_id: selected_profile.cluster_id,
    transport: MergeTransport(
      params.config.defaults,
      selected_profile.transport_overrides,
    ),
    retry_policy: MergeRetryPolicy(
      selected_profile.retry_policy,
    ),
    task_poller: MergeTaskPoller(
      selected_profile.task_poller,
    ),
  };
}

export async function ResolveSecrets(params: proxmox_config_secret_lookup_i): Promise<proxmox_secret_store_t> {
  const resolved_profile = ResolveProfile({
    config: params.config,
    profile_name: params.profile_name,
  });
  const selected_cluster = params.config.clusters.find(
    (proxmox_cluster) => proxmox_cluster.id === resolved_profile.cluster_id,
  );

  if (!selected_cluster) {
    throw new ProxmoxError({
      code: "proxmox.config.cluster_not_found",
      message: "Unable to resolve cluster for selected profile.",
      details: {
        field: "resolved_profile.cluster_id",
        value: resolved_profile.cluster_id,
      },
    });
  }

  const secret_store: proxmox_secret_store_t = {};
  for (const proxmox_node of selected_cluster.nodes) {
    const node_secret = await ResolveNodeSecret({
      node: proxmox_node,
      cluster_id: selected_cluster.id,
    });
    secret_store[proxmox_node.id] = node_secret;
  }

  return secret_store;
}

async function ResolveNodeSecret(params: {
  node: proxmox_node_t;
  cluster_id: string;
}): Promise<proxmox_node_secret_t> {
  const token = await ResolveAuthToken(params.node.auth, params.node.token_id, params.node.id);
  return {
    node_id: params.node.id,
    cluster_id: params.cluster_id,
    token_id: params.node.token_id,
    provider: params.node.auth.provider,
    token,
    token_fingerprint: MakeTokenFingerprint(token),
  };
}

export function BuildConfigDiagnostics(params: proxmox_config_diagnostics_lookup_i): proxmox_config_diagnostics_t {
  const profile = ResolveProfile({
    config: params.config,
    profile_name: params.profile_name,
  });

  const cluster = params.config.clusters.find((proxmox_cluster) => proxmox_cluster.id === profile.cluster_id);
  if (!cluster) {
    throw new ProxmoxError({
      code: "proxmox.config.cluster_not_found",
      message: "Resolved profile cluster_id was not found during diagnostics build.",
      details: {
        field: "selected_profile.cluster_id",
        value: profile.cluster_id,
      },
    });
  }

  const auth_provider_counts: Record<proxmox_auth_provider_t, number> = {
    env: 0,
    file: 0,
    vault: 0,
    sops: 0,
    plain: 0,
  };
  let privileged_auth_node_count = 0;
  for (const proxmox_node of cluster.nodes) {
    const provider = proxmox_node.auth.provider;
    auth_provider_counts[provider] = auth_provider_counts[provider] + 1;
    if (proxmox_node.privileged_auth !== undefined) {
      privileged_auth_node_count += 1;
    }
  }

  return {
    config_path: params.config_path,
    schema_version: params.config.schema_version,
    active_profile: params.config.active_profile,
    selected_profile: {
      name: profile.name,
      cluster_id: profile.cluster_id,
      description: profile.description,
    },
    selected_cluster: {
      id: cluster.id,
      name: cluster.name,
      environment: cluster.environment,
      node_count: cluster.nodes.length,
    },
    runtime_defaults: params.config.defaults,
    transport: {
      verify_tls: profile.transport.verify_tls,
      request_timeout_ms: profile.transport.request_timeout_ms,
      connect_timeout_ms: profile.transport.connect_timeout_ms,
      keep_alive_ms: profile.transport.keep_alive_ms,
      user_agent: profile.transport.user_agent,
      ca_bundle_path_defined: profile.transport.ca_bundle_path !== undefined,
    },
    retry_policy: profile.retry_policy,
    task_poller: profile.task_poller,
    logging: params.config.logging,
    security: params.config.security,
    profile_count: params.config.profiles.length,
    cluster_count: params.config.clusters.length,
    auth_provider_counts,
    privileged_auth_node_count,
  };
}

export function EmitStartupDiagnostics(params: proxmox_config_diagnostics_lookup_i): proxmox_config_diagnostics_t {
  const diagnostics = BuildConfigDiagnostics(params);
  const logger = params.logger ?? console;
  const payload = {
    event: "proxmoxlib.startup_diagnostics",
    config_path: diagnostics.config_path,
    active_profile: diagnostics.active_profile,
    selected_profile: diagnostics.selected_profile,
    selected_cluster: diagnostics.selected_cluster,
    profile_count: diagnostics.profile_count,
    cluster_count: diagnostics.cluster_count,
    node_count: diagnostics.selected_cluster.node_count,
    auth_provider_counts: diagnostics.auth_provider_counts,
    retry_policy: {
      enabled: diagnostics.retry_policy.enabled,
      max_retries: diagnostics.retry_policy.max_retries,
      retry_on_429: diagnostics.retry_policy.retry_on_429,
      retry_on_500: diagnostics.retry_policy.retry_on_500,
    },
    task_poller: {
      enabled: diagnostics.task_poller.enabled,
      poll_interval_ms: diagnostics.task_poller.poll_interval_ms,
      poll_timeout_ms: diagnostics.task_poller.poll_timeout_ms,
      max_poll_failures: diagnostics.task_poller.max_poll_failures,
    },
    privileged_auth_node_count: diagnostics.privileged_auth_node_count,
    transport: diagnostics.transport,
    logging: {
      level: diagnostics.logging.level,
      include_request_id: diagnostics.logging.include_request_id,
      structured: diagnostics.logging.structured,
      redact_headers: diagnostics.logging.redact_headers,
    },
    security: {
      redact_secrets_in_logs: diagnostics.security.redact_secrets_in_logs,
      minimum_tls_version: diagnostics.security.minimum_tls_version,
      disable_ssl_verification: diagnostics.security.disable_ssl_verification,
      allowed_hostname_patterns: diagnostics.security.allowed_hostname_patterns.length,
      secret_rotation_reminder_days: diagnostics.security.secret_rotation_reminder_days,
    },
  };
  logger.info("Startup diagnostics", payload);
  return diagnostics;
}

async function ResolveAuthToken(
  auth: proxmox_auth_t,
  token_id: string,
  node_id: string,
): Promise<string> {
  void token_id;
  if (auth.provider === "env") {
    if (!auth.env_var) {
      throw new ProxmoxError({
        code: "proxmox.config.auth.missing_token",
        message: "env provider is missing env_var.",
        details: {
          field: `nodes.${node_id}.auth.env_var`,
        },
      });
    }

    const env_token = process.env[auth.env_var];
    if (!env_token || !env_token.trim()) {
      throw new ProxmoxError({
        code: "proxmox.config.auth.missing_token",
        message: "Environment token was not present or was empty.",
        details: {
          field: auth.env_var,
        },
      });
    }

    return env_token.trim();
  }

  if (auth.provider === "file") {
    if (!auth.file_path) {
      throw new ProxmoxError({
        code: "proxmox.config.auth.missing_token",
        message: "file provider is missing file_path.",
        details: {
          field: `nodes.${node_id}.auth.file_path`,
        },
      });
    }

    let file_token: string | undefined;
    try {
      file_token = readFileSync(auth.file_path, "utf8").trim();
    } catch (error) {
      throw new ProxmoxError({
        code: "proxmox.config.load_file",
        message: "Could not read file token from auth.file_path.",
        details: {
          field: `nodes.${node_id}.auth.file_path`,
          value: auth.file_path,
        },
        cause: error,
      });
    }

    if (!file_token) {
      throw new ProxmoxError({
        code: "proxmox.config.auth.missing_token",
        message: "file token was empty.",
        details: {
          field: `nodes.${node_id}.auth.file_path`,
          value: auth.file_path,
        },
      });
    }

    return file_token;
  }

  if (auth.provider === "sops") {
    try {
      return ResolveSopsToken({
        secret_ref: auth.secret_ref ?? "",
      });
    } catch (error) {
      if (error instanceof ProxmoxAuthError) {
        if (error.code === "proxmox.auth.missing_token") {
          throw new ProxmoxError({
            code: "proxmox.config.auth.missing_token",
            message: "sops provider is missing secret_ref.",
            details: {
              field: `nodes.${node_id}.auth.secret_ref`,
            },
            cause: error,
          });
        }

        if (error.code === "proxmox.auth.invalid_token" && error.details?.value === "empty_token") {
          throw new ProxmoxError({
            code: "proxmox.config.auth.missing_token",
            message: "sops token was empty.",
            details: {
              field: `nodes.${node_id}.auth.secret_ref`,
            },
            cause: error,
          });
        }

        if (error.code === "proxmox.auth.invalid_token") {
          throw new ProxmoxError({
            code: "proxmox.config.load_file",
            message: "Could not decrypt file token from auth.secret_ref.",
            details: {
              field: `nodes.${node_id}.auth.secret_ref`,
            },
            cause: error,
          });
        }
      }

      throw new ProxmoxError({
        code: "proxmox.config.load_file",
        message: "Could not decrypt file token from auth.secret_ref.",
        details: {
          field: `nodes.${node_id}.auth.secret_ref`,
        },
        cause: error,
      });
    }
  }

  if (auth.provider === "vault") {
    try {
      return await ResolveVaultToken({
        secret_ref: auth.secret_ref ?? "",
      });
    } catch (error) {
      if (error instanceof ProxmoxAuthError) {
        if (error.code === "proxmox.auth.missing_token") {
          throw new ProxmoxError({
            code: "proxmox.config.auth.missing_token",
            message: "vault provider is missing required auth fields.",
            details: {
              field: `nodes.${node_id}.auth.secret_ref`,
            },
            cause: error,
          });
        }

        if (error.code === "proxmox.auth.invalid_token") {
          throw new ProxmoxError({
            code: "proxmox.config.load_file",
            message: "Could not resolve token from Vault secret_ref.",
            details: {
              field: `nodes.${node_id}.auth.secret_ref`,
            },
            cause: error,
          });
        }
      }

      throw new ProxmoxError({
        code: "proxmox.config.load_file",
        message: "Could not resolve token from Vault secret_ref.",
        details: {
          field: `nodes.${node_id}.auth.secret_ref`,
        },
        cause: error,
      });
    }
  }

  if (auth.provider === "plain") {
    const normalized_plain_text = auth.plain_text?.trim();
    if (!normalized_plain_text) {
      throw new ProxmoxError({
        code: "proxmox.config.auth.missing_token",
        message: "plain provider is missing plain_text.",
        details: {
          field: `nodes.${node_id}.auth.plain_text`,
        },
      });
    }
    return normalized_plain_text;
  }

  if (auth.provider === undefined || auth.provider === "") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "Auth provider must be set.",
      details: {
        field: `nodes.${node_id}.auth.provider`,
      },
    });
  }

  throw new ProxmoxError({
    code: "proxmox.config.auth.unsupported_provider",
    message: "Unsupported auth provider.",
    details: {
      field: `nodes.${node_id}.auth.provider`,
      value: auth.provider,
    },
  });
}

export function ResolveConfigPath(config_path?: string): string {
  const path_value = config_path ?? process.env.PROXMOXLIB_CONFIG_PATH;
  if (!path_value || !path_value.trim()) {
    return join(homedir(), "environment_files", "proxmoxlib.json");
  }

  const expanded_path = ExpandPath(path_value.trim());
  if (isAbsolute(expanded_path)) {
    return expanded_path;
  }

  return resolve(process.cwd(), expanded_path);
}

function ExpandPath(path_value: string): string {
  if (path_value.startsWith("~/")) {
    return join(homedir(), path_value.slice(2));
  }

  return path_value;
}

function ValidateProfiles(raw_profiles: unknown, path: string): proxmoxlib_config_t["profiles"] {
  const profiles = EnsureArray(raw_profiles, path);
  if (profiles.length === 0) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "profiles must contain at least one profile.",
      details: {
        field: path,
      },
    });
  }

  const seen_names = new Set<string>();
  const validated_profiles = [];
  for (const [index, raw_profile] of profiles.entries()) {
    const profile = EnsureObject(raw_profile, `${path}[${index}]`);
    const proxmox_profile = ValidateProfile(profile, `${path}[${index}]`);
    if (seen_names.has(proxmox_profile.name)) {
      throw new ProxmoxError({
        code: "proxmox.config.validation",
        message: "Duplicate profile names are not allowed.",
        details: {
          field: `${path}[${index}].name`,
          value: proxmox_profile.name,
        },
      });
    }

    seen_names.add(proxmox_profile.name);
    validated_profiles.push(proxmox_profile);
  }

  return validated_profiles;
}

function ValidateProfile(raw_profile: Record<string, unknown>, path: string): proxmoxlib_config_t["profiles"][number] {
  const proxmox_profile: proxmoxlib_config_t["profiles"][number] = {
    name: EnsureString(
      LoadField(raw_profile, "name", path),
      `${path}.name`,
      true,
    ),
    cluster_id: EnsureString(
      LoadField(raw_profile, "cluster_id", path),
      `${path}.cluster_id`,
      true,
    ),
    description: EnsureOptionalString(
      LoadOptionalField(raw_profile, "description", path),
      `${path}.description`,
    ),
    transport_overrides: ValidateTransport(
      MaybeObject<proxmox_transport_i>(
        LoadOptionalField(raw_profile, "transport_overrides", path),
      ),
      `${path}.transport_overrides`,
    ),
    retry_policy: ValidateRetryPolicy(
      MaybeObject<proxmox_retry_policy_i>(
        LoadOptionalField(raw_profile, "retry_policy", path),
      ),
      `${path}.retry_policy`,
    ),
    task_poller: ValidateTaskPoller(
      MaybeObject<proxmox_task_poller_i>(
        LoadOptionalField(raw_profile, "task_poller", path),
      ),
      `${path}.task_poller`,
    ),
  };
  return proxmox_profile;
}

function ValidateClusters(raw_clusters: unknown, path: string): proxmoxlib_config_t["clusters"] {
  const clusters = EnsureArray(raw_clusters, path);
  if (clusters.length === 0) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "clusters must contain at least one cluster.",
      details: {
        field: path,
      },
    });
  }

  const seen_cluster_ids = new Set<string>();
  const validated_clusters: proxmox_cluster_t[] = [];

  for (const [index, raw_cluster] of clusters.entries()) {
    const cluster_data = EnsureObject(raw_cluster, `${path}[${index}]`);
    const cluster_id = EnsureString(
      LoadField(cluster_data, "id", `${path}[${index}]`),
      `${path}[${index}].id`,
      true,
    );
    const name = EnsureString(
      LoadField(cluster_data, "name", `${path}[${index}]`),
      `${path}[${index}].name`,
      true,
    );
    const environment = EnsureEnvironment(
      EnsureString(
        LoadField(cluster_data, "environment", `${path}[${index}]`),
        `${path}[${index}].environment`,
        true,
      ),
      `${path}[${index}].environment`,
    );
    const default_node = EnsureOptionalString(
      LoadOptionalField(cluster_data, "default_node", `${path}[${index}]`),
      `${path}[${index}].default_node`,
    );
    const nodes = ValidateNodes(
      LoadField(cluster_data, "nodes", `${path}[${index}]`),
      `${path}[${index}].nodes`,
    );

    if (seen_cluster_ids.has(cluster_id)) {
      throw new ProxmoxError({
        code: "proxmox.config.validation",
        message: "Duplicate cluster ids are not allowed.",
        details: {
          field: `${path}[${index}].id`,
          value: cluster_id,
        },
      });
    }

    if (default_node !== undefined && !nodes.some((proxmox_node) => proxmox_node.id === default_node)) {
      throw new ProxmoxError({
        code: "proxmox.config.validation",
        message: "default_node must match an existing node id.",
        details: {
          field: `${path}[${index}].default_node`,
          value: default_node,
        },
      });
    }

    seen_cluster_ids.add(cluster_id);
    validated_clusters.push({
      id: cluster_id,
      name,
      environment,
      default_node,
      nodes,
    });
  }

  return validated_clusters;
}

function ValidateNodes(raw_nodes: unknown, path: string): proxmox_node_t[] {
  const nodes = EnsureArray(raw_nodes, path);
  if (nodes.length === 0) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "nodes must contain at least one node.",
      details: { field: path },
    });
  }

  const seen_node_ids = new Set<string>();
  const validated_nodes: proxmox_node_t[] = [];

  for (const [index, raw_node] of nodes.entries()) {
    const node_data = EnsureObject(raw_node, `${path}[${index}]`);
    const proxmox_node: proxmox_node_t = {
      id: EnsureString(LoadField(node_data, "id", `${path}[${index}]`), `${path}[${index}].id`, true),
      hostname: EnsureString(
        LoadField(node_data, "hostname", `${path}[${index}]`),
        `${path}[${index}].hostname`,
        true,
      ),
      host: EnsureHost(
        EnsureString(
          LoadField(node_data, "host", `${path}[${index}]`),
          `${path}[${index}].host`,
          true,
        ),
      ),
      port: EnsureOptionalNumber(
        LoadOptionalField(node_data, "port", `${path}[${index}]`),
        `${path}[${index}].port`,
        {
          min: 1,
          max: 65535,
          integer: true,
        },
      ),
      protocol: EnsureOptionalProtocol(
        EnsureOptionalString(
          LoadOptionalField(node_data, "protocol", `${path}[${index}]`),
          `${path}[${index}].protocol`,
        ),
      ),
      token_id: EnsureString(
        LoadField(node_data, "token_id", `${path}[${index}]`),
        `${path}[${index}].token_id`,
        true,
      ),
      auth: ValidateAuth(
        EnsureObject(
          LoadField(node_data, "auth", `${path}[${index}]`),
          `${path}[${index}].auth`,
        ),
        `${path}[${index}].auth`,
      ),
      privileged_auth: ValidatePrivilegedAuth(
        MaybeObject<proxmox_privileged_auth_t>(
          LoadOptionalField(node_data, "privileged_auth", `${path}[${index}]`),
        ),
        `${path}[${index}].privileged_auth`,
      ),
      shell_backend: ValidateShellBackend(
        EnsureOptionalString(
          LoadOptionalField(node_data, "shell_backend", `${path}[${index}]`),
          `${path}[${index}].shell_backend`,
        ),
        `${path}[${index}].shell_backend`,
      ),
      ssh_shell: ValidateSshShell(
        MaybeObject<proxmox_ssh_shell_t>(
          LoadOptionalField(node_data, "ssh_shell", `${path}[${index}]`),
        ),
        `${path}[${index}].ssh_shell`,
      ),
      verify_tls: EnsureOptionalBoolean(
        LoadOptionalField(node_data, "verify_tls", `${path}[${index}]`),
        `${path}[${index}].verify_tls`,
      ),
      ca_bundle_path: EnsureOptionalString(
        LoadOptionalField(node_data, "ca_bundle_path", `${path}[${index}]`),
        `${path}[${index}].ca_bundle_path`,
      ),
    };

    if (seen_node_ids.has(proxmox_node.id)) {
      throw new ProxmoxError({
        code: "proxmox.config.validation",
        message: "Duplicate node ids are not allowed.",
        details: {
          field: `${path}[${index}].id`,
          value: proxmox_node.id,
        },
      });
    }

    if (proxmox_node.shell_backend === "ssh_pct" && proxmox_node.ssh_shell === undefined) {
      throw new ProxmoxError({
        code: "proxmox.config.validation",
        message: "ssh_shell must be configured when shell_backend is ssh_pct.",
        details: {
          field: `${path}[${index}].ssh_shell`,
          value: proxmox_node.id,
        },
      });
    }
    if (proxmox_node.shell_backend === undefined && proxmox_node.ssh_shell !== undefined) {
      proxmox_node.shell_backend = "ssh_pct";
    }

    seen_node_ids.add(proxmox_node.id);
    validated_nodes.push(proxmox_node);
  }

  return validated_nodes;
}

function ValidateAuth(raw_auth: Record<string, unknown>, path: string): proxmox_auth_t {
  const provider = EnsureString(
    LoadField(raw_auth, "provider", path),
    `${path}.provider`,
    true,
  ) as proxmox_auth_t["provider"];

  if (provider !== "env" && provider !== "file" && provider !== "vault" && provider !== "sops" && provider !== "plain") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "Unsupported auth provider.",
      details: {
        field: `${path}.provider`,
        value: provider,
      },
    });
  }

  const plain_text = EnsureOptionalString(LoadOptionalField(raw_auth, "plain_text", path), `${path}.plain_text`);
  if (provider === "plain" && (!plain_text || plain_text.trim().length === 0)) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "plain provider requires plain_text.",
      details: {
        field: `${path}.plain_text`,
      },
    });
  }

  return {
    provider,
    env_var: EnsureOptionalString(LoadOptionalField(raw_auth, "env_var", path), `${path}.env_var`),
    file_path: EnsureOptionalString(LoadOptionalField(raw_auth, "file_path", path), `${path}.file_path`),
    secret_ref: EnsureOptionalString(LoadOptionalField(raw_auth, "secret_ref", path), `${path}.secret_ref`),
    plain_text,
    token_id_override: EnsureOptionalString(
      LoadOptionalField(raw_auth, "token_id_override", path),
      `${path}.token_id_override`,
    ),
  };
}

function ValidatePlainAuthPolicy(params: {
  clusters: proxmox_cluster_t[];
  security: proxmox_security_resolved_t;
}): void {
  if (params.security.allow_plaintext_api_key_in_file) {
    return;
  }

  for (const [cluster_index, proxmox_cluster] of params.clusters.entries()) {
    for (const [node_index, proxmox_node] of proxmox_cluster.nodes.entries()) {
      if (proxmox_node.auth.provider === "plain") {
        throw new ProxmoxError({
          code: "proxmox.config.validation",
          message: "plain auth provider is disabled by security.allow_plaintext_api_key_in_file.",
          details: {
            field: `config.clusters[${cluster_index}].nodes[${node_index}].auth.provider`,
            value: proxmox_node.id,
          },
        });
      }
    }
  }
}

function ValidatePrivilegedAuth(
  raw_privileged_auth: proxmox_privileged_auth_t | undefined,
  path: string,
): proxmox_privileged_auth_t | undefined {
  if (raw_privileged_auth === undefined) {
    return undefined;
  }
  const provider = EnsureString(
    LoadField(raw_privileged_auth as unknown as Record<string, unknown>, "provider", path),
    `${path}.provider`,
    true,
  );
  if (provider !== "ticket") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "privileged_auth.provider must be ticket.",
      details: {
        field: `${path}.provider`,
        value: provider,
      },
    });
  }

  const username = EnsureString(
    LoadField(raw_privileged_auth as unknown as Record<string, unknown>, "username", path),
    `${path}.username`,
    true,
  );
  const password_object = EnsureObject(
    LoadField(raw_privileged_auth as unknown as Record<string, unknown>, "password", path),
    `${path}.password`,
  );
  const password = ValidateAuth(password_object, `${path}.password`);
  const renew_skew_seconds = EnsureOptionalNumber(
    LoadOptionalField(raw_privileged_auth as unknown as Record<string, unknown>, "renew_skew_seconds", path),
    `${path}.renew_skew_seconds`,
    { min: 0, integer: true },
  );

  return {
    provider: "ticket",
    username,
    password,
    renew_skew_seconds,
  };
}

function ValidateShellBackend(
  raw_shell_backend: string | undefined,
  path: string,
): proxmox_lxc_shell_backend_t | undefined {
  if (raw_shell_backend === undefined) {
    return undefined;
  }
  if (raw_shell_backend === "ssh_pct") {
    return raw_shell_backend;
  }
  throw new ProxmoxError({
    code: "proxmox.config.validation",
    message: "shell_backend must be ssh_pct.",
    details: {
      field: path,
      value: raw_shell_backend,
    },
  });
}

function ValidateSshShell(
  raw_ssh_shell: proxmox_ssh_shell_t | undefined,
  path: string,
): proxmox_ssh_shell_t | undefined {
  if (raw_ssh_shell === undefined) {
    return undefined;
  }
  const ssh_shell_record = raw_ssh_shell as unknown as Record<string, unknown>;
  const username = EnsureString(
    LoadField(ssh_shell_record, "username", path),
    `${path}.username`,
    true,
  );
  const host = EnsureOptionalString(
    LoadOptionalField(ssh_shell_record, "host", path),
    `${path}.host`,
  );
  const port = EnsureOptionalNumber(
    LoadOptionalField(ssh_shell_record, "port", path),
    `${path}.port`,
    {
      min: 1,
      max: 65535,
      integer: true,
    },
  );
  const password_auth = MaybeObject<proxmox_auth_t>(
    LoadOptionalField(ssh_shell_record, "password_auth", path),
  );
  const private_key_auth = MaybeObject<proxmox_auth_t>(
    LoadOptionalField(ssh_shell_record, "private_key_auth", path),
  );
  const private_key_passphrase_auth = MaybeObject<proxmox_auth_t>(
    LoadOptionalField(ssh_shell_record, "private_key_passphrase_auth", path),
  );
  const normalized_password_auth = password_auth === undefined
    ? undefined
    : ValidateAuth(password_auth as unknown as Record<string, unknown>, `${path}.password_auth`);
  const normalized_private_key_auth = private_key_auth === undefined
    ? undefined
    : ValidateAuth(private_key_auth as unknown as Record<string, unknown>, `${path}.private_key_auth`);
  const normalized_passphrase_auth = private_key_passphrase_auth === undefined
    ? undefined
    : ValidateAuth(private_key_passphrase_auth as unknown as Record<string, unknown>, `${path}.private_key_passphrase_auth`);
  if (normalized_password_auth === undefined && normalized_private_key_auth === undefined) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "ssh_shell must define password_auth or private_key_auth.",
      details: {
        field: path,
      },
    });
  }
  return {
    host,
    port,
    username,
    password_auth: normalized_password_auth,
    private_key_auth: normalized_private_key_auth,
    private_key_passphrase_auth: normalized_passphrase_auth,
    connect_timeout_ms: EnsureOptionalNumber(
      LoadOptionalField(ssh_shell_record, "connect_timeout_ms", path),
      `${path}.connect_timeout_ms`,
      {
        min: 250,
        max: 300000,
      },
    ),
    command_timeout_ms: EnsureOptionalNumber(
      LoadOptionalField(ssh_shell_record, "command_timeout_ms", path),
      `${path}.command_timeout_ms`,
      {
        min: 250,
        max: 300000,
      },
    ),
    idle_timeout_ms: EnsureOptionalNumber(
      LoadOptionalField(ssh_shell_record, "idle_timeout_ms", path),
      `${path}.idle_timeout_ms`,
      {
        min: 250,
        max: 3600000,
      },
    ),
    strict_host_key: EnsureOptionalBoolean(
      LoadOptionalField(ssh_shell_record, "strict_host_key", path),
      `${path}.strict_host_key`,
    ),
    host_fingerprint_sha256: EnsureOptionalString(
      LoadOptionalField(ssh_shell_record, "host_fingerprint_sha256", path),
      `${path}.host_fingerprint_sha256`,
    ),
    known_hosts_path: EnsureOptionalString(
      LoadOptionalField(ssh_shell_record, "known_hosts_path", path),
      `${path}.known_hosts_path`,
    ),
  };
}

function ValidateTransport(raw_transport: proxmox_transport_i | undefined, path: string): proxmox_transport_i | undefined {
  if (!raw_transport) {
    return undefined;
  }

  const transport_request_timeout_ms = EnsureOptionalNumber(
    raw_transport.request_timeout_ms,
    `${path}.request_timeout_ms`,
    { min: 100 },
  );
  const transport_connect_timeout_ms = EnsureOptionalNumber(
    raw_transport.connect_timeout_ms,
    `${path}.connect_timeout_ms`,
    { min: 100 },
  );
  const transport_keep_alive_ms = EnsureOptionalNumber(
    raw_transport.keep_alive_ms,
    `${path}.keep_alive_ms`,
    { min: 100 },
  );
  const transport_user_agent = EnsureOptionalString(
    raw_transport.user_agent,
    `${path}.user_agent`,
  );
  if (transport_user_agent !== undefined && transport_user_agent.length > 256) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "user_agent must be at most 256 characters.",
      details: {
        field: `${path}.user_agent`,
      },
    });
  }

  return {
    request_timeout_ms: transport_request_timeout_ms,
    connect_timeout_ms: transport_connect_timeout_ms,
    keep_alive_ms: transport_keep_alive_ms,
    user_agent: transport_user_agent,
    verify_tls: EnsureOptionalBoolean(
      raw_transport.verify_tls,
      `${path}.verify_tls`,
    ),
    ca_bundle_path: EnsureOptionalString(raw_transport.ca_bundle_path, `${path}.ca_bundle_path`),
  };
}

function ValidateRetryPolicy(
  raw_retry_policy: proxmox_retry_policy_i | undefined,
  path: string,
): proxmox_retry_policy_i | undefined {
  if (!raw_retry_policy) {
    return undefined;
  }

  const max_retries = EnsureOptionalNumber(
    raw_retry_policy.max_retries,
    `${path}.max_retries`,
    { min: 0, integer: true },
  );
  const base_delay_ms = EnsureOptionalNumber(
    raw_retry_policy.base_delay_ms,
    `${path}.base_delay_ms`,
    { min: 0 },
  );
  const max_delay_ms = EnsureOptionalNumber(
    raw_retry_policy.max_delay_ms,
    `${path}.max_delay_ms`,
    { min: 0 },
  );
  const jitter_ratio = EnsureOptionalNumber(
    raw_retry_policy.jitter_ratio,
    `${path}.jitter_ratio`,
    { min: 0, max: 1 },
  );

  if (
    base_delay_ms !== undefined &&
    max_delay_ms !== undefined &&
    base_delay_ms > max_delay_ms
  ) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "base_delay_ms must not be greater than max_delay_ms.",
      details: { field: path },
    });
  }

  return {
    enabled: EnsureOptionalBoolean(raw_retry_policy.enabled, `${path}.enabled`),
    max_retries,
    base_delay_ms,
    max_delay_ms,
    jitter_ratio,
    retry_on_429: EnsureOptionalBoolean(raw_retry_policy.retry_on_429, `${path}.retry_on_429`),
    retry_on_500: EnsureOptionalBoolean(raw_retry_policy.retry_on_500, `${path}.retry_on_500`),
  };
}

function ValidateTaskPoller(
  raw_task_poller: proxmox_task_poller_i | undefined,
  path: string,
): proxmox_task_poller_i | undefined {
  if (!raw_task_poller) {
    return undefined;
  }

  const poll_interval_ms = EnsureOptionalNumber(
    raw_task_poller.poll_interval_ms,
    `${path}.poll_interval_ms`,
    { min: 250 },
  );
  const poll_timeout_ms = EnsureOptionalNumber(
    raw_task_poller.poll_timeout_ms,
    `${path}.poll_timeout_ms`,
    { min: 100 },
  );
  const max_poll_failures = EnsureOptionalNumber(
    raw_task_poller.max_poll_failures,
    `${path}.max_poll_failures`,
    { min: 0, integer: true },
  );

  if (poll_interval_ms !== undefined && poll_timeout_ms !== undefined) {
    if (poll_interval_ms > poll_timeout_ms) {
      throw new ProxmoxError({
        code: "proxmox.config.validation",
        message: "poll_interval_ms must be less than or equal to poll_timeout_ms.",
        details: { field: path },
      });
    }
  }

  return {
    enabled: EnsureOptionalBoolean(raw_task_poller.enabled, `${path}.enabled`),
    poll_interval_ms,
    poll_timeout_ms,
    max_poll_failures,
  };
}

function ResolveRuntimeDefaults(raw_defaults: proxmox_runtime_defaults_i | undefined): proxmox_runtime_defaults_resolved_t {
  return {
    request_timeout_ms: EnsureOptionalNumber(
      raw_defaults?.request_timeout_ms,
      "defaults.request_timeout_ms",
      { min: 100 },
    ) ?? default_runtime_defaults_t.request_timeout_ms,
    connect_timeout_ms: EnsureOptionalNumber(
      raw_defaults?.connect_timeout_ms,
      "defaults.connect_timeout_ms",
      { min: 100 },
    ) ?? default_runtime_defaults_t.connect_timeout_ms,
    keep_alive_ms: EnsureOptionalNumber(
      raw_defaults?.keep_alive_ms,
      "defaults.keep_alive_ms",
      { min: 0 },
    ) ?? default_runtime_defaults_t.keep_alive_ms,
    user_agent: EnsureOptionalString(raw_defaults?.user_agent, "defaults.user_agent") ??
      default_runtime_defaults_t.user_agent,
    max_concurrency: EnsureOptionalNumber(
      raw_defaults?.max_concurrency,
      "defaults.max_concurrency",
      { min: 1, integer: true },
    ) ?? default_runtime_defaults_t.max_concurrency,
  };
}

function ResolveLogging(raw_logging: proxmox_logging_i | undefined): proxmox_logging_resolved_t {
  const logging = raw_logging ?? {};
  const level = EnsureOptionalLogLevel(logging.level);
  return {
    level: level,
    include_request_id: EnsureOptionalBoolean(logging.include_request_id, "logging.include_request_id") ??
      default_logging_t.include_request_id,
    redact_headers:
      logging.redact_headers && logging.redact_headers.length > 0
        ? logging.redact_headers
        : default_logging_t.redact_headers,
    structured:
      logging.structured !== undefined
        ? EnsureBoolean(logging.structured, "logging.structured")
        : default_logging_t.structured,
  };
}

function ResolveSecurity(raw_security: proxmox_security_i | undefined): proxmox_security_resolved_t {
  const security = raw_security ?? {};
  return {
    redact_secrets_in_logs:
      security.redact_secrets_in_logs !== undefined
        ? EnsureBoolean(security.redact_secrets_in_logs, "security.redact_secrets_in_logs")
        : default_security_t.redact_secrets_in_logs,
    allow_plaintext_api_key_in_file:
      security.allow_plaintext_api_key_in_file !== undefined
        ? EnsureBoolean(
            security.allow_plaintext_api_key_in_file,
            "security.allow_plaintext_api_key_in_file",
          )
        : default_security_t.allow_plaintext_api_key_in_file,
    minimum_tls_version:
      EnsureOptionalTlsVersion(security.minimum_tls_version, "security.minimum_tls_version"),
    allowed_hostname_patterns:
      security.allowed_hostname_patterns && security.allowed_hostname_patterns.length > 0
        ? security.allowed_hostname_patterns
        : default_security_t.allowed_hostname_patterns,
    disable_ssl_verification:
      security.disable_ssl_verification !== undefined
        ? EnsureBoolean(security.disable_ssl_verification, "security.disable_ssl_verification")
        : default_security_t.disable_ssl_verification,
    secret_rotation_reminder_days:
      EnsureOptionalNumber(
        security.secret_rotation_reminder_days,
        "security.secret_rotation_reminder_days",
        { min: 1, integer: true },
      ) ?? default_security_t.secret_rotation_reminder_days,
  };
}

function MergeTransport(
  defaults: proxmox_runtime_defaults_resolved_t,
  overrides: proxmox_transport_i | undefined,
): proxmox_transport_resolved_t {
  return {
    request_timeout_ms:
      overrides?.request_timeout_ms ?? defaults.request_timeout_ms,
    connect_timeout_ms:
      overrides?.connect_timeout_ms ?? defaults.connect_timeout_ms,
    keep_alive_ms: overrides?.keep_alive_ms ?? defaults.keep_alive_ms,
    user_agent:
      overrides?.user_agent ?? defaults.user_agent,
    verify_tls: overrides?.verify_tls ?? default_transport_t.verify_tls,
    ca_bundle_path: overrides?.ca_bundle_path,
  };
}

function MergeRetryPolicy(
  overrides: proxmox_retry_policy_i | undefined,
): proxmox_retry_policy_resolved_t {
  return {
    enabled: overrides?.enabled ?? default_retry_policy_t.enabled,
    max_retries: overrides?.max_retries ?? default_retry_policy_t.max_retries,
    base_delay_ms: overrides?.base_delay_ms ?? default_retry_policy_t.base_delay_ms,
    max_delay_ms: overrides?.max_delay_ms ?? default_retry_policy_t.max_delay_ms,
    jitter_ratio: overrides?.jitter_ratio ?? default_retry_policy_t.jitter_ratio,
    retry_on_429: overrides?.retry_on_429 ?? default_retry_policy_t.retry_on_429,
    retry_on_500: overrides?.retry_on_500 ?? default_retry_policy_t.retry_on_500,
  };
}

function MergeTaskPoller(
  overrides: proxmox_task_poller_i | undefined,
): proxmox_task_poller_resolved_t {
  return {
    enabled: overrides?.enabled ?? default_task_poller_t.enabled,
    poll_interval_ms:
      overrides?.poll_interval_ms ?? default_task_poller_t.poll_interval_ms,
    poll_timeout_ms:
      overrides?.poll_timeout_ms ?? default_task_poller_t.poll_timeout_ms,
    max_poll_failures:
      overrides?.max_poll_failures ?? default_task_poller_t.max_poll_failures,
  };
}

function EnsureSchemaVersion(value: unknown, field: string): 1 {
  const parsed = EnsureNumber(value, field, { min: 1, max: 1 });
  if (parsed !== 1) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "Unsupported schema_version.",
      details: {
        field,
        value: String(parsed),
      },
    });
  }
  return 1;
}

function EnsureEnvironment(value: string, field: string): proxmox_env_t {
  if (value !== "prod" && value !== "stage" && value !== "dev") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "environment must be prod, stage, or dev.",
      details: {
        field,
        value,
      },
    });
  }
  return value;
}

function EnsureOptionalProtocol(value: string | undefined): proxmox_protocol_t | undefined {
  if (value === undefined) {
    return "https";
  }
  if (value !== "http" && value !== "https") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "protocol must be http or https.",
      details: {
        field: "protocol",
        value,
      },
    });
  }
  return value;
}

function EnsureHost(value: string): string {
  return value.trim();
}

function EnsureObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Expected object at ${field}.`,
      details: {
        field,
      },
    });
  }
  return value as Record<string, unknown>;
}

function MaybeObject<T>(value: unknown): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  return EnsureObject(value, "optional object") as T;
}

function LoadField(
  value: Record<string, unknown>,
  field: string,
  parent: string,
): unknown {
  if (!(field in value)) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Missing required field ${field}.`,
      details: {
        field: `${parent}.${field}`,
      },
    });
  }
  return value[field];
}

function LoadOptionalField(
  value: Record<string, unknown>,
  field: string,
  parent: string,
): unknown | undefined {
  if (!(field in value)) {
    return undefined;
  }
  return value[field];
}

function EnsureString(value: unknown, field: string, required: boolean): string;
function EnsureString(value: unknown, field: string, required: false): string | undefined;
function EnsureString(value: unknown, field: string, required: boolean): string | undefined {
  if (value === undefined || value === null) {
    if (required) {
      throw new ProxmoxError({
        code: "proxmox.config.validation",
        message: `Missing required string value at ${field}.`,
        details: {
          field,
        },
      });
    }
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Expected string at ${field}.`,
      details: {
        field,
      },
    });
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Expected non-empty string at ${field}.`,
      details: {
        field,
      },
    });
  }
  return trimmed;
}

function EnsureOptionalString(value: unknown, field: string): string | undefined {
  return EnsureString(value, field, false);
}

function EnsureNumber(
  value: unknown,
  field: string,
  options?: {
    min?: number;
    max?: number;
    integer?: boolean;
  },
): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Expected number at ${field}.`,
      details: {
        field,
      },
    });
  }
  return EnsureNumberInRange(value, field, options);
}

function EnsureOptionalNumber(
  value: unknown,
  field: string,
  options?: {
    min?: number;
    max?: number;
    integer?: boolean;
  },
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return EnsureNumber(value, field, options);
}

function EnsureNumberInRange(
  value: number,
  field: string,
  options?: {
    min?: number;
    max?: number;
    integer?: boolean;
  },
): number {
  if (options?.integer && !Number.isInteger(value)) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Expected integer at ${field}.`,
      details: { field },
    });
  }
  if (options?.min !== undefined && value < options.min) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Value at ${field} is below minimum.`,
      details: { field },
    });
  }
  if (options?.max !== undefined && value > options.max) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Value at ${field} is above maximum.`,
      details: { field },
    });
  }
  return value;
}

function EnsureBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Expected boolean at ${field}.`,
      details: { field },
    });
  }
  return value;
}

function EnsureOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return EnsureBoolean(value, field);
}

function EnsureOptionalLogLevel(value: proxmox_log_level_t | undefined): proxmox_log_level_t {
  if (value === undefined) {
    return default_logging_t.level;
  }
  if (value !== "error" && value !== "warn" && value !== "info" && value !== "debug") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "Invalid logging level.",
      details: {
        field: "logging.level",
        value,
      },
    });
  }
  return value;
}

function EnsureOptionalTlsVersion(
  value: proxmox_tls_version_t | undefined,
  field: string,
): proxmox_tls_version_t {
  if (value === undefined) {
    return default_security_t.minimum_tls_version;
  }
  if (value !== "TLSv1.2" && value !== "TLSv1.3") {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: "minimum_tls_version must be TLSv1.2 or TLSv1.3.",
      details: {
        field,
        value,
      },
    });
  }
  return value;
}

function EnsureArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProxmoxError({
      code: "proxmox.config.validation",
      message: `Expected array at ${field}.`,
      details: { field },
    });
  }
  return value;
}

function MakeTokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}
