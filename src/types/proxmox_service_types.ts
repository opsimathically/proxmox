import { proxmox_api_response_t } from "./proxmox_http_types";

export interface proxmox_datacenter_summary_record_i {
  [key: string]: unknown;
}

export interface proxmox_datacenter_storage_record_i {
  storage?: string;
  type?: string;
  status?: string;
  content?: string[];
  shared?: number;
  node?: string;
  enabled?: number | boolean;
}

export interface proxmox_version_info_i {
  release?: string;
  version?: string;
  repoid?: string;
}

export interface proxmox_cluster_status_record_i {
  [key: string]: unknown;
  name?: string;
  state?: string;
  id?: string;
}

export interface proxmox_cluster_member_record_i {
  id?: string;
  name?: string;
  state?: string;
  type?: string;
  ring?: number;
}

export interface proxmox_node_record_i {
  node?: string;
  id?: string;
  name?: string;
  status?: string;
  type?: string;
  ip?: string;
  level?: string;
}

export interface proxmox_node_status_record_i {
  node?: string;
  uptime?: number;
  status?: string;
  cpus?: number;
  cpuinfo?: {
    cpus?: number | string;
    cores?: number | string;
    sockets?: number | string;
    model?: string;
    [key: string]: unknown;
  };
  loadavg?: {
    [key: string]: unknown;
  };
}

export interface proxmox_node_service_record_i {
  service?: string;
  status?: string;
  description?: string;
  state?: string;
}

export interface proxmox_node_metrics_record_i {
  node?: string;
  ds?: string;
  values?: unknown[];
}

export interface proxmox_node_network_interface_record_i {
  interface_id: string;
  type?: string;
  active?: boolean;
  autostart?: boolean;
  is_bridge: boolean;
  bridge_ports?: string[];
  bridge_vlan_aware?: boolean;
  address?: string;
  cidr?: string;
  method?: string;
  comments?: string;
  raw: Record<string, unknown>;
}

export interface proxmox_node_bridge_record_i extends proxmox_node_network_interface_record_i {
  is_bridge: true;
}

export type proxmox_vm_id_t = string | number;
export type proxmox_lxc_id_t = string | number;

export interface proxmox_resource_record_i {
  id?: string;
  vmid?: string | number;
  name?: string;
  node?: string;
  status?: string;
  lock?: string;
  template?: number | boolean;
  memory?: number;
  maxmem?: number;
  cpus?: number;
  cpu?: number;
  uptime?: number;
  maxdisk?: number;
  pool?: string;
}

export interface proxmox_vm_record_i extends proxmox_resource_record_i {
  type?: "qemu";
}

export interface proxmox_lxc_record_i extends proxmox_resource_record_i {
  type?: "lxc";
  swap?: number;
}

export interface proxmox_api_config_record_i {
  [key: string]: string | number | boolean | null;
}

export interface proxmox_task_operation_record_i {
  resource_type: "qemu" | "lxc";
  resource_id: string;
  node_id: string;
  task_id: string;
  operation: string;
}

export interface proxmox_task_operation_completed_record_i extends proxmox_task_operation_record_i {
  status: "running" | "stopped" | "ok" | "error" | "unknown";
  exit_status?: "OK" | "ERROR";
  percent?: number;
  message?: string;
  raw?: unknown;
}

export interface proxmox_task_options_input_i {
  wait_for_task?: boolean;
  timeout_ms?: number;
  retry_allowed?: boolean;
}

export interface proxmox_task_polling_options_i {
  interval_ms?: number;
  timeout_ms?: number;
  max_poll_failures?: number;
}

export type proxmox_task_polling_options_t = proxmox_task_polling_options_i;

export interface proxmox_task_target_input_i {
  node_id: string;
}

export interface proxmox_vm_reference_input_i extends proxmox_task_target_input_i {
  vm_id: proxmox_vm_id_t;
}

export interface proxmox_lxc_reference_input_i extends proxmox_task_target_input_i {
  container_id: proxmox_lxc_id_t;
}

export type proxmox_vm_get_input_i = proxmox_vm_reference_input_i;
export type proxmox_lxc_get_input_i = proxmox_lxc_reference_input_i;

export interface proxmox_vm_list_query_i {
  node_id?: string;
  running?: boolean;
  full?: boolean;
  pool?: string;
}

export interface proxmox_lxc_list_query_i {
  node_id?: string;
  running?: boolean;
  full?: boolean;
  pool?: string;
}

export interface proxmox_pool_reference_query_i {
  pool_id: string;
}

export interface proxmox_access_permissions_query_i {
  path: string;
}

export interface proxmox_access_permissions_target_query_i extends proxmox_access_permissions_query_i {
  auth_id: string;
}

export interface proxmox_access_privilege_check_query_i extends proxmox_access_permissions_query_i {
  privilege: string;
}

export interface proxmox_access_privilege_check_target_query_i extends proxmox_access_privilege_check_query_i {
  auth_id: string;
}

export type proxmox_storage_content_filter_t = "backup" | "iso" | "vztmpl";
export type proxmox_storage_content_kind_t = proxmox_storage_content_filter_t | "unknown";

export interface proxmox_storage_content_list_query_i {
  node_id: string;
  storage: string;
  content?: proxmox_storage_content_filter_t;
  vmid?: proxmox_vm_id_t;
}

export interface proxmox_storage_template_catalog_query_i {
  node_id: string;
  section?: string;
}

export interface proxmox_storage_delete_input_i {
  node_id: string;
  storage: string;
  volume_id: string;
  delay?: number;
}

export interface proxmox_storage_upload_input_i {
  node_id: string;
  storage: string;
  content_type: "iso" | "vztmpl";
  file_path: string;
  filename?: string;
  checksum?: string;
  checksum_algorithm?: string;
}

export interface proxmox_storage_download_input_i {
  node_id: string;
  storage: string;
  volume_id: string;
  destination_path: string;
  overwrite?: boolean;
}

export interface proxmox_storage_permission_query_i {
  node_id: string;
  storage: string;
  auth_id?: string;
}

export interface proxmox_vm_create_input_i extends proxmox_task_target_input_i, proxmox_task_options_input_i {
  vm_id?: proxmox_vm_id_t;
  config: proxmox_api_config_record_i;
}

export interface proxmox_vm_update_input_i extends proxmox_vm_reference_input_i, proxmox_task_options_input_i {
  config: proxmox_api_config_record_i;
}

export interface proxmox_vm_clone_input_i extends proxmox_vm_reference_input_i, proxmox_task_options_input_i {
  new_vm_id: proxmox_vm_id_t;
  new_name?: string;
  target_node?: string;
  full?: number | boolean;
  config?: proxmox_api_config_record_i;
}

export interface proxmox_vm_delete_input_i extends proxmox_vm_reference_input_i, proxmox_task_options_input_i {
  purge?: boolean;
  force?: boolean;
}

export interface proxmox_vm_start_input_i extends proxmox_vm_reference_input_i, proxmox_task_options_input_i {
  timeout_ms?: number;
}

export interface proxmox_vm_stop_input_i extends proxmox_vm_reference_input_i, proxmox_task_options_input_i {
  force?: boolean;
  timeout_ms?: number;
}

export interface proxmox_vm_restart_input_i extends proxmox_vm_reference_input_i, proxmox_task_options_input_i {
  timeout_ms?: number;
}

export interface proxmox_vm_migrate_input_i extends proxmox_vm_reference_input_i, proxmox_task_options_input_i {
  target_node_id: string;
  online?: boolean;
  force?: boolean;
}

export interface proxmox_lxc_create_input_i extends proxmox_task_target_input_i, proxmox_task_options_input_i {
  container_id?: proxmox_lxc_id_t;
  config: proxmox_api_config_record_i;
}

export interface proxmox_lxc_update_input_i extends proxmox_lxc_reference_input_i, proxmox_task_options_input_i {
  config: proxmox_api_config_record_i;
}

export interface proxmox_lxc_delete_input_i extends proxmox_lxc_reference_input_i, proxmox_task_options_input_i {
  purge?: boolean;
  force?: boolean;
}

export interface proxmox_lxc_start_input_i extends proxmox_lxc_reference_input_i, proxmox_task_options_input_i {
  timeout_ms?: number;
}

export interface proxmox_lxc_stop_input_i extends proxmox_lxc_reference_input_i, proxmox_task_options_input_i {
  timeout_ms?: number;
  force?: boolean;
}

export interface proxmox_lxc_migrate_input_i extends proxmox_lxc_reference_input_i, proxmox_task_options_input_i {
  target_node_id: string;
  restart?: boolean;
  migrate_volumes?: boolean;
}

export interface proxmox_lxc_snapshot_input_i extends proxmox_lxc_reference_input_i, proxmox_task_options_input_i {
  snapshot_name: string;
  description?: string;
  include_memory?: boolean;
  stop?: boolean;
}

export interface proxmox_lxc_restore_input_i extends proxmox_lxc_reference_input_i, proxmox_task_options_input_i {
  snapshot_name: string;
  force?: boolean;
}

export type proxmox_lxc_helper_ipv4_mode_t = "dhcp" | "static" | "none";
export type proxmox_lxc_helper_ipv6_mode_t = "dhcp" | "static" | "slaac" | "none";

export interface proxmox_lxc_helper_general_input_i {
  node_id: string;
  container_id: proxmox_lxc_id_t;
  hostname: string;
  resource_pool?: string;
  password?: string;
  ssh_public_keys?: string | string[];
  unprivileged_container?: boolean;
  nesting?: boolean;
  add_to_ha?: boolean;
  tags?: string[];
}

export interface proxmox_lxc_helper_template_input_i {
  storage: string;
  template: string;
}

export interface proxmox_lxc_helper_disks_input_i {
  storage: string;
  disk_size_gib: number;
}

export interface proxmox_lxc_helper_cpu_input_i {
  cores?: number;
  cpu_limit?: number | "unlimited";
  cpu_units?: number;
}

export interface proxmox_lxc_helper_memory_input_i {
  memory_mib?: number;
  swap_mib?: number;
}

export interface proxmox_lxc_helper_network_input_i {
  name?: string;
  mac_address?: string;
  bridge: string;
  vlan_tag?: number;
  ipv4_mode?: proxmox_lxc_helper_ipv4_mode_t;
  ipv4_cidr?: string;
  ipv4_gateway?: string;
  ipv6_mode?: proxmox_lxc_helper_ipv6_mode_t;
  ipv6_cidr?: string;
  ipv6_gateway?: string;
  disconnect?: boolean;
  rate_limit_mbps?: number;
  mtu?: number;
  host_managed?: boolean;
}

export interface proxmox_lxc_helper_dns_input_i {
  dns_domain?: string;
  dns_servers?: string | string[];
}

export interface proxmox_lxc_helper_preflight_input_i {
  enabled?: boolean;
  enforce?: boolean;
  check_node_exists?: boolean;
  check_container_id_available?: boolean;
  check_storage_rootdir?: boolean;
  check_template_exists?: boolean;
  check_bridge_exists?: boolean;
  check_cpu?: boolean;
  check_memory?: boolean;
  cpu_mode?: "logical" | "physical";
  memory_mode?: "free_headroom" | "allocated_headroom";
}

export interface proxmox_lxc_helper_create_input_i extends proxmox_task_options_input_i {
  general: proxmox_lxc_helper_general_input_i;
  template: proxmox_lxc_helper_template_input_i;
  disks: proxmox_lxc_helper_disks_input_i;
  cpu?: proxmox_lxc_helper_cpu_input_i;
  memory?: proxmox_lxc_helper_memory_input_i;
  network?: proxmox_lxc_helper_network_input_i;
  dns?: proxmox_lxc_helper_dns_input_i;
  preflight?: proxmox_lxc_helper_preflight_input_i;
  start_after_created?: boolean;
  dry_run?: boolean;
}

export interface proxmox_lxc_helper_destroy_preflight_input_i {
  enabled?: boolean;
  enforce?: boolean;
  check_permissions?: boolean;
  auth_id?: string;
}

export interface proxmox_lxc_helper_destroy_input_i extends proxmox_task_options_input_i {
  node_id: string;
  container_id: proxmox_lxc_id_t;
  stop_first?: boolean;
  force_stop?: boolean;
  purge?: boolean;
  ignore_not_found?: boolean;
  dry_run?: boolean;
  wait_for_tasks?: boolean;
  preflight?: proxmox_lxc_helper_destroy_preflight_input_i;
}

export interface proxmox_lxc_helper_bulk_hostname_strategy_i {
  template?: string;
  prefix?: string;
  suffix?: string;
  separator?: string;
  start_index?: number;
}

export interface proxmox_lxc_helper_bulk_create_input_i {
  base_input: proxmox_lxc_helper_create_input_i;
  count: number;
  container_id_start?: proxmox_lxc_id_t;
  container_id_step?: number;
  container_id_list?: proxmox_lxc_id_t[];
  hostname_strategy?: proxmox_lxc_helper_bulk_hostname_strategy_i;
  concurrency_limit?: number;
  continue_on_error?: boolean;
  wait_for_tasks?: boolean;
  dry_run?: boolean;
}

export interface proxmox_lxc_helper_bulk_destroy_input_i extends proxmox_task_options_input_i {
  node_id: string;
  count?: number;
  container_id_start?: proxmox_lxc_id_t;
  container_id_step?: number;
  container_id_list?: proxmox_lxc_id_t[];
  stop_first?: boolean;
  force_stop?: boolean;
  purge?: boolean;
  ignore_not_found?: boolean;
  dry_run?: boolean;
  wait_for_tasks?: boolean;
  preflight?: proxmox_lxc_helper_destroy_preflight_input_i;
  concurrency_limit?: number;
  continue_on_error?: boolean;
}

export interface proxmox_task_wait_record_i {
  task_id: string;
  node_id: string;
}

export interface proxmox_task_completed_record_i extends proxmox_task_wait_record_i {
  status: "running" | "stopped" | "ok" | "error" | "unknown";
  exit_status?: "OK" | "ERROR";
  percent?: number;
  message?: string;
  raw?: unknown;
}

export interface proxmox_node_task_options_i {
  node_id: string;
}

export interface proxmox_vm_task_response_i {
  operation: "create" | "update" | "clone" | "delete" | "start" | "stop" | "restart" | "migrate";
}

export interface proxmox_lxc_task_response_i {
  operation: "create" | "update" | "delete" | "start" | "stop" | "migrate" | "snapshot" | "restore";
}

export interface proxmox_vm_reference_request_i {
  vm_id: string;
  node_id: string;
}

export interface proxmox_lxc_reference_request_i {
  container_id: proxmox_lxc_id_t;
  node_id: string;
}

export interface proxmox_datacenter_summary_query_i {
  node_id?: string;
  details?: boolean;
}

export interface proxmox_datacenter_storage_query_i {
  content?: string;
  node?: string;
  storage?: string;
  type?: string;
}

export interface proxmox_cluster_nodes_query_i {
  type?: string;
}

export type proxmox_cluster_resource_type_t = "qemu" | "lxc";
export type proxmox_cluster_storage_required_content_t = "rootdir" | "images";

export interface proxmox_cluster_next_id_query_i {
  resource_type?: proxmox_cluster_resource_type_t;
}

export interface proxmox_cluster_storage_compatibility_query_i {
  node_ids: string[];
  required_content: proxmox_cluster_storage_required_content_t;
  storage_id?: string;
}

export interface proxmox_cluster_bridge_compatibility_query_i {
  node_ids: string[];
  bridge: string;
}

export type proxmox_cluster_placement_scoring_mode_t =
  "balanced" | "capacity_first" | "strict";

export interface proxmox_lxc_placement_plan_input_i {
  required_storage_id: string;
  template_storage_id?: string;
  required_bridge?: string;
  requested_cores?: number;
  requested_memory_bytes?: number;
  candidate_node_ids?: string[];
  preferred_node_ids?: string[];
  disallowed_node_ids?: string[];
  required_pool_id?: string;
  scoring_mode?: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions?: boolean;
}

export interface proxmox_vm_placement_plan_input_i {
  required_storage_id: string;
  required_bridge?: string;
  requested_cores?: number;
  requested_memory_bytes?: number;
  candidate_node_ids?: string[];
  preferred_node_ids?: string[];
  disallowed_node_ids?: string[];
  required_pool_id?: string;
  scoring_mode?: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions?: boolean;
}

export interface proxmox_lxc_migration_with_preflight_input_i extends proxmox_task_options_input_i {
  node_id: string;
  container_id: proxmox_lxc_id_t;
  target_node_id: string;
  required_storage_id: string;
  required_bridge?: string;
  requested_cores?: number;
  requested_memory_bytes?: number;
  template_storage_id?: string;
  restart?: boolean;
  migrate_volumes?: boolean;
  wait_for_task?: boolean;
  scoring_mode?: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions?: boolean;
}

export interface proxmox_vm_migration_with_preflight_input_i extends proxmox_task_options_input_i {
  node_id: string;
  vm_id: proxmox_vm_id_t;
  target_node_id: string;
  required_storage_id: string;
  required_bridge?: string;
  requested_cores?: number;
  requested_memory_bytes?: number;
  online?: boolean;
  force?: boolean;
  wait_for_task?: boolean;
  scoring_mode?: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions?: boolean;
}

export interface proxmox_ha_resources_query_i {
  type?: string;
  status?: string;
}

export interface proxmox_ha_groups_query_i {}

export interface proxmox_ha_resource_add_input_i {
  sid: string;
  state?: string;
  group?: string;
  max_relocate?: number;
  max_restart?: number;
  comment?: string;
}

export interface proxmox_ha_resource_update_input_i {
  sid: string;
  state?: string;
  group?: string;
  max_relocate?: number;
  max_restart?: number;
  comment?: string;
  digest?: string;
}

export interface proxmox_ha_resource_remove_input_i {
  sid: string;
}

export interface proxmox_task_wait_many_item_input_i {
  node_id: string;
  task_id: string;
}

export interface proxmox_task_wait_many_input_i {
  tasks: proxmox_task_wait_many_item_input_i[];
  fail_fast?: boolean;
  timeout_ms?: number;
  poll_interval_ms?: number;
  max_poll_failures?: number;
  max_parallel_tasks?: number;
}

export interface proxmox_node_maintenance_prepare_input_i {
  node_id: string;
  target_node_ids?: string[];
  include_resource_types?: Array<"qemu" | "lxc">;
  include_resource_ids?: string[];
  exclude_resource_ids?: string[];
  include_stopped?: boolean;
  required_bridge?: string;
  scoring_mode?: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions?: boolean;
}

export interface proxmox_node_drain_input_i extends proxmox_node_maintenance_prepare_input_i {
  dry_run?: boolean;
  max_parallel_migrations?: number;
  fail_fast?: boolean;
  wait_for_tasks?: boolean;
  timeout_ms?: number;
  retry_allowed?: boolean;
  lxc_migrate_volumes?: boolean;
  lxc_restart?: boolean;
  vm_online?: boolean;
  vm_force?: boolean;
  reboot_after_drain?: boolean;
  allow_reboot?: boolean;
}

export interface proxmox_dr_replication_discovery_query_i {
  node_id?: string;
}

export interface proxmox_dr_backup_discovery_query_i {
  node_id?: string;
}

export interface proxmox_dr_readiness_query_i {
  node_id?: string;
  require_replication_jobs?: boolean;
  require_backup_storage?: boolean;
  minimum_backup_storage_count?: number;
}

export interface proxmox_node_list_query_i {
  running?: boolean;
}

export interface proxmox_node_status_query_i {
  node_id: string;
}

export type proxmox_node_network_type_filter_t =
  "any_bridge" | "bridge" | "physical" | "vlan" | "bond";

export interface proxmox_node_network_interfaces_query_i {
  node_id: string;
  type?: proxmox_node_network_type_filter_t;
}

export interface proxmox_node_network_interface_query_i {
  node_id: string;
  interface_id: string;
}

export interface proxmox_node_bridges_query_i {
  node_id: string;
}

export interface proxmox_node_memory_capacity_query_i {
  node_id: string;
}

export interface proxmox_node_memory_allocation_query_i {
  node_id: string;
  include_stopped?: boolean;
}

export interface proxmox_node_memory_preflight_input_i {
  node_id: string;
  requested_memory_bytes: number;
  mode?: "free_headroom" | "allocated_headroom";
}

export interface proxmox_node_services_query_i {
  node_id: string;
}

export interface proxmox_node_metrics_query_i {
  node_id: string;
  start?: number;
  end?: number;
  node?: string;
  timeframe?: string;
}

export interface proxmox_node_reboot_input_i {
  node_id: string;
  wait_for_task?: boolean;
  force?: boolean;
  timeout_ms?: number;
}

export interface proxmox_node_cpu_capacity_query_i {
  node_id: string;
}

export interface proxmox_node_core_preflight_input_i {
  node_id: string;
  requested_cores: number;
  mode?: "logical" | "physical";
}

export interface proxmox_datacenter_summary_request_i {
  node_id?: string;
}

export interface proxmox_cluster_status_request_i {}

export interface proxmox_cluster_membership_request_i {}

export interface proxmox_cluster_nodes_request_i {
  node_id?: string;
}

export interface proxmox_node_metrics_request_i {
  node_id: string;
  start_time?: number;
  end_time?: number;
  datasource?: string;
  cf?: string;
}

export interface proxmox_request_scope_i {
  node_id?: string;
}

export interface proxmox_access_privileges_record_i {
  [privilege: string]: boolean;
}

export type proxmox_access_privileges_t = proxmox_access_privileges_record_i;

export interface proxmox_access_permissions_record_i {
  requested_path: string;
  identity: "current" | "target";
  auth_id?: string;
  privileges: proxmox_access_privileges_t;
  raw_permissions: Record<string, unknown>;
}

export type proxmox_cluster_next_id_source_t =
  "cluster_nextid_endpoint" | "cluster_resources_fallback";

export interface proxmox_cluster_next_id_record_i {
  next_id: number;
  source: proxmox_cluster_next_id_source_t;
  resource_type?: proxmox_cluster_resource_type_t;
  raw: unknown;
}

export interface proxmox_cluster_storage_compatibility_node_record_i {
  node_id: string;
  compatible: boolean;
  reason: string;
  required_content: proxmox_cluster_storage_required_content_t;
  storage_id?: string;
  matching_storage_ids: string[];
  checked_storage_ids: string[];
  raw_storage_records: Record<string, unknown>[];
}

export interface proxmox_cluster_storage_compatibility_record_i {
  required_content: proxmox_cluster_storage_required_content_t;
  storage_id?: string;
  checked_node_count: number;
  compatible_nodes: string[];
  incompatible_nodes: string[];
  nodes: proxmox_cluster_storage_compatibility_node_record_i[];
}

export interface proxmox_cluster_bridge_compatibility_node_record_i {
  node_id: string;
  bridge: string;
  compatible: boolean;
  reason: string;
  bridge_found: boolean;
  is_bridge: boolean;
  interface_type?: string;
  raw_interface?: Record<string, unknown>;
}

export interface proxmox_cluster_bridge_compatibility_record_i {
  bridge: string;
  checked_node_count: number;
  compatible_nodes: string[];
  incompatible_nodes: string[];
  nodes: proxmox_cluster_bridge_compatibility_node_record_i[];
}

export interface proxmox_access_privilege_check_record_i {
  requested_path: string;
  identity: "current" | "target";
  auth_id?: string;
  privilege: string;
  allowed: boolean;
  privileges: proxmox_access_privileges_t;
}

export interface proxmox_pool_record_i {
  pool_id: string;
  comment?: string;
  raw: Record<string, unknown>;
}

export interface proxmox_pool_resource_record_i {
  id?: string;
  type?: string;
  vmid?: string | number;
  name?: string;
  node?: string;
  pool?: string;
  status?: string;
  raw: Record<string, unknown>;
}

export interface proxmox_pool_detail_record_i extends proxmox_pool_record_i {
  members: proxmox_pool_resource_record_i[];
}

export interface proxmox_node_cpu_capacity_source_record_i {
  logical_cpu_count?: string;
  physical_core_count?: string;
  sockets?: string;
  model?: string;
}

export interface proxmox_node_cpu_capacity_record_i {
  node_id: string;
  logical_cpu_count?: number;
  physical_core_count?: number;
  sockets?: number;
  model?: string;
  source_fields: proxmox_node_cpu_capacity_source_record_i;
  raw: Record<string, unknown>;
}

export interface proxmox_node_core_preflight_record_i {
  node_id: string;
  mode: "logical" | "physical";
  requested_cores: number;
  available_cores?: number;
  allowed: boolean;
  reason: "within_limit" | "exceeds_limit" | "capacity_unknown";
}

export interface proxmox_node_memory_capacity_source_record_i {
  total_memory_bytes?: string;
  used_memory_bytes?: string;
  free_memory_bytes?: string;
}

export interface proxmox_node_memory_capacity_record_i {
  node_id: string;
  total_memory_bytes?: number;
  used_memory_bytes?: number;
  free_memory_bytes?: number;
  source_fields: proxmox_node_memory_capacity_source_record_i;
  raw: Record<string, unknown>;
}

export interface proxmox_node_memory_allocation_resource_record_i {
  resource_type: "qemu" | "lxc";
  resource_id: string;
  name?: string;
  status?: string;
  memory_used_bytes?: number;
  memory_limit_bytes?: number;
  raw: Record<string, unknown>;
}

export interface proxmox_node_memory_allocation_record_i {
  node_id: string;
  include_stopped: boolean;
  resource_count: number;
  allocated_memory_bytes_total: number;
  used_memory_bytes_total: number;
  resources: proxmox_node_memory_allocation_resource_record_i[];
}

export interface proxmox_node_memory_preflight_record_i {
  node_id: string;
  mode: "free_headroom" | "allocated_headroom";
  requested_memory_bytes: number;
  available_memory_bytes?: number;
  allowed: boolean;
  reason: "within_limit" | "exceeds_limit" | "capacity_unknown";
}

export interface proxmox_storage_content_record_i {
  volume_id: string;
  storage?: string;
  node?: string;
  content?: string;
  normalized_content: proxmox_storage_content_kind_t;
  format?: string;
  size?: number;
  vmid?: string | number;
  ctime?: number;
  notes?: string;
  protected?: number | boolean;
  raw: Record<string, unknown>;
}

export interface proxmox_storage_template_catalog_record_i {
  template_id?: string;
  package?: string;
  name?: string;
  version?: string;
  release?: string;
  section?: string;
  type?: string;
  os?: string;
  channel?: string;
  architecture?: string;
  arch?: string;
  description?: string;
  infopage?: string;
  file?: string;
  filename?: string;
  checksum?: string;
  sha512sum?: string;
  md5sum?: string;
  url?: string;
  size?: number;
  source?: string;
  raw: Record<string, unknown>;
}

export interface proxmox_storage_task_record_i {
  operation: "delete_content" | "upload_content";
  node_id: string;
  storage: string;
  volume_id?: string;
  task_id: string;
  content_type?: "iso" | "vztmpl";
}

export interface proxmox_storage_download_record_i {
  node_id: string;
  storage: string;
  volume_id: string;
  destination_path: string;
  bytes_written: number;
}

export interface proxmox_lxc_helper_preflight_check_record_i {
  check: string;
  passed: boolean;
  reason: string;
}

export interface proxmox_lxc_helper_preflight_result_record_i {
  executed: boolean;
  enforce: boolean;
  failed_checks: number;
  checks: proxmox_lxc_helper_preflight_check_record_i[];
}

export interface proxmox_lxc_helper_create_record_i {
  node_id: string;
  container_id: string;
  dry_run: boolean;
  config: proxmox_api_config_record_i;
  preflight: proxmox_lxc_helper_preflight_result_record_i;
  create_task?: proxmox_lxc_task_result_t;
  start_task?: proxmox_lxc_task_result_t;
  ha_added?: boolean;
}

export interface proxmox_lxc_helper_destroy_preflight_check_record_i {
  check: string;
  passed: boolean;
  reason: string;
}

export interface proxmox_lxc_helper_destroy_preflight_result_record_i {
  executed: boolean;
  enforce: boolean;
  failed_checks: number;
  checks: proxmox_lxc_helper_destroy_preflight_check_record_i[];
}

export interface proxmox_lxc_helper_destroy_record_i {
  node_id: string;
  container_id: string;
  dry_run: boolean;
  stop_first: boolean;
  container_found: boolean;
  container_was_running?: boolean;
  stopped: boolean;
  deleted: boolean;
  ignored_not_found: boolean;
  stop_task?: proxmox_lxc_task_result_t;
  delete_task?: proxmox_lxc_task_result_t;
  preflight: proxmox_lxc_helper_destroy_preflight_result_record_i;
}

export interface proxmox_lxc_helper_bulk_error_record_i {
  code?: string;
  message: string;
  status_code?: number;
  path?: string;
  field?: string;
}

export interface proxmox_lxc_helper_bulk_summary_record_i {
  requested: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface proxmox_lxc_helper_bulk_create_item_record_i {
  index: number;
  container_id: string;
  hostname: string;
  attempted: boolean;
  skipped: boolean;
  success: boolean;
  dry_run: boolean;
  create_task?: proxmox_lxc_task_result_t;
  start_task?: proxmox_lxc_task_result_t;
  preflight_summary?: proxmox_lxc_helper_preflight_result_record_i;
  error?: proxmox_lxc_helper_bulk_error_record_i;
}

export interface proxmox_lxc_helper_bulk_create_record_i {
  node_id: string;
  dry_run: boolean;
  continue_on_error: boolean;
  concurrency_limit: number;
  summary: proxmox_lxc_helper_bulk_summary_record_i;
  items: proxmox_lxc_helper_bulk_create_item_record_i[];
}

export interface proxmox_lxc_helper_bulk_destroy_item_record_i {
  index: number;
  container_id: string;
  attempted: boolean;
  skipped: boolean;
  success: boolean;
  dry_run: boolean;
  stopped?: boolean;
  deleted?: boolean;
  ignored_not_found?: boolean;
  stop_task?: proxmox_lxc_task_result_t;
  delete_task?: proxmox_lxc_task_result_t;
  preflight_summary?: proxmox_lxc_helper_destroy_preflight_result_record_i;
  error?: proxmox_lxc_helper_bulk_error_record_i;
}

export interface proxmox_lxc_helper_bulk_destroy_record_i {
  node_id: string;
  dry_run: boolean;
  continue_on_error: boolean;
  concurrency_limit: number;
  summary: proxmox_lxc_helper_bulk_summary_record_i;
  items: proxmox_lxc_helper_bulk_destroy_item_record_i[];
}

export interface proxmox_lxc_cluster_preflight_input_i {
  create_input: proxmox_lxc_helper_create_input_i;
  candidate_node_ids?: string[];
  strict_permissions?: boolean;
}

export interface proxmox_lxc_cluster_preflight_check_record_i {
  check: string;
  passed: boolean;
  reason: string;
  source: "cluster_service" | "helper_preflight" | "access_service";
  required: boolean;
}

export interface proxmox_lxc_cluster_preflight_permission_record_i {
  path: string;
  privilege: string;
  allowed: boolean;
}

export interface proxmox_lxc_cluster_preflight_candidate_record_i {
  node_id: string;
  allowed: boolean;
  score: number;
  failed_required_checks: number;
  checks: proxmox_lxc_cluster_preflight_check_record_i[];
  permissions: proxmox_lxc_cluster_preflight_permission_record_i[];
  helper_preflight: proxmox_lxc_helper_preflight_result_t;
}

export interface proxmox_lxc_cluster_preflight_record_i {
  strict_permissions: boolean;
  checked_node_count: number;
  allowed_node_count: number;
  denied_node_count: number;
  recommended_node_id?: string;
  candidates: proxmox_lxc_cluster_preflight_candidate_record_i[];
}

export interface proxmox_cluster_placement_evidence_record_i {
  evaluated_at_iso: string;
  cpu_evaluated_at_iso?: string;
  memory_evaluated_at_iso?: string;
  storage_evaluated_at_iso?: string;
  bridge_evaluated_at_iso?: string;
}

export interface proxmox_cluster_placement_check_record_i {
  check: string;
  passed: boolean;
  reason: string;
  source: "cluster_service" | "node_service" | "access_service" | "input";
  required: boolean;
}

export interface proxmox_cluster_placement_candidate_metrics_record_i {
  logical_cpu_count?: number;
  available_cores?: number;
  free_memory_bytes?: number;
  available_memory_bytes?: number;
}

export interface proxmox_cluster_placement_candidate_record_i {
  node_id: string;
  allowed: boolean;
  score: number;
  failed_required_checks: number;
  checks: proxmox_cluster_placement_check_record_i[];
  metrics: proxmox_cluster_placement_candidate_metrics_record_i;
  evidence: proxmox_cluster_placement_evidence_record_i;
}

export interface proxmox_cluster_placement_plan_record_i {
  resource_type: proxmox_cluster_resource_type_t;
  scoring_mode: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions: boolean;
  required_storage_id: string;
  required_storage_content: proxmox_cluster_storage_required_content_t;
  template_storage_id?: string;
  required_bridge?: string;
  required_pool_id?: string;
  requested_cores?: number;
  requested_memory_bytes?: number;
  checked_node_count: number;
  allowed_node_count: number;
  denied_node_count: number;
  recommended_node_id?: string;
  candidates: proxmox_cluster_placement_candidate_record_i[];
}

export interface proxmox_cluster_migration_preflight_record_i {
  scoring_mode: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions: boolean;
  source_node_id: string;
  target_node_id: string;
  allowed: boolean;
  reason: string;
  planner: proxmox_cluster_placement_plan_record_i;
  target_candidate?: proxmox_cluster_placement_candidate_record_i;
}

export interface proxmox_lxc_migration_with_preflight_record_i {
  resource_type: "lxc";
  node_id: string;
  target_node_id: string;
  container_id: string;
  preflight: proxmox_cluster_migration_preflight_record_i;
  migration_task?: proxmox_lxc_task_result_t;
}

export interface proxmox_vm_migration_with_preflight_record_i {
  resource_type: "qemu";
  node_id: string;
  target_node_id: string;
  vm_id: string;
  preflight: proxmox_cluster_migration_preflight_record_i;
  migration_task?: proxmox_vm_task_result_t;
}

export interface proxmox_ha_resource_record_i {
  sid: string;
  state?: string;
  group?: string;
  max_relocate?: number;
  max_restart?: number;
  comment?: string;
  status?: string;
  raw: Record<string, unknown>;
}

export interface proxmox_ha_group_record_i {
  group: string;
  nodes?: string;
  restricted?: boolean;
  nofailback?: boolean;
  comment?: string;
  raw: Record<string, unknown>;
}

export interface proxmox_ha_write_record_i {
  operation: "add_resource" | "update_resource" | "remove_resource";
  sid: string;
  task_id: string;
}

export interface proxmox_task_wait_many_error_record_i {
  code?: string;
  message: string;
  status_code?: number;
  path?: string;
  field?: string;
}

export interface proxmox_task_wait_many_item_record_i {
  node_id: string;
  task_id: string;
  completed: boolean;
  status?: "running" | "stopped" | "ok" | "error" | "unknown";
  exit_status?: "OK" | "ERROR";
  percent?: number;
  message?: string;
  error?: proxmox_task_wait_many_error_record_i;
  raw?: unknown;
}

export interface proxmox_task_wait_many_summary_record_i {
  requested: number;
  completed: number;
  succeeded: number;
  failed: number;
  pending: number;
}

export interface proxmox_task_wait_many_record_i {
  fail_fast: boolean;
  timeout_ms?: number;
  poll_interval_ms?: number;
  max_poll_failures?: number;
  max_parallel_tasks: number;
  summary: proxmox_task_wait_many_summary_record_i;
  tasks: proxmox_task_wait_many_item_record_i[];
}

export interface proxmox_node_maintenance_plan_resource_record_i {
  resource_type: "qemu" | "lxc";
  resource_id: string;
  node_id: string;
  status?: string;
  name?: string;
  selected_for_drain: boolean;
  blocked: boolean;
  reason: string;
  target_node_id?: string;
  planner_score?: number;
  planner_failed_required_checks?: number;
  planner_raw?: proxmox_cluster_placement_candidate_t;
}

export interface proxmox_node_maintenance_plan_record_i {
  source_node_id: string;
  target_node_ids: string[];
  checked_resource_count: number;
  selected_resource_count: number;
  blocked_resource_count: number;
  migration_candidate_count: number;
  planned_reboot: boolean;
  resources: proxmox_node_maintenance_plan_resource_record_i[];
}

export interface proxmox_node_drain_migration_record_i {
  resource_type: "qemu" | "lxc";
  resource_id: string;
  source_node_id: string;
  target_node_id: string;
  submitted: boolean;
  success: boolean;
  task_id?: string;
  operation?: string;
  error?: proxmox_task_wait_many_error_record_i;
}

export interface proxmox_node_drain_record_i {
  source_node_id: string;
  dry_run: boolean;
  fail_fast: boolean;
  wait_for_tasks: boolean;
  max_parallel_migrations: number;
  planned_reboot: boolean;
  reboot_executed: boolean;
  plan: proxmox_node_maintenance_plan_record_i;
  summary: {
    requested: number;
    attempted: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  migrations: proxmox_node_drain_migration_record_i[];
  reboot_task?: proxmox_node_reboot_result_t;
}

export interface proxmox_dr_capability_check_record_i {
  capability: string;
  supported: boolean;
  reason: string;
  endpoint?: string;
  status_code?: number;
}

export interface proxmox_dr_replication_discovery_record_i {
  node_id?: string;
  supported: boolean;
  checks: proxmox_dr_capability_check_record_i[];
  cluster_jobs_count: number;
  node_jobs_count: number;
  cluster_jobs_raw: Record<string, unknown>[];
  node_jobs_raw: Record<string, unknown>[];
}

export interface proxmox_dr_backup_discovery_record_i {
  node_id?: string;
  supported: boolean;
  checks: proxmox_dr_capability_check_record_i[];
  backup_schedule_count: number;
  backup_storage_count: number;
  backup_storage_ids: string[];
  backup_schedules_raw: Record<string, unknown>[];
  backup_storage_raw: Record<string, unknown>[];
}

export interface proxmox_dr_readiness_check_record_i {
  check: string;
  passed: boolean;
  reason: string;
}

export interface proxmox_dr_readiness_record_i {
  node_id?: string;
  allowed: boolean;
  failed_checks: number;
  checks: proxmox_dr_readiness_check_record_i[];
  replication: proxmox_dr_replication_discovery_record_i;
  backup: proxmox_dr_backup_discovery_record_i;
}

export type proxmox_datacenter_summary_t = proxmox_datacenter_summary_record_i;
export type proxmox_datacenter_storage_list_t = proxmox_datacenter_storage_record_i[];
export type proxmox_datacenter_version_t = proxmox_version_info_i;
export type proxmox_cluster_status_t = proxmox_cluster_status_record_i[];
export type proxmox_cluster_membership_t = proxmox_cluster_member_record_i[];
export type proxmox_cluster_next_id_t = proxmox_cluster_next_id_record_i;
export type proxmox_cluster_storage_compatibility_t = proxmox_cluster_storage_compatibility_record_i;
export type proxmox_cluster_bridge_compatibility_t = proxmox_cluster_bridge_compatibility_record_i;
export type proxmox_node_list_t = proxmox_node_record_i[];
export type proxmox_node_status_t = proxmox_node_status_record_i;
export type proxmox_node_services_t = proxmox_node_service_record_i[];
export type proxmox_node_metrics_t = proxmox_node_metrics_record_i[];
export type proxmox_node_network_interface_t = proxmox_node_network_interface_record_i;
export type proxmox_node_network_interface_list_t = proxmox_node_network_interface_t[];
export type proxmox_node_bridge_t = proxmox_node_bridge_record_i;
export type proxmox_node_bridge_list_t = proxmox_node_bridge_t[];
export type proxmox_node_reboot_started_t = proxmox_task_wait_record_i;
export type proxmox_node_reboot_completed_t = proxmox_task_completed_record_i;
export type proxmox_node_reboot_result_t = proxmox_node_reboot_started_t | proxmox_node_reboot_completed_t;
export type proxmox_node_cpu_capacity_source_t = proxmox_node_cpu_capacity_source_record_i;
export type proxmox_node_cpu_capacity_t = proxmox_node_cpu_capacity_record_i;
export type proxmox_node_core_preflight_t = proxmox_node_core_preflight_record_i;
export type proxmox_node_memory_capacity_source_t = proxmox_node_memory_capacity_source_record_i;
export type proxmox_node_memory_capacity_t = proxmox_node_memory_capacity_record_i;
export type proxmox_node_memory_allocation_resource_t = proxmox_node_memory_allocation_resource_record_i;
export type proxmox_node_memory_allocation_t = proxmox_node_memory_allocation_record_i;
export type proxmox_node_memory_preflight_t = proxmox_node_memory_preflight_record_i;

export type proxmox_datacenter_summary_response_t = proxmox_api_response_t<proxmox_datacenter_summary_t>;
export type proxmox_datacenter_version_response_t = proxmox_api_response_t<proxmox_datacenter_version_t>;
export type proxmox_datacenter_storage_response_t = proxmox_api_response_t<proxmox_datacenter_storage_list_t>;
export type proxmox_cluster_status_response_t = proxmox_api_response_t<proxmox_cluster_status_t>;
export type proxmox_cluster_membership_response_t = proxmox_api_response_t<proxmox_cluster_membership_t>;
export type proxmox_cluster_nodes_response_t = proxmox_api_response_t<proxmox_node_list_t>;
export type proxmox_node_list_response_t = proxmox_api_response_t<proxmox_node_list_t>;
export type proxmox_node_status_response_t = proxmox_api_response_t<proxmox_node_status_t>;
export type proxmox_node_services_response_t = proxmox_api_response_t<proxmox_node_services_t>;
export type proxmox_node_metrics_response_t = proxmox_api_response_t<proxmox_node_metrics_t>;
export type proxmox_node_network_interface_response_t = proxmox_api_response_t<proxmox_node_network_interface_t>;
export type proxmox_node_network_interface_list_response_t = proxmox_api_response_t<proxmox_node_network_interface_list_t>;
export type proxmox_node_bridge_list_response_t = proxmox_api_response_t<proxmox_node_bridge_list_t>;
export type proxmox_node_reboot_response_t = proxmox_api_response_t<proxmox_node_reboot_result_t>;
export type proxmox_node_cpu_capacity_response_t = proxmox_api_response_t<proxmox_node_cpu_capacity_t>;
export type proxmox_node_core_preflight_response_t = proxmox_api_response_t<proxmox_node_core_preflight_t>;
export type proxmox_node_memory_capacity_response_t = proxmox_api_response_t<proxmox_node_memory_capacity_t>;
export type proxmox_node_memory_allocation_response_t = proxmox_api_response_t<proxmox_node_memory_allocation_t>;
export type proxmox_node_memory_preflight_response_t = proxmox_api_response_t<proxmox_node_memory_preflight_t>;
export type proxmox_access_permissions_response_t = proxmox_api_response_t<proxmox_access_permissions_record_i>;
export type proxmox_access_privilege_check_response_t = proxmox_api_response_t<proxmox_access_privilege_check_record_i>;
export type proxmox_pool_record_t = proxmox_pool_record_i;
export type proxmox_pool_list_t = proxmox_pool_record_t[];
export type proxmox_pool_resource_record_t = proxmox_pool_resource_record_i;
export type proxmox_pool_resource_list_t = proxmox_pool_resource_record_t[];
export type proxmox_pool_detail_t = proxmox_pool_detail_record_i;
export type proxmox_pool_list_response_t = proxmox_api_response_t<proxmox_pool_list_t>;
export type proxmox_pool_resource_list_response_t = proxmox_api_response_t<proxmox_pool_resource_list_t>;
export type proxmox_pool_detail_response_t = proxmox_api_response_t<proxmox_pool_detail_t>;
export type proxmox_storage_content_record_t = proxmox_storage_content_record_i;
export type proxmox_storage_content_list_t = proxmox_storage_content_record_t[];
export type proxmox_storage_template_catalog_record_t = proxmox_storage_template_catalog_record_i;
export type proxmox_storage_template_catalog_list_t = proxmox_storage_template_catalog_record_t[];
export type proxmox_storage_task_t = proxmox_storage_task_record_i;
export type proxmox_storage_download_t = proxmox_storage_download_record_i;
export type proxmox_lxc_helper_preflight_check_t = proxmox_lxc_helper_preflight_check_record_i;
export type proxmox_lxc_helper_preflight_result_t = proxmox_lxc_helper_preflight_result_record_i;
export type proxmox_lxc_helper_create_t = proxmox_lxc_helper_create_record_i;
export type proxmox_lxc_helper_destroy_preflight_check_t = proxmox_lxc_helper_destroy_preflight_check_record_i;
export type proxmox_lxc_helper_destroy_preflight_result_t = proxmox_lxc_helper_destroy_preflight_result_record_i;
export type proxmox_lxc_helper_destroy_t = proxmox_lxc_helper_destroy_record_i;
export type proxmox_lxc_helper_bulk_error_t = proxmox_lxc_helper_bulk_error_record_i;
export type proxmox_lxc_helper_bulk_summary_t = proxmox_lxc_helper_bulk_summary_record_i;
export type proxmox_lxc_helper_bulk_create_item_t = proxmox_lxc_helper_bulk_create_item_record_i;
export type proxmox_lxc_helper_bulk_create_t = proxmox_lxc_helper_bulk_create_record_i;
export type proxmox_lxc_helper_bulk_destroy_item_t = proxmox_lxc_helper_bulk_destroy_item_record_i;
export type proxmox_lxc_helper_bulk_destroy_t = proxmox_lxc_helper_bulk_destroy_record_i;
export type proxmox_lxc_cluster_preflight_input_t = proxmox_lxc_cluster_preflight_input_i;
export type proxmox_lxc_cluster_preflight_check_t = proxmox_lxc_cluster_preflight_check_record_i;
export type proxmox_lxc_cluster_preflight_permission_t = proxmox_lxc_cluster_preflight_permission_record_i;
export type proxmox_lxc_cluster_preflight_candidate_t = proxmox_lxc_cluster_preflight_candidate_record_i;
export type proxmox_lxc_cluster_preflight_t = proxmox_lxc_cluster_preflight_record_i;
export type proxmox_cluster_placement_check_t = proxmox_cluster_placement_check_record_i;
export type proxmox_cluster_placement_candidate_t = proxmox_cluster_placement_candidate_record_i;
export type proxmox_cluster_placement_plan_t = proxmox_cluster_placement_plan_record_i;
export type proxmox_cluster_migration_preflight_t = proxmox_cluster_migration_preflight_record_i;
export type proxmox_lxc_migration_with_preflight_t = proxmox_lxc_migration_with_preflight_record_i;
export type proxmox_vm_migration_with_preflight_t = proxmox_vm_migration_with_preflight_record_i;
export type proxmox_ha_resource_t = proxmox_ha_resource_record_i;
export type proxmox_ha_resource_list_t = proxmox_ha_resource_t[];
export type proxmox_ha_group_t = proxmox_ha_group_record_i;
export type proxmox_ha_group_list_t = proxmox_ha_group_t[];
export type proxmox_ha_write_t = proxmox_ha_write_record_i;
export type proxmox_task_wait_many_error_t = proxmox_task_wait_many_error_record_i;
export type proxmox_task_wait_many_item_t = proxmox_task_wait_many_item_record_i;
export type proxmox_task_wait_many_summary_t = proxmox_task_wait_many_summary_record_i;
export type proxmox_task_wait_many_t = proxmox_task_wait_many_record_i;
export type proxmox_node_maintenance_plan_resource_t = proxmox_node_maintenance_plan_resource_record_i;
export type proxmox_node_maintenance_plan_t = proxmox_node_maintenance_plan_record_i;
export type proxmox_node_drain_migration_t = proxmox_node_drain_migration_record_i;
export type proxmox_node_drain_t = proxmox_node_drain_record_i;
export type proxmox_dr_capability_check_t = proxmox_dr_capability_check_record_i;
export type proxmox_dr_replication_discovery_t = proxmox_dr_replication_discovery_record_i;
export type proxmox_dr_backup_discovery_t = proxmox_dr_backup_discovery_record_i;
export type proxmox_dr_readiness_check_t = proxmox_dr_readiness_check_record_i;
export type proxmox_dr_readiness_t = proxmox_dr_readiness_record_i;
export type proxmox_storage_content_list_response_t = proxmox_api_response_t<proxmox_storage_content_list_t>;
export type proxmox_storage_template_catalog_response_t = proxmox_api_response_t<proxmox_storage_template_catalog_list_t>;
export type proxmox_storage_task_response_t = proxmox_api_response_t<proxmox_storage_task_t>;
export type proxmox_storage_download_response_t = proxmox_api_response_t<proxmox_storage_download_t>;
export type proxmox_lxc_helper_create_response_t = proxmox_api_response_t<proxmox_lxc_helper_create_t>;
export type proxmox_lxc_helper_destroy_response_t = proxmox_api_response_t<proxmox_lxc_helper_destroy_t>;
export type proxmox_lxc_helper_bulk_create_response_t = proxmox_api_response_t<proxmox_lxc_helper_bulk_create_t>;
export type proxmox_lxc_helper_bulk_destroy_response_t = proxmox_api_response_t<proxmox_lxc_helper_bulk_destroy_t>;
export type proxmox_lxc_cluster_preflight_response_t = proxmox_api_response_t<proxmox_lxc_cluster_preflight_t>;
export type proxmox_lxc_placement_plan_response_t = proxmox_api_response_t<proxmox_cluster_placement_plan_t>;
export type proxmox_vm_placement_plan_response_t = proxmox_api_response_t<proxmox_cluster_placement_plan_t>;
export type proxmox_lxc_migration_with_preflight_response_t =
  proxmox_api_response_t<proxmox_lxc_migration_with_preflight_t>;
export type proxmox_vm_migration_with_preflight_response_t =
  proxmox_api_response_t<proxmox_vm_migration_with_preflight_t>;
export type proxmox_ha_resource_list_response_t = proxmox_api_response_t<proxmox_ha_resource_list_t>;
export type proxmox_ha_group_list_response_t = proxmox_api_response_t<proxmox_ha_group_list_t>;
export type proxmox_ha_write_response_t = proxmox_api_response_t<proxmox_ha_write_t>;
export type proxmox_task_wait_many_response_t = proxmox_api_response_t<proxmox_task_wait_many_t>;
export type proxmox_node_maintenance_plan_response_t = proxmox_api_response_t<proxmox_node_maintenance_plan_t>;
export type proxmox_node_drain_response_t = proxmox_api_response_t<proxmox_node_drain_t>;
export type proxmox_dr_replication_discovery_response_t =
  proxmox_api_response_t<proxmox_dr_replication_discovery_t>;
export type proxmox_dr_backup_discovery_response_t =
  proxmox_api_response_t<proxmox_dr_backup_discovery_t>;
export type proxmox_dr_readiness_response_t = proxmox_api_response_t<proxmox_dr_readiness_t>;

export type proxmox_vm_record_t = proxmox_vm_record_i;
export type proxmox_lxc_record_t = proxmox_lxc_record_i;
export type proxmox_vm_list_t = proxmox_vm_record_t[];
export type proxmox_lxc_list_t = proxmox_lxc_record_t[];
export type proxmox_vm_get_t = proxmox_vm_record_t;
export type proxmox_lxc_get_t = proxmox_lxc_record_t;
export type proxmox_vm_task_started_t = (proxmox_task_operation_record_i & { resource_type: "qemu" }) & proxmox_vm_task_response_i;
export type proxmox_vm_task_completed_t = (proxmox_task_operation_completed_record_i & { resource_type: "qemu" }) & proxmox_vm_task_response_i;
export type proxmox_lxc_task_started_t = (proxmox_task_operation_record_i & { resource_type: "lxc" }) & proxmox_lxc_task_response_i;
export type proxmox_lxc_task_completed_t = (proxmox_task_operation_completed_record_i & { resource_type: "lxc" }) & proxmox_lxc_task_response_i;
export type proxmox_vm_task_result_t = proxmox_vm_task_started_t | proxmox_vm_task_completed_t;
export type proxmox_lxc_task_result_t = proxmox_lxc_task_started_t | proxmox_lxc_task_completed_t;

export type proxmox_vm_list_response_t = proxmox_api_response_t<proxmox_vm_list_t>;
export type proxmox_lxc_list_response_t = proxmox_api_response_t<proxmox_lxc_list_t>;
export type proxmox_vm_get_response_t = proxmox_api_response_t<proxmox_vm_get_t>;
export type proxmox_lxc_get_response_t = proxmox_api_response_t<proxmox_lxc_get_t>;
export type proxmox_cluster_next_id_response_t = proxmox_api_response_t<proxmox_cluster_next_id_t>;
export type proxmox_cluster_storage_compatibility_response_t = proxmox_api_response_t<proxmox_cluster_storage_compatibility_t>;
export type proxmox_cluster_bridge_compatibility_response_t = proxmox_api_response_t<proxmox_cluster_bridge_compatibility_t>;
