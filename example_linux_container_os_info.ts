import {
  LoadConfig,
  ProxmoxAuthError,
  ProxmoxClient,
  ProxmoxError,
  ProxmoxHttpError,
  ProxmoxLxcExecError,
  ProxmoxTimeoutError,
  ProxmoxValidationError,
  ResolveProfile,
} from "./src/index";

function NormalizeBoolean(raw_value: string | undefined): boolean {
  if (raw_value === undefined) {
    return false;
  }
  const normalized_value = raw_value.trim().toLowerCase();
  return (
    normalized_value === "1"
    || normalized_value === "true"
    || normalized_value === "yes"
    || normalized_value === "on"
  );
}

function ResolveOptionalPositiveInteger(params: {
  raw_value: string | undefined;
  field_name: string;
}): number | undefined {
  if (params.raw_value === undefined || params.raw_value.trim().length === 0) {
    return undefined;
  }
  const parsed_value = Number.parseInt(params.raw_value.trim(), 10);
  if (!Number.isInteger(parsed_value) || parsed_value <= 0) {
    throw new Error(`${params.field_name} must be a positive integer.`);
  }
  return parsed_value;
}

function NormalizeOptionalText(raw_value: string | undefined): string | undefined {
  if (raw_value === undefined) {
    return undefined;
  }
  const normalized_value = raw_value.trim();
  return normalized_value.length > 0 ? normalized_value : undefined;
}

function ResolveContainerId(raw_value: string | undefined): number {
  const resolved_container_id = ResolveOptionalPositiveInteger({
    raw_value,
    field_name: "PROXMOX_EXAMPLE_OSINFO_CONTAINER_ID",
  });
  return resolved_container_id ?? 100;
}

function ResolveNodeRecordId(node_record: {
  node?: string;
  name?: string;
  id?: string;
}): string | undefined {
  if (typeof node_record.node === "string" && node_record.node.trim().length > 0) {
    return node_record.node;
  }
  if (typeof node_record.name === "string" && node_record.name.trim().length > 0) {
    return node_record.name;
  }
  if (typeof node_record.id === "string" && node_record.id.trim().length > 0) {
    return node_record.id;
  }
  return undefined;
}

function RenderUnknown(input: unknown): string {
  if (input instanceof Error) {
    return `${input.name}: ${input.message}`;
  }
  if (typeof input === "string") {
    return input;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function LogErrorCauseChain(error: Error): void {
  let current_error: unknown = error;
  let depth = 1;
  while (
    depth <= 6
    && current_error instanceof Error
    && "cause" in current_error
    && current_error.cause !== undefined
  ) {
    const cause = current_error.cause;
    console.error(`[example] cause_${depth}=${RenderUnknown(cause)}`);
    current_error = cause;
    depth += 1;
  }
}

function HandleMainError(error: unknown): void {
  if (error instanceof ProxmoxLxcExecError) {
    console.error(`[example] lxc_exec_error code=${error.code} message=${error.message}`);
    if (error.details) {
      console.error(`[example] lxc_exec_error_details=${RenderUnknown(error.details)}`);
    }
    LogErrorCauseChain(error);
    return;
  }
  if (error instanceof ProxmoxValidationError) {
    console.error(`[example] validation_error code=${error.code} message=${error.message}`);
    if (error.details) {
      console.error(`[example] validation_error_details=${RenderUnknown(error.details)}`);
    }
    LogErrorCauseChain(error);
    return;
  }
  if (error instanceof ProxmoxAuthError) {
    console.error(`[example] auth_error code=${error.code} status=${String(error.status_code ?? "unknown")}`);
    LogErrorCauseChain(error);
    return;
  }
  if (error instanceof ProxmoxTimeoutError) {
    console.error(`[example] timeout_error code=${error.code} message=${error.message}`);
    LogErrorCauseChain(error);
    return;
  }
  if (error instanceof ProxmoxHttpError) {
    console.error(
      `[example] http_error code=${error.code} status=${String(error.status_code ?? "unknown")} message=${error.message}`,
    );
    if (error.details) {
      console.error(`[example] http_error_details=${RenderUnknown(error.details)}`);
    }
    LogErrorCauseChain(error);
    return;
  }
  if (error instanceof ProxmoxError) {
    console.error(`[example] proxmox_error code=${error.code} message=${error.message}`);
    if (error.details) {
      console.error(`[example] proxmox_error_details=${RenderUnknown(error.details)}`);
    }
    LogErrorCauseChain(error);
    return;
  }
  if (error instanceof Error) {
    console.error(`[example] error name=${error.name} message=${error.message}`);
    LogErrorCauseChain(error);
    return;
  }
  console.error(`[example] unexpected_error=${RenderUnknown(error)}`);
}

async function Main(): Promise<void> {
  const run_smoke = process.env.PROXMOX_EXAMPLE_OSINFO_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_OSINFO_RUN);
  const resolved_config_path = process.env.PROXMOXLIB_CONFIG_PATH?.trim()
    || "/home/tourist/environment_files/proxmoxlib/proxmoxlib.json";
  const selected_profile_name = process.env.PROXMOXLIB_PROFILE?.trim() || undefined;
  const target_node_id = process.env.PROXMOX_EXAMPLE_OSINFO_NODE_ID?.trim() || "g75";
  const target_container_id = ResolveContainerId(process.env.PROXMOX_EXAMPLE_OSINFO_CONTAINER_ID);
  const timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_OSINFO_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_OSINFO_TIMEOUT_MS",
  }) ?? 30000;
  const cron_smoke_run = process.env.PROXMOX_EXAMPLE_CRON_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CRON_SMOKE_RUN);
  const cron_include_system = process.env.PROXMOX_EXAMPLE_CRON_INCLUDE_SYSTEM === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CRON_INCLUDE_SYSTEM);
  const cron_include_user = process.env.PROXMOX_EXAMPLE_CRON_INCLUDE_USER === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CRON_INCLUDE_USER);
  const process_smoke_run = process.env.PROXMOX_EXAMPLE_PROCESS_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_PROCESS_SMOKE_RUN);
  const process_include_environment = process.env.PROXMOX_EXAMPLE_PROCESS_INCLUDE_ENV === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_PROCESS_INCLUDE_ENV);
  const process_environment_mode_raw = process.env.PROXMOX_EXAMPLE_PROCESS_ENV_MODE?.trim().toLowerCase();
  const process_environment_mode = process_environment_mode_raw === "none"
    || process_environment_mode_raw === "keys_only"
    || process_environment_mode_raw === "sanitized_values"
    ? process_environment_mode_raw
    : "keys_only";
  const process_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_PROCESS_LIMIT,
    field_name: "PROXMOX_EXAMPLE_PROCESS_LIMIT",
  }) ?? 200;
  const process_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_PROCESS_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_PROCESS_TIMEOUT_MS",
  }) ?? 30000;
  const tcp_smoke_run = process.env.PROXMOX_EXAMPLE_TCP_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_TCP_SMOKE_RUN);
  const tcp_include_environment = process.env.PROXMOX_EXAMPLE_TCP_INCLUDE_ENV === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_TCP_INCLUDE_ENV);
  const tcp_environment_mode_raw = process.env.PROXMOX_EXAMPLE_TCP_ENV_MODE?.trim().toLowerCase();
  const tcp_environment_mode = tcp_environment_mode_raw === "none"
    || tcp_environment_mode_raw === "keys_only"
    || tcp_environment_mode_raw === "sanitized_values"
    ? tcp_environment_mode_raw
    : "keys_only";
  const tcp_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_TCP_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_TCP_TIMEOUT_MS",
  }) ?? 30000;
  const tcp_listener_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_TCP_LISTENER_LIMIT,
    field_name: "PROXMOX_EXAMPLE_TCP_LISTENER_LIMIT",
  }) ?? 512;
  const tcp_include_loopback = process.env.PROXMOX_EXAMPLE_TCP_INCLUDE_LOOPBACK === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_TCP_INCLUDE_LOOPBACK);
  const tcp_include_interfaces = process.env.PROXMOX_EXAMPLE_TCP_INCLUDE_INTERFACES === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_TCP_INCLUDE_INTERFACES);
  const udp_smoke_run = process.env.PROXMOX_EXAMPLE_UDP_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UDP_SMOKE_RUN);
  const udp_include_environment = process.env.PROXMOX_EXAMPLE_UDP_INCLUDE_ENV === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UDP_INCLUDE_ENV);
  const udp_environment_mode_raw = process.env.PROXMOX_EXAMPLE_UDP_ENV_MODE?.trim().toLowerCase();
  const udp_environment_mode = udp_environment_mode_raw === "none"
    || udp_environment_mode_raw === "keys_only"
    || udp_environment_mode_raw === "sanitized_values"
    ? udp_environment_mode_raw
    : "keys_only";
  const udp_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_UDP_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_UDP_TIMEOUT_MS",
  }) ?? 30000;
  const udp_listener_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_UDP_LISTENER_LIMIT,
    field_name: "PROXMOX_EXAMPLE_UDP_LISTENER_LIMIT",
  }) ?? 512;
  const udp_include_loopback = process.env.PROXMOX_EXAMPLE_UDP_INCLUDE_LOOPBACK === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UDP_INCLUDE_LOOPBACK);
  const udp_include_interfaces = process.env.PROXMOX_EXAMPLE_UDP_INCLUDE_INTERFACES === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UDP_INCLUDE_INTERFACES);
  const service_smoke_run = process.env.PROXMOX_EXAMPLE_SERVICE_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_SERVICE_SMOKE_RUN);
  const service_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_SERVICE_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_SERVICE_TIMEOUT_MS",
  }) ?? 30000;
  const service_include_inactive = process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_INACTIVE === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_INACTIVE);
  const service_include_failed = process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_FAILED === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_FAILED);
  const service_include_disabled = process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_DISABLED === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_DISABLED);
  const service_include_process_details = process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_PROCESS_DETAILS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_SERVICE_INCLUDE_PROCESS_DETAILS);
  const service_process_enrichment_mode_raw = process.env.PROXMOX_EXAMPLE_SERVICE_PROCESS_ENRICHMENT_MODE?.trim().toLowerCase();
  const service_process_enrichment_mode = service_process_enrichment_mode_raw === "none"
    || service_process_enrichment_mode_raw === "main_pid_only"
    || service_process_enrichment_mode_raw === "full"
    ? service_process_enrichment_mode_raw
    : (service_include_process_details ? "full" : "none");
  const service_detail_level_raw = process.env.PROXMOX_EXAMPLE_SERVICE_DETAIL_LEVEL?.trim().toLowerCase();
  const service_detail_level = service_detail_level_raw === "summary_only"
    || service_detail_level_raw === "standard"
    || service_detail_level_raw === "full"
    ? service_detail_level_raw
    : "standard";
  const service_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_SERVICE_LIMIT,
    field_name: "PROXMOX_EXAMPLE_SERVICE_LIMIT",
  }) ?? 512;
  const hardware_smoke_run = process.env.PROXMOX_EXAMPLE_HARDWARE_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_HARDWARE_SMOKE_RUN);
  const hardware_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_HARDWARE_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_HARDWARE_TIMEOUT_MS",
  }) ?? 30000;
  const hardware_device_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_HARDWARE_DEVICE_LIMIT,
    field_name: "PROXMOX_EXAMPLE_HARDWARE_DEVICE_LIMIT",
  }) ?? 512;
  const hardware_include_network = process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_NETWORK === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_NETWORK);
  const hardware_include_storage = process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_STORAGE === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_STORAGE);
  const hardware_include_pci = process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_PCI === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_PCI);
  const hardware_include_usb = process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_USB === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_USB);
  const hardware_include_graphics = process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_GRAPHICS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_GRAPHICS);
  const hardware_include_virtual = process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_VIRTUAL === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_HARDWARE_INCLUDE_VIRTUAL);
  const disk_smoke_run = process.env.PROXMOX_EXAMPLE_DISK_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DISK_SMOKE_RUN);
  const disk_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DISK_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_DISK_TIMEOUT_MS",
  }) ?? 30000;
  const disk_device_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DISK_DEVICE_LIMIT,
    field_name: "PROXMOX_EXAMPLE_DISK_DEVICE_LIMIT",
  }) ?? 512;
  const disk_filesystem_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DISK_FILESYSTEM_LIMIT,
    field_name: "PROXMOX_EXAMPLE_DISK_FILESYSTEM_LIMIT",
  }) ?? 1024;
  const disk_include_partitions = process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_PARTITIONS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_PARTITIONS);
  const disk_include_filesystems = process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_FILESYSTEMS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_FILESYSTEMS);
  const disk_include_mounts = process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_MOUNTS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_MOUNTS);
  const disk_include_usage = process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_USAGE === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_USAGE);
  const disk_include_loop = process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_LOOP === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_LOOP);
  const disk_include_virtual = process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_VIRTUAL === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DISK_INCLUDE_VIRTUAL);
  const disk_filesystem_scope_raw = process.env.PROXMOX_EXAMPLE_DISK_FILESYSTEM_SCOPE?.trim().toLowerCase();
  const disk_filesystem_scope = disk_filesystem_scope_raw === "all"
    || disk_filesystem_scope_raw === "device_backed_only"
    || disk_filesystem_scope_raw === "persistent_only"
    ? disk_filesystem_scope_raw
    : "all";
  const memory_smoke_run = process.env.PROXMOX_EXAMPLE_MEMORY_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_MEMORY_SMOKE_RUN);
  const memory_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_MEMORY_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_MEMORY_TIMEOUT_MS",
  }) ?? 30000;
  const memory_process_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_MEMORY_PROCESS_LIMIT,
    field_name: "PROXMOX_EXAMPLE_MEMORY_PROCESS_LIMIT",
  }) ?? 200;
  const memory_min_process_rss_kb = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_MEMORY_MIN_PROCESS_RSS_KB,
    field_name: "PROXMOX_EXAMPLE_MEMORY_MIN_PROCESS_RSS_KB",
  });
  const memory_include_process_breakdown = process.env.PROXMOX_EXAMPLE_MEMORY_INCLUDE_PROCESS_BREAKDOWN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_MEMORY_INCLUDE_PROCESS_BREAKDOWN);
  const memory_include_kernel_breakdown = process.env.PROXMOX_EXAMPLE_MEMORY_INCLUDE_KERNEL_BREAKDOWN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_MEMORY_INCLUDE_KERNEL_BREAKDOWN);
  const memory_include_cgroup_limits = process.env.PROXMOX_EXAMPLE_MEMORY_INCLUDE_CGROUP_LIMITS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_MEMORY_INCLUDE_CGROUP_LIMITS);
  const cpu_smoke_run = process.env.PROXMOX_EXAMPLE_CPU_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CPU_SMOKE_RUN);
  const cpu_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_CPU_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_CPU_TIMEOUT_MS",
  }) ?? 30000;
  const cpu_include_per_core = process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_PER_CORE === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_PER_CORE);
  const cpu_include_flags = process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_FLAGS === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_FLAGS);
  const cpu_include_top_snapshot = process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_TOP_SNAPSHOT === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_TOP_SNAPSHOT);
  const cpu_include_cgroup_limits = process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_CGROUP_LIMITS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_CGROUP_LIMITS);
  const cpu_include_cpu_pressure = process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_CPU_PRESSURE === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_CPU_INCLUDE_CPU_PRESSURE);
  const cpu_core_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_CPU_CORE_LIMIT,
    field_name: "PROXMOX_EXAMPLE_CPU_CORE_LIMIT",
  }) ?? 512;
  const identity_smoke_run = process.env.PROXMOX_EXAMPLE_IDENTITY_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_IDENTITY_SMOKE_RUN);
  const identity_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_IDENTITY_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_IDENTITY_TIMEOUT_MS",
  }) ?? 30000;
  const identity_include_system = process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_SYSTEM === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_SYSTEM);
  const identity_include_shadow_status = process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_SHADOW_STATUS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_SHADOW_STATUS);
  const identity_include_last_login = process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_LAST_LOGIN === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_LAST_LOGIN);
  const identity_include_sudo_signals = process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_SUDO_SIGNALS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_SUDO_SIGNALS);
  const identity_privilege_detail_mode_raw = process.env.PROXMOX_EXAMPLE_IDENTITY_PRIVILEGE_DETAIL_MODE?.trim().toLowerCase();
  const identity_privilege_detail_mode = identity_privilege_detail_mode_raw === "signals_only"
    || identity_privilege_detail_mode_raw === "sudoers_expanded"
    ? identity_privilege_detail_mode_raw
    : "sudoers_expanded";
  const identity_include_group_memberships = process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_GROUP_MEMBERSHIPS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_IDENTITY_INCLUDE_GROUP_MEMBERSHIPS);
  const identity_user_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_IDENTITY_USER_LIMIT,
    field_name: "PROXMOX_EXAMPLE_IDENTITY_USER_LIMIT",
  }) ?? 1024;
  const identity_group_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_IDENTITY_GROUP_LIMIT,
    field_name: "PROXMOX_EXAMPLE_IDENTITY_GROUP_LIMIT",
  }) ?? 1024;
  const firewall_smoke_run = process.env.PROXMOX_EXAMPLE_FIREWALL_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_FIREWALL_SMOKE_RUN);
  const firewall_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_FIREWALL_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_FIREWALL_TIMEOUT_MS",
  }) ?? 30000;
  const firewall_include_raw_rules = process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_RAW_RULES === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_RAW_RULES);
  const firewall_include_nat = process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_NAT === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_NAT);
  const firewall_include_counters = process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_COUNTERS === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_COUNTERS);
  const firewall_include_ipv6 = process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_IPV6 === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_IPV6);
  const firewall_include_findings = process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_FINDINGS === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_FIREWALL_INCLUDE_FINDINGS);
  const firewall_rule_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_FIREWALL_RULE_LIMIT,
    field_name: "PROXMOX_EXAMPLE_FIREWALL_RULE_LIMIT",
  }) ?? 2048;
  const firewall_finding_limit = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_FIREWALL_FINDING_LIMIT,
    field_name: "PROXMOX_EXAMPLE_FIREWALL_FINDING_LIMIT",
  }) ?? 128;
  const devtools_smoke_run = process.env.PROXMOX_EXAMPLE_DEVTOOLS_SMOKE_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DEVTOOLS_SMOKE_RUN);
  const devtools_timeout_ms = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DEVTOOLS_TIMEOUT_MS,
    field_name: "PROXMOX_EXAMPLE_DEVTOOLS_TIMEOUT_MS",
  }) ?? 30000;
  const devtools_include_package_inventory = process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_PACKAGE_INVENTORY === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_PACKAGE_INVENTORY);
  const devtools_include_compiler_search_paths = process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_COMPILER_SEARCH_PATHS === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_COMPILER_SEARCH_PATHS);
  const devtools_module_limit_per_runtime = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DEVTOOLS_MODULE_LIMIT_PER_RUNTIME,
    field_name: "PROXMOX_EXAMPLE_DEVTOOLS_MODULE_LIMIT_PER_RUNTIME",
  }) ?? 200;
  const devtools_package_limit_per_runtime = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DEVTOOLS_PACKAGE_LIMIT_PER_RUNTIME,
    field_name: "PROXMOX_EXAMPLE_DEVTOOLS_PACKAGE_LIMIT_PER_RUNTIME",
  }) ?? 500;
  const devtools_include_transitive_metadata = process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_TRANSITIVE_METADATA === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_TRANSITIVE_METADATA);
  const devtools_include_distro_package_enrichment = process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_DISTRO_PACKAGE_ENRICHMENT === undefined
    ? false
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_DEVTOOLS_INCLUDE_DISTRO_PACKAGE_ENRICHMENT);
  const devtools_distro_package_limit_total = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DEVTOOLS_DISTRO_PACKAGE_LIMIT_TOTAL,
    field_name: "PROXMOX_EXAMPLE_DEVTOOLS_DISTRO_PACKAGE_LIMIT_TOTAL",
  }) ?? 2000;
  const devtools_distro_package_limit_per_ecosystem = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_DEVTOOLS_DISTRO_PACKAGE_LIMIT_PER_ECOSYSTEM,
    field_name: "PROXMOX_EXAMPLE_DEVTOOLS_DISTRO_PACKAGE_LIMIT_PER_ECOSYSTEM",
  }) ?? 500;
  const report_smoke_run = process.env.PROXMOX_EXAMPLE_REPORT_RUN === undefined
    ? true
    : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_REPORT_RUN);
  const report_output_dir = NormalizeOptionalText(process.env.PROXMOX_EXAMPLE_REPORT_OUTPUT_DIR) ?? "/tmp";
  const report_filename_prefix = NormalizeOptionalText(process.env.PROXMOX_EXAMPLE_REPORT_FILENAME_PREFIX)
    ?? "proxmox-lxc-report";

  if (!run_smoke) {
    console.info("[example] PROXMOX_EXAMPLE_OSINFO_RUN disabled, skipping.");
    return;
  }

  console.info(`[example] config_path=${resolved_config_path}`);
  console.info(`[example] profile_name=${selected_profile_name ?? "active_profile(default)"}`);
  console.info(`[example] target_node=${target_node_id} target_container_id=${target_container_id}`);
  console.info(`[example] timeout_ms=${timeout_ms}`);
  console.info(
    `[example] cron_smoke_run=${String(cron_smoke_run)} include_system=${String(cron_include_system)} include_user=${String(cron_include_user)}`,
  );
  console.info(
    `[example] process_smoke_run=${String(process_smoke_run)} include_env=${String(process_include_environment)} env_mode=${process_environment_mode} process_limit=${process_limit}`,
  );
  console.info(
    `[example] tcp_smoke_run=${String(tcp_smoke_run)} include_env=${String(tcp_include_environment)} env_mode=${tcp_environment_mode} listener_limit=${tcp_listener_limit} include_loopback=${String(tcp_include_loopback)} include_interfaces=${String(tcp_include_interfaces)}`,
  );
  console.info(
    `[example] udp_smoke_run=${String(udp_smoke_run)} include_env=${String(udp_include_environment)} env_mode=${udp_environment_mode} listener_limit=${udp_listener_limit} include_loopback=${String(udp_include_loopback)} include_interfaces=${String(udp_include_interfaces)}`,
  );
  console.info(
    `[example] service_smoke_run=${String(service_smoke_run)} include_inactive=${String(service_include_inactive)} include_failed=${String(service_include_failed)} include_disabled=${String(service_include_disabled)} include_process_details=${String(service_include_process_details)} process_enrichment_mode=${service_process_enrichment_mode} detail_level=${service_detail_level} service_limit=${service_limit}`,
  );
  console.info(
    `[example] hardware_smoke_run=${String(hardware_smoke_run)} timeout_ms=${hardware_timeout_ms} device_limit=${hardware_device_limit} include_network=${String(hardware_include_network)} include_storage=${String(hardware_include_storage)} include_pci=${String(hardware_include_pci)} include_usb=${String(hardware_include_usb)} include_graphics=${String(hardware_include_graphics)} include_virtual=${String(hardware_include_virtual)}`,
  );
  console.info(
    `[example] disk_smoke_run=${String(disk_smoke_run)} timeout_ms=${disk_timeout_ms} device_limit=${disk_device_limit} filesystem_limit=${disk_filesystem_limit} include_partitions=${String(disk_include_partitions)} include_filesystems=${String(disk_include_filesystems)} include_mounts=${String(disk_include_mounts)} include_usage=${String(disk_include_usage)} include_loop=${String(disk_include_loop)} include_virtual=${String(disk_include_virtual)} filesystem_scope=${disk_filesystem_scope}`,
  );
  console.info(
    `[example] memory_smoke_run=${String(memory_smoke_run)} timeout_ms=${memory_timeout_ms} process_limit=${memory_process_limit} min_process_rss_kb=${String(memory_min_process_rss_kb ?? "unset")} include_process_breakdown=${String(memory_include_process_breakdown)} include_kernel_breakdown=${String(memory_include_kernel_breakdown)} include_cgroup_limits=${String(memory_include_cgroup_limits)}`,
  );
  console.info(
    `[example] cpu_smoke_run=${String(cpu_smoke_run)} timeout_ms=${cpu_timeout_ms} include_per_core=${String(cpu_include_per_core)} include_flags=${String(cpu_include_flags)} include_top_snapshot=${String(cpu_include_top_snapshot)} include_cgroup_limits=${String(cpu_include_cgroup_limits)} include_cpu_pressure=${String(cpu_include_cpu_pressure)} core_limit=${cpu_core_limit}`,
  );
  console.info(
    `[example] identity_smoke_run=${String(identity_smoke_run)} timeout_ms=${identity_timeout_ms} include_system=${String(identity_include_system)} include_shadow_status=${String(identity_include_shadow_status)} include_last_login=${String(identity_include_last_login)} include_sudo_signals=${String(identity_include_sudo_signals)} privilege_detail_mode=${identity_privilege_detail_mode} include_group_memberships=${String(identity_include_group_memberships)} user_limit=${identity_user_limit} group_limit=${identity_group_limit}`,
  );
  console.info(
    `[example] firewall_smoke_run=${String(firewall_smoke_run)} timeout_ms=${firewall_timeout_ms} include_raw_rules=${String(firewall_include_raw_rules)} include_nat=${String(firewall_include_nat)} include_counters=${String(firewall_include_counters)} include_ipv6=${String(firewall_include_ipv6)} include_findings=${String(firewall_include_findings)} rule_limit=${firewall_rule_limit} finding_limit=${firewall_finding_limit}`,
  );
  console.info(
    `[example] devtools_smoke_run=${String(devtools_smoke_run)} timeout_ms=${devtools_timeout_ms} include_package_inventory=${String(devtools_include_package_inventory)} include_compiler_search_paths=${String(devtools_include_compiler_search_paths)} module_limit_per_runtime=${devtools_module_limit_per_runtime} package_limit_per_runtime=${devtools_package_limit_per_runtime} include_transitive_metadata=${String(devtools_include_transitive_metadata)} include_distro_package_enrichment=${String(devtools_include_distro_package_enrichment)} distro_package_limit_total=${devtools_distro_package_limit_total} distro_package_limit_per_ecosystem=${devtools_distro_package_limit_per_ecosystem}`,
  );
  console.info(
    `[example] report_smoke_run=${String(report_smoke_run)} output_dir=${report_output_dir} filename_prefix=${report_filename_prefix}`,
  );

  const resolved_config = LoadConfig({
    config_path: resolved_config_path,
  });
  const resolved_profile = ResolveProfile({
    config: resolved_config,
    profile_name: selected_profile_name,
  });
  console.info(
    `[example] resolved_profile=${resolved_profile.name} resolved_cluster_id=${resolved_profile.cluster_id}`,
  );

  const proxmox_client = ProxmoxClient.fromPath({
    config_path: resolved_config_path,
    profile_name: selected_profile_name,
  });

  const nodes_response = await proxmox_client.node_service.listNodes();
  const target_node_exists = nodes_response.data.some((node_record) => {
    const resolved_node_id = ResolveNodeRecordId(node_record as {
      node?: string;
      name?: string;
      id?: string;
    });
    return resolved_node_id === target_node_id;
  });
  if (!target_node_exists) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Configured OS info smoke test node does not exist in cluster node list.",
      details: {
        field: "PROXMOX_EXAMPLE_OSINFO_NODE_ID",
        value: target_node_id,
      },
    });
  }
  console.info("[example] preflight_node_check=ok");

  const container_response = await proxmox_client.lxc_service.getContainer({
    node_id: target_node_id,
    container_id: target_container_id,
  });
  const container_status = String(
    (container_response.data as Record<string, unknown>).status ?? "unknown",
  );
  console.info(`[example] preflight_container_check=ok status=${container_status}`);

  const system_info = await proxmox_client.lxc_service.getSystemInfo({
    node_id: target_node_id,
    container_id: target_container_id,
    timeout_ms,
  });

  console.info(
    `[example] os_info distribution_pretty_name=${system_info.distribution_pretty_name ?? "unknown"} distribution_id=${system_info.distribution_id ?? "unknown"} distribution_version=${system_info.distribution_version ?? "unknown"}`,
  );
  console.info(
    `[example] kernel_info kernel_release=${system_info.kernel_release ?? "unknown"} kernel_version=${system_info.kernel_version ?? "unknown"}`,
  );
  console.info(
    `[example] source_fields distribution=${system_info.source_fields.distribution_pretty_name} kernel=${system_info.source_fields.kernel_release}`,
  );
  console.info(`[example] collected_at=${system_info.collected_at_iso}`);
  if (cron_smoke_run) {
    const cron_result = await proxmox_client.lxc_service.getCronJobs({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms,
      include_system_cron: cron_include_system,
      include_user_cron: cron_include_user,
    });
    const source_kind_counts: Record<string, number> = {};
    let disabled_count = 0;
    for (const cron_job of cron_result.jobs) {
      source_kind_counts[cron_job.source_kind] = (source_kind_counts[cron_job.source_kind] ?? 0) + 1;
      if (cron_job.is_disabled) {
        disabled_count += 1;
      }
    }
    console.info(
      `[example] cron_summary total_jobs=${cron_result.jobs.length} disabled_jobs=${disabled_count} parse_warnings=${cron_result.parse_warnings.length} scan_errors=${cron_result.scan_errors.length}`,
    );
    console.info(`[example] cron_source_counts=${RenderUnknown(source_kind_counts)}`);
    console.info(`[example] cron_sources_scanned=${cron_result.sources_scanned.length}`);
  } else {
    console.info("[example] cron_smoke_skipped=true");
  }

  if (process_smoke_run) {
    const process_result = await proxmox_client.lxc_service.getProcessList({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: process_timeout_ms,
      include_environment: process_include_environment,
      environment_mode: process_environment_mode,
      process_limit,
    });
    console.info(
      `[example] process_summary total=${process_result.summary.total_process_count} warnings=${process_result.parse_warnings.length} scan_errors=${process_result.scan_errors.length} truncated=${String(process_result.truncated)}`,
    );
    console.info(
      `[example] process_top_cpu_pids=${RenderUnknown(process_result.summary.top_cpu_pids)}`,
    );
    console.info(
      `[example] process_top_memory_pids=${RenderUnknown(process_result.summary.top_memory_pids)}`,
    );
    console.info(
      `[example] process_state_counts=${RenderUnknown(process_result.summary.state_counts)}`,
    );
    console.info(
      `[example] process_user_counts=${RenderUnknown(process_result.summary.user_counts)}`,
    );
  } else {
    console.info("[example] process_smoke_skipped=true");
  }
  if (tcp_smoke_run) {
    const tcp_result = await proxmox_client.lxc_service.getOpenTcpPorts({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: tcp_timeout_ms,
      include_environment: tcp_include_environment,
      environment_mode: tcp_environment_mode,
      include_loopback: tcp_include_loopback,
      include_interfaces: tcp_include_interfaces,
      listener_limit: tcp_listener_limit,
      process_limit,
    });
    console.info(
      `[example] tcp_summary total=${tcp_result.summary.total_listeners} unique_ports=${tcp_result.summary.unique_ports} warnings=${tcp_result.parse_warnings.length} scan_errors=${tcp_result.scan_errors.length} truncated=${String(tcp_result.truncated)}`,
    );
    console.info(`[example] tcp_top_ports=${RenderUnknown(tcp_result.summary.top_ports)}`);
    console.info(`[example] tcp_port_counts=${RenderUnknown(tcp_result.summary.port_counts)}`);
    console.info(`[example] tcp_process_counts=${RenderUnknown(tcp_result.summary.process_counts)}`);
    console.info(`[example] tcp_user_counts=${RenderUnknown(tcp_result.summary.user_counts)}`);
    console.info(
      `[example] tcp_interface_summary resolved=${tcp_result.summary.interface_resolved_count} unresolved=${tcp_result.summary.interface_unresolved_count}`,
    );
    console.info(
      `[example] tcp_top_interfaces=${RenderUnknown(tcp_result.summary.top_interfaces)}`,
    );
  } else {
    console.info("[example] tcp_smoke_skipped=true");
  }
  if (udp_smoke_run) {
    const udp_result = await proxmox_client.lxc_service.getOpenUdpPorts({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: udp_timeout_ms,
      include_environment: udp_include_environment,
      environment_mode: udp_environment_mode,
      include_loopback: udp_include_loopback,
      include_interfaces: udp_include_interfaces,
      listener_limit: udp_listener_limit,
      process_limit,
    });
    console.info(
      `[example] udp_summary total=${udp_result.summary.total_listeners} unique_ports=${udp_result.summary.unique_ports} warnings=${udp_result.parse_warnings.length} scan_errors=${udp_result.scan_errors.length} truncated=${String(udp_result.truncated)}`,
    );
    console.info(`[example] udp_top_ports=${RenderUnknown(udp_result.summary.top_ports)}`);
    console.info(`[example] udp_port_counts=${RenderUnknown(udp_result.summary.port_counts)}`);
    console.info(`[example] udp_process_counts=${RenderUnknown(udp_result.summary.process_counts)}`);
    console.info(`[example] udp_user_counts=${RenderUnknown(udp_result.summary.user_counts)}`);
    console.info(
      `[example] udp_interface_summary resolved=${udp_result.summary.interface_resolved_count} unresolved=${udp_result.summary.interface_unresolved_count}`,
    );
    console.info(
      `[example] udp_top_interfaces=${RenderUnknown(udp_result.summary.top_interfaces)}`,
    );
  } else {
    console.info("[example] udp_smoke_skipped=true");
  }
  if (service_smoke_run) {
    const service_result = await proxmox_client.lxc_service.getServicesAndDaemons({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: service_timeout_ms,
      include_inactive: service_include_inactive,
      include_failed: service_include_failed,
      include_disabled: service_include_disabled,
      include_process_details: service_include_process_details,
      process_enrichment_mode: service_process_enrichment_mode,
      detail_level: service_detail_level,
      service_limit,
    });
    console.info(
      `[example] service_summary manager=${service_result.service_manager} total=${service_result.summary.total_services} running=${service_result.summary.running_count} failed=${service_result.summary.failed_count} enabled=${service_result.summary.enabled_count} disabled=${service_result.summary.disabled_count} static=${service_result.summary.static_count} masked=${service_result.summary.masked_count} warnings=${service_result.parse_warnings.length} scan_errors=${service_result.scan_errors.length} truncated=${String(service_result.truncated)}`,
    );
    console.info(`[example] service_state_counts=${RenderUnknown(service_result.summary.state_counts)}`);
    console.info(`[example] service_manager_counts=${RenderUnknown(service_result.summary.manager_counts)}`);
    console.info(`[example] service_process_counts=${RenderUnknown(service_result.summary.process_counts)}`);
    console.info(`[example] service_user_counts=${RenderUnknown(service_result.summary.user_counts)}`);
    console.info(`[example] service_top_failed=${RenderUnknown(service_result.summary.top_failed_services)}`);
  } else {
    console.info("[example] service_smoke_skipped=true");
  }
  if (hardware_smoke_run) {
    const hardware_result = await proxmox_client.lxc_service.getHardwareInventory({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: hardware_timeout_ms,
      device_limit: hardware_device_limit,
      include_network: hardware_include_network,
      include_storage: hardware_include_storage,
      include_pci: hardware_include_pci,
      include_usb: hardware_include_usb,
      include_graphics: hardware_include_graphics,
      include_virtual_devices: hardware_include_virtual,
    });
    console.info(
      `[example] hardware_summary total=${hardware_result.summary.total_devices} network=${hardware_result.summary.network_device_count} storage=${hardware_result.summary.storage_device_count} graphics=${hardware_result.summary.graphics_device_count} unknown_or_partial=${hardware_result.summary.unknown_or_partial_count} warnings=${hardware_result.parse_warnings.length} scan_errors=${hardware_result.scan_errors.length} truncated=${String(hardware_result.truncated)}`,
    );
    console.info(
      `[example] hardware_bus_counts=${RenderUnknown(hardware_result.summary.bus_type_counts)}`,
    );
    console.info(
      `[example] hardware_class_counts=${RenderUnknown(hardware_result.summary.class_counts)}`,
    );
    console.info(
      `[example] hardware_top_vendors=${RenderUnknown(hardware_result.summary.top_vendors)}`,
    );
    console.info(
      `[example] hardware_top_models=${RenderUnknown(hardware_result.summary.top_models)}`,
    );
  } else {
    console.info("[example] hardware_smoke_skipped=true");
  }
  if (disk_smoke_run) {
    const disk_result = await proxmox_client.lxc_service.getDiskAndBlockDevices({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: disk_timeout_ms,
      device_limit: disk_device_limit,
      filesystem_limit: disk_filesystem_limit,
      include_partitions: disk_include_partitions,
      include_filesystems: disk_include_filesystems,
      include_mounts: disk_include_mounts,
      include_usage: disk_include_usage,
      include_loop_devices: disk_include_loop,
      include_virtual_devices: disk_include_virtual,
      filesystem_scope: disk_filesystem_scope,
    });
    console.info(
      `[example] disk_summary block_devices=${disk_result.summary.total_block_devices} physical_like_disks=${disk_result.summary.total_physical_like_disks} partitions=${disk_result.summary.total_partitions} filesystems=${disk_result.summary.total_filesystems} mounts=${disk_result.summary.total_mounts} mounted_filesystems=${disk_result.summary.mounted_filesystem_count} warnings=${disk_result.parse_warnings.length} scan_errors=${disk_result.scan_errors.length} truncated=${String(disk_result.truncated)}`,
    );
    console.info(
      `[example] disk_device_type_counts=${RenderUnknown(disk_result.summary.device_type_counts)}`,
    );
    console.info(
      `[example] disk_filesystem_type_counts=${RenderUnknown(disk_result.summary.filesystem_type_counts)}`,
    );
    console.info(
      `[example] disk_mountpoint_counts=${RenderUnknown(disk_result.summary.mountpoint_counts)}`,
    );
    console.info(
      `[example] disk_capacity_bytes_total=${String(disk_result.summary.total_bytes ?? "unknown")} used=${String(disk_result.summary.used_bytes ?? "unknown")} available=${String(disk_result.summary.available_bytes ?? "unknown")}`,
    );
  } else {
    console.info("[example] disk_smoke_skipped=true");
  }
  if (memory_smoke_run) {
    const memory_result = await proxmox_client.lxc_service.getMemoryInfo({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: memory_timeout_ms,
      include_process_breakdown: memory_include_process_breakdown,
      include_kernel_breakdown: memory_include_kernel_breakdown,
      include_cgroup_limits: memory_include_cgroup_limits,
      process_limit: memory_process_limit,
      min_process_rss_kb: memory_min_process_rss_kb,
    });
    console.info(
      `[example] memory_summary total_kb=${String(memory_result.memory.mem_total_kb ?? "unknown")} used_kb=${String(memory_result.memory.mem_used_kb ?? "unknown")} available_kb=${String(memory_result.memory.mem_available_kb ?? "unknown")} used_percent=${String(memory_result.memory.used_percent ?? "unknown")} warnings=${memory_result.parse_warnings.length} scan_errors=${memory_result.scan_errors.length} truncated=${String(memory_result.truncated)}`,
    );
    console.info(
      `[example] swap_summary total_kb=${String(memory_result.swap.swap_total_kb ?? "unknown")} used_kb=${String(memory_result.swap.swap_used_kb ?? "unknown")} free_kb=${String(memory_result.swap.swap_free_kb ?? "unknown")} used_percent=${String(memory_result.swap.swap_used_percent ?? "unknown")} devices=${memory_result.swap.devices.length}`,
    );
    console.info(
      `[example] kernel_memory_summary estimate_kb=${String(memory_result.kernel.kernel_memory_estimate_kb ?? "unknown")} slab_kb=${String(memory_result.kernel.slab_kb ?? "unknown")} kernel_stack_kb=${String(memory_result.kernel.kernel_stack_kb ?? "unknown")} page_tables_kb=${String(memory_result.kernel.page_tables_kb ?? "unknown")}`,
    );
    console.info(
      `[example] memory_process_summary count=${memory_result.summary.process_count} top_rss_pids=${RenderUnknown(memory_result.summary.top_rss_pids.slice(0, 5))} top_memory_percent_pids=${RenderUnknown(memory_result.summary.top_memory_percent_pids.slice(0, 5))}`,
    );
    console.info(
      `[example] memory_pressure_summary available=${String(memory_result.summary.memory_pressure_available)} psi_some_avg10=${String(memory_result.summary.psi_some_avg10 ?? "unknown")} psi_full_avg10=${String(memory_result.summary.psi_full_avg10 ?? "unknown")} cgroup_current_kb=${String(memory_result.summary.cgroup_current_kb ?? "unknown")} cgroup_limit_kb=${String(memory_result.summary.cgroup_limit_kb ?? "unknown")}`,
    );
  } else {
    console.info("[example] memory_smoke_skipped=true");
  }
  if (cpu_smoke_run) {
    const cpu_result = await proxmox_client.lxc_service.getCpuInfo({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: cpu_timeout_ms,
      include_per_core: cpu_include_per_core,
      include_flags: cpu_include_flags,
      include_top_snapshot: cpu_include_top_snapshot,
      include_cgroup_limits: cpu_include_cgroup_limits,
      include_cpu_pressure: cpu_include_cpu_pressure,
      core_limit: cpu_core_limit,
    });
    console.info(
      `[example] cpu_summary model=${cpu_result.cpu.model_name ?? "unknown"} vendor=${cpu_result.cpu.vendor_id ?? "unknown"} logical=${String(cpu_result.cpu.logical_cpu_count ?? "unknown")} online=${String(cpu_result.cpu.online_cpu_count ?? "unknown")} offline=${String(cpu_result.cpu.offline_cpu_count ?? "unknown")} warnings=${cpu_result.parse_warnings.length} scan_errors=${cpu_result.scan_errors.length} truncated=${String(cpu_result.truncated)}`,
    );
    console.info(
      `[example] cpu_bogomips total=${String(cpu_result.summary.total_bogomips ?? "unknown")} per_core_sample=${RenderUnknown(cpu_result.summary.per_core_bogomips.slice(0, 8))}`,
    );
    console.info(
      `[example] cpu_limits cpuset=${cpu_result.cpu.cpuset_effective ?? "unknown"} cpuset_count=${String(cpu_result.cpu.cpuset_cpu_count ?? "unknown")} quota_us=${String(cpu_result.cpu.cgroup_quota_us ?? "unknown")} period_us=${String(cpu_result.cpu.cgroup_period_us ?? "unknown")} effective_quota_cores=${String(cpu_result.cpu.effective_quota_cores ?? "unknown")}`,
    );
    console.info(
      `[example] cpu_load load1=${String(cpu_result.summary.loadavg_1m ?? "unknown")} load5=${String(cpu_result.summary.loadavg_5m ?? "unknown")} load15=${String(cpu_result.summary.loadavg_15m ?? "unknown")} pressure_available=${String(cpu_result.summary.cpu_pressure_available)} psi_some_avg10=${String(cpu_result.summary.psi_some_avg10 ?? "unknown")} psi_full_avg10=${String(cpu_result.summary.psi_full_avg10 ?? "unknown")}`,
    );
    console.info(
      `[example] cpu_top_snapshot pids=${RenderUnknown(cpu_result.summary.top_cpu_pids)} processes=${RenderUnknown(cpu_result.summary.top_cpu_processes.slice(0, 5))}`,
    );
  } else {
    console.info("[example] cpu_smoke_skipped=true");
  }
  if (identity_smoke_run) {
    const identity_result = await proxmox_client.lxc_service.getUsersAndGroups({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: identity_timeout_ms,
      include_system_accounts: identity_include_system,
      include_shadow_status: identity_include_shadow_status,
      include_last_login: identity_include_last_login,
      include_sudo_privilege_signals: identity_include_sudo_signals,
      privilege_detail_mode: identity_privilege_detail_mode,
      include_group_memberships: identity_include_group_memberships,
      user_limit: identity_user_limit,
      group_limit: identity_group_limit,
    });
    console.info(
      `[example] identity_summary users=${identity_result.summary.total_users} groups=${identity_result.summary.total_groups} enabled_users=${identity_result.summary.enabled_users} disabled_or_locked_users=${identity_result.summary.disabled_or_locked_users} expired_users=${identity_result.summary.expired_users} system_users=${identity_result.summary.system_users} human_users_estimate=${identity_result.summary.human_users_estimate} sudo_signal_users=${identity_result.summary.sudo_signal_user_count} warnings=${identity_result.parse_warnings.length} scan_errors=${identity_result.scan_errors.length} truncated=${String(identity_result.truncated)}`,
    );
    console.info(
      `[example] identity_top_privileged_groups=${RenderUnknown(identity_result.summary.top_privileged_groups)}`,
    );
  } else {
    console.info("[example] identity_smoke_skipped=true");
  }
  if (firewall_smoke_run) {
    const firewall_result = await proxmox_client.lxc_service.getFirewallInfo({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: firewall_timeout_ms,
      include_raw_rules: firewall_include_raw_rules,
      include_nat: firewall_include_nat,
      include_counters: firewall_include_counters,
      include_ipv6: firewall_include_ipv6,
      include_security_findings: firewall_include_findings,
      rule_limit: firewall_rule_limit,
      finding_limit: firewall_finding_limit,
    });
    const top_findings = firewall_result.posture.notable_findings
      .slice(0, 5)
      .map((finding_record) => ({
        severity: finding_record.severity,
        reason_code: finding_record.reason_code,
      }));
    console.info(
      `[example] firewall_summary backend=${firewall_result.firewall.backend_primary} active=${String(firewall_result.firewall.is_firewall_active ?? "unknown")} total_rules=${firewall_result.summary.total_rules} warnings=${firewall_result.parse_warnings.length} scan_errors=${firewall_result.scan_errors.length} truncated=${String(firewall_result.truncated)}`,
    );
    console.info(
      `[example] firewall_posture icmp=${String(firewall_result.posture.icmp_echo_request_allowed)} tcp=${firewall_result.posture.ingress_tcp_posture} udp=${firewall_result.posture.ingress_udp_posture} ingress_default_deny=${String(firewall_result.posture.ingress_default_deny)}`,
    );
    console.info(
      `[example] firewall_action_counts=${RenderUnknown(firewall_result.summary.action_counts)}`,
    );
    console.info(
      `[example] firewall_protocol_counts=${RenderUnknown(firewall_result.summary.protocol_counts)}`,
    );
    console.info(
      `[example] firewall_top_findings=${RenderUnknown(top_findings)}`,
    );
  } else {
    console.info("[example] firewall_smoke_skipped=true");
  }
  if (devtools_smoke_run) {
    const devtools_result = await proxmox_client.lxc_service.getDevelopmentToolingInfo({
      node_id: target_node_id,
      container_id: target_container_id,
      timeout_ms: devtools_timeout_ms,
      include_package_inventory: devtools_include_package_inventory,
      include_compiler_search_paths: devtools_include_compiler_search_paths,
      module_limit_per_runtime: devtools_module_limit_per_runtime,
      package_limit_per_runtime: devtools_package_limit_per_runtime,
      include_transitive_metadata: devtools_include_transitive_metadata,
      include_distro_package_enrichment: devtools_include_distro_package_enrichment,
      distro_package_limit_total: devtools_distro_package_limit_total,
      distro_package_limit_per_ecosystem: devtools_distro_package_limit_per_ecosystem,
    });
    const ecosystem_versions = devtools_result.toolchains.reduce<Record<string, string[]>>((accumulator, toolchain_record) => {
      accumulator[toolchain_record.ecosystem_kind] = Object.entries(toolchain_record.versions)
        .map(([tool_name, tool_version]) => `${tool_name}:${tool_version}`)
        .slice(0, 6);
      return accumulator;
    }, {});
    console.info(
      `[example] devtools_summary ecosystems_present=${RenderUnknown(devtools_result.summary.ecosystems_present)} ecosystems_missing=${RenderUnknown(devtools_result.summary.ecosystems_missing)} score=${devtools_result.summary.development_tooling_score} package_inventory_completeness=${devtools_result.summary.package_inventory_completeness} warnings=${devtools_result.parse_warnings.length} scan_errors=${devtools_result.scan_errors.length} truncated=${String(devtools_result.truncated)}`,
    );
    console.info(
      `[example] devtools_module_counts=${RenderUnknown(devtools_result.summary.ecosystem_module_counts)}`,
    );
    console.info(
      `[example] devtools_system_package_providers=${RenderUnknown(devtools_result.system_package_providers.map((provider_record) => ({ manager_name: provider_record.manager_name, version: provider_record.version })))}`
    );
    console.info(
      `[example] devtools_versions_sample=${RenderUnknown(ecosystem_versions)}`,
    );
    console.info(
      `[example] devtools_distro_enrichment manager=${RenderUnknown(devtools_result.probe_metadata.distro_package_manager_used ?? "none")} scanned=${devtools_result.probe_metadata.distro_packages_scanned_count} mapped=${devtools_result.probe_metadata.distro_packages_mapped_count} truncated=${String(devtools_result.probe_metadata.distro_packages_truncated)}`,
    );
  } else {
    console.info("[example] devtools_smoke_skipped=true");
  }
  if (report_smoke_run) {
    const report_started_at_ms = Date.now();
    const report_result = await proxmox_client.lxc_service.generateSystemReportFile({
      node_id: target_node_id,
      container_id: target_container_id,
      output_dir: report_output_dir,
      file_name_prefix: report_filename_prefix,
    });
    const report_duration_ms = Math.max(0, Date.now() - report_started_at_ms);
    console.info(
      `[example] report_summary path=${report_result.report_path} bytes=${report_result.bytes_written} duration_ms=${report_duration_ms} generation_duration_ms=${report_result.metadata.total_duration_ms} section_status=${RenderUnknown(report_result.metadata.section_status_counts)}`,
    );
  } else {
    console.info("[example] report_smoke_skipped=true");
  }
  console.info("[example] os_info_smoke=pass");
}

if (require.main === module) {
  void Main().catch((error: unknown) => {
    HandleMainError(error);
    process.exitCode = 1;
  });
}
