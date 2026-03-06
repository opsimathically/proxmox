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

export interface proxmox_node_list_query_i {
  running?: boolean;
}

export interface proxmox_node_status_query_i {
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

export type proxmox_datacenter_summary_t = proxmox_datacenter_summary_record_i;
export type proxmox_datacenter_storage_list_t = proxmox_datacenter_storage_record_i[];
export type proxmox_datacenter_version_t = proxmox_version_info_i;
export type proxmox_cluster_status_t = proxmox_cluster_status_record_i[];
export type proxmox_cluster_membership_t = proxmox_cluster_member_record_i[];
export type proxmox_node_list_t = proxmox_node_record_i[];
export type proxmox_node_status_t = proxmox_node_status_record_i;
export type proxmox_node_services_t = proxmox_node_service_record_i[];
export type proxmox_node_metrics_t = proxmox_node_metrics_record_i[];
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
export type proxmox_storage_content_list_response_t = proxmox_api_response_t<proxmox_storage_content_list_t>;
export type proxmox_storage_template_catalog_response_t = proxmox_api_response_t<proxmox_storage_template_catalog_list_t>;
export type proxmox_storage_task_response_t = proxmox_api_response_t<proxmox_storage_task_t>;
export type proxmox_storage_download_response_t = proxmox_api_response_t<proxmox_storage_download_t>;

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
