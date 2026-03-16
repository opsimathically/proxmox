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

export interface proxmox_lxc_command_environment_i {
  [environment_variable: string]: string;
}

export interface proxmox_lxc_run_command_input_i extends proxmox_lxc_reference_input_i {
  command_argv?: string[];
  shell_mode?: boolean;
  shell_command?: string;
  env?: proxmox_lxc_command_environment_i;
  cwd?: string;
  user?: string;
  stdin_text?: string;
  timeout_ms?: number;
  max_output_bytes?: number;
  fail_on_non_zero_exit?: boolean;
  retry_allowed?: boolean;
}

export interface proxmox_lxc_get_system_info_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
}

export interface proxmox_lxc_get_cron_jobs_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_system_cron?: boolean;
  include_user_cron?: boolean;
}

export type proxmox_lxc_process_environment_mode_t =
  | "none"
  | "keys_only"
  | "sanitized_values";

export interface proxmox_lxc_get_process_list_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_environment?: boolean;
  include_threads?: boolean;
  pid_filter?: Array<number | string>;
  user_filter?: string[];
  process_limit?: number;
  environment_mode?: proxmox_lxc_process_environment_mode_t;
  max_environment_bytes_per_process?: number;
  max_environment_bytes_total?: number;
}

export type proxmox_lxc_address_family_t = "ipv4" | "ipv6";

export interface proxmox_lxc_get_open_tcp_ports_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_environment?: boolean;
  environment_mode?: proxmox_lxc_process_environment_mode_t;
  include_interfaces?: boolean;
  process_limit?: number;
  listener_limit?: number;
  port_filter?: Array<number | string>;
  address_family_filter?: proxmox_lxc_address_family_t[];
  include_loopback?: boolean;
  max_environment_bytes_per_process?: number;
  max_environment_bytes_total?: number;
}

export interface proxmox_lxc_get_open_udp_ports_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_environment?: boolean;
  environment_mode?: proxmox_lxc_process_environment_mode_t;
  include_interfaces?: boolean;
  process_limit?: number;
  listener_limit?: number;
  port_filter?: Array<number | string>;
  address_family_filter?: proxmox_lxc_address_family_t[];
  include_loopback?: boolean;
  max_environment_bytes_per_process?: number;
  max_environment_bytes_total?: number;
}

export type proxmox_lxc_service_manager_t = "systemd" | "openrc" | "sysvinit" | "unknown";
export type proxmox_lxc_service_probe_source_kind_t =
  | "systemd_units"
  | "systemd_unit_files"
  | "openrc_status"
  | "openrc_update"
  | "sysv_service_status"
  | "sysv_initd"
  | "fallback_static";
export type proxmox_lxc_service_detail_level_t = "summary_only" | "standard" | "full";
export type proxmox_lxc_service_process_enrichment_mode_t = "none" | "main_pid_only" | "full";

export interface proxmox_lxc_get_services_and_daemons_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_inactive?: boolean;
  include_failed?: boolean;
  include_disabled?: boolean;
  include_process_details?: boolean;
  process_enrichment_mode?: proxmox_lxc_service_process_enrichment_mode_t;
  include_environment?: boolean;
  environment_mode?: proxmox_lxc_process_environment_mode_t;
  detail_level?: proxmox_lxc_service_detail_level_t;
  service_limit?: number;
  name_filter?: string[];
  max_environment_bytes_per_process?: number;
  max_environment_bytes_total?: number;
}

export type proxmox_lxc_hardware_bus_type_t =
  | "pci"
  | "usb"
  | "block"
  | "net"
  | "virtual"
  | "other";
export type proxmox_lxc_hardware_source_kind_t =
  | "sysfs_net"
  | "sysfs_block"
  | "lspci"
  | "sysfs_pci"
  | "lsusb"
  | "sysfs_usb"
  | "proc_mounts"
  | "proc_meminfo"
  | "proc_cpuinfo"
  | "dri"
  | "probe";

export interface proxmox_lxc_get_hardware_inventory_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_network?: boolean;
  include_storage?: boolean;
  include_pci?: boolean;
  include_usb?: boolean;
  include_graphics?: boolean;
  include_virtual_devices?: boolean;
  device_limit?: number;
}

export interface proxmox_lxc_hardware_device_record_i {
  device_id: string;
  name?: string;
  class: string;
  subclass?: string;
  bus_type: proxmox_lxc_hardware_bus_type_t;
  path?: string;
  pci_address?: string;
  usb_bus_device?: string;
  vendor_id?: string;
  vendor_name?: string;
  product_id?: string;
  product_name?: string;
  model?: string;
  interface_name?: string;
  mac_address?: string;
  driver?: string;
  link_state?: string;
  speed_mbps?: number;
  block_name?: string;
  size_bytes?: number;
  rotational?: boolean;
  mountpoints?: string[];
  filesystem?: string;
  is_graphics: boolean;
  render_nodes?: string[];
  is_virtual_device?: boolean;
  is_passthrough_candidate?: boolean;
  source_kind: proxmox_lxc_hardware_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_hardware_scan_error_record_i {
  source_kind: proxmox_lxc_hardware_source_kind_t;
  device_id?: string;
  reason: string;
}

export interface proxmox_lxc_hardware_parse_warning_record_i {
  source_kind: proxmox_lxc_hardware_source_kind_t;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_hardware_summary_record_i {
  total_devices: number;
  network_device_count: number;
  storage_device_count: number;
  graphics_device_count: number;
  unknown_or_partial_count: number;
  bus_type_counts: Record<string, number>;
  class_counts: Record<string, number>;
  vendor_counts: Record<string, number>;
  model_counts: Record<string, number>;
  top_vendors: string[];
  top_models: string[];
}

export interface proxmox_lxc_hardware_probe_metadata_record_i {
  primary_source: proxmox_lxc_hardware_source_kind_t;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_hardware_limits_applied_record_i {
  device_limit: number;
  include_network: boolean;
  include_storage: boolean;
  include_pci: boolean;
  include_usb: boolean;
  include_graphics: boolean;
  include_virtual_devices: boolean;
}

export interface proxmox_lxc_hardware_inventory_result_record_i {
  node_id: string;
  container_id: string;
  devices: proxmox_lxc_hardware_device_record_i[];
  summary: proxmox_lxc_hardware_summary_record_i;
  probe_metadata: proxmox_lxc_hardware_probe_metadata_record_i;
  scan_errors: proxmox_lxc_hardware_scan_error_record_i[];
  parse_warnings: proxmox_lxc_hardware_parse_warning_record_i[];
  limits_applied: proxmox_lxc_hardware_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export type proxmox_lxc_disk_device_type_t =
  | "disk"
  | "partition"
  | "loop"
  | "rom"
  | "lvm"
  | "dm"
  | "md"
  | "other";
export type proxmox_lxc_filesystem_scope_t =
  | "all"
  | "device_backed_only"
  | "persistent_only";
export type proxmox_lxc_disk_source_kind_t =
  | "lsblk"
  | "findmnt"
  | "blkid"
  | "proc_partitions"
  | "proc_mounts"
  | "proc_mountinfo"
  | "sysfs_block"
  | "df"
  | "probe";

export interface proxmox_lxc_get_disk_and_block_devices_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_partitions?: boolean;
  include_filesystems?: boolean;
  include_mounts?: boolean;
  include_usage?: boolean;
  include_loop_devices?: boolean;
  include_virtual_devices?: boolean;
  filesystem_scope?: proxmox_lxc_filesystem_scope_t;
  device_limit?: number;
  filesystem_limit?: number;
}

export interface proxmox_lxc_block_device_record_i {
  device_id: string;
  name: string;
  kname?: string;
  path: string;
  device_type: proxmox_lxc_disk_device_type_t;
  size_bytes?: number;
  logical_sector_size?: number;
  physical_sector_size?: number;
  read_only?: boolean;
  removable?: boolean;
  rotational?: boolean;
  model?: string;
  vendor?: string;
  serial?: string;
  wwn?: string;
  transport?: string;
  parent_device_id?: string;
  children_device_ids?: string[];
  is_virtual_device?: boolean;
  source_kind: proxmox_lxc_disk_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_block_partition_record_i {
  partition_id: string;
  parent_device_id?: string;
  partition_name: string;
  partition_number?: number;
  path: string;
  start_bytes?: number;
  size_bytes?: number;
  filesystem_type?: string;
  uuid?: string;
  label?: string;
  mountpoints?: string[];
  is_mounted: boolean;
  source_kind: proxmox_lxc_disk_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_filesystem_record_i {
  filesystem_id: string;
  source: string;
  device_path?: string;
  mountpoint: string;
  filesystem_type: string;
  mount_options?: string;
  is_read_only?: boolean;
  total_bytes?: number;
  used_bytes?: number;
  available_bytes?: number;
  used_percent?: number;
  source_kind: proxmox_lxc_disk_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_mount_record_i {
  mount_id: string;
  source: string;
  target: string;
  filesystem_type: string;
  mount_options?: string;
  is_read_only?: boolean;
  source_kind: proxmox_lxc_disk_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_disk_scan_error_record_i {
  source_kind: proxmox_lxc_disk_source_kind_t;
  device_id?: string;
  reason: string;
}

export interface proxmox_lxc_disk_parse_warning_record_i {
  source_kind: proxmox_lxc_disk_source_kind_t;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_disk_summary_record_i {
  total_block_devices: number;
  total_physical_like_disks: number;
  total_partitions: number;
  total_filesystems: number;
  total_mounts: number;
  mounted_filesystem_count: number;
  filesystem_type_counts: Record<string, number>;
  mountpoint_counts: Record<string, number>;
  device_type_counts: Record<string, number>;
  total_bytes?: number;
  used_bytes?: number;
  available_bytes?: number;
  unknown_or_partial_count: number;
}

export interface proxmox_lxc_disk_probe_metadata_record_i {
  primary_source: proxmox_lxc_disk_source_kind_t;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_disk_limits_applied_record_i {
  device_limit: number;
  filesystem_limit: number;
  include_partitions: boolean;
  include_filesystems: boolean;
  include_mounts: boolean;
  include_usage: boolean;
  include_loop_devices: boolean;
  include_virtual_devices: boolean;
  filesystem_scope: proxmox_lxc_filesystem_scope_t;
}

export interface proxmox_lxc_disk_and_block_devices_result_record_i {
  node_id: string;
  container_id: string;
  block_devices: proxmox_lxc_block_device_record_i[];
  partitions: proxmox_lxc_block_partition_record_i[];
  filesystems: proxmox_lxc_filesystem_record_i[];
  mounts: proxmox_lxc_mount_record_i[];
  summary: proxmox_lxc_disk_summary_record_i;
  probe_metadata: proxmox_lxc_disk_probe_metadata_record_i;
  scan_errors: proxmox_lxc_disk_scan_error_record_i[];
  parse_warnings: proxmox_lxc_disk_parse_warning_record_i[];
  limits_applied: proxmox_lxc_disk_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export interface proxmox_lxc_get_memory_info_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_process_breakdown?: boolean;
  include_process_rss_components?: boolean;
  include_kernel_breakdown?: boolean;
  include_cgroup_limits?: boolean;
  process_limit?: number;
  process_rss_component_probe_limit?: number;
  min_process_rss_kb?: number;
  include_zero_swap_entries?: boolean;
}

export interface proxmox_lxc_memory_top_level_record_i {
  mem_total_kb?: number;
  mem_available_kb?: number;
  mem_free_kb?: number;
  mem_used_kb?: number;
  used_percent?: number;
  buffers_kb?: number;
  cached_kb?: number;
  sreclaimable_kb?: number;
  shmem_kb?: number;
  active_kb?: number;
  inactive_kb?: number;
}

export interface proxmox_lxc_swap_device_record_i {
  source: string;
  type?: string;
  size_kb?: number;
  used_kb?: number;
  priority?: number;
}

export interface proxmox_lxc_swap_record_i {
  swap_total_kb?: number;
  swap_free_kb?: number;
  swap_used_kb?: number;
  swap_used_percent?: number;
  devices: proxmox_lxc_swap_device_record_i[];
}

export interface proxmox_lxc_kernel_memory_record_i {
  kernel_stack_kb?: number;
  page_tables_kb?: number;
  slab_kb?: number;
  s_unreclaim_kb?: number;
  kernel_memory_estimate_kb?: number;
}

export interface proxmox_lxc_memory_process_record_i {
  pid: number;
  ppid?: number;
  comm?: string;
  cmdline?: string;
  username?: string;
  uid?: number;
  state?: proxmox_lxc_process_state_t;
  rss_kb?: number;
  vsz_kb?: number;
  memory_percent?: number;
  rss_anon_kb?: number;
  rss_file_kb?: number;
  rss_shmem_kb?: number;
}

export interface proxmox_lxc_memory_scan_error_record_i {
  source_kind: string;
  pid?: number;
  reason: string;
}

export interface proxmox_lxc_memory_parse_warning_record_i {
  source_kind: string;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_memory_summary_record_i {
  process_count: number;
  top_rss_pids: number[];
  top_memory_percent_pids: number[];
  memory_pressure_available: boolean;
  psi_some_avg10?: number;
  psi_full_avg10?: number;
  cgroup_limit_kb?: number;
  cgroup_current_kb?: number;
  cgroup_swap_limit_kb?: number;
  cgroup_swap_current_kb?: number;
  unknown_or_partial_count: number;
}

export interface proxmox_lxc_memory_probe_metadata_record_i {
  primary_source: string;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_memory_limits_applied_record_i {
  include_process_breakdown: boolean;
  include_process_rss_components: boolean;
  include_kernel_breakdown: boolean;
  include_cgroup_limits: boolean;
  include_zero_swap_entries: boolean;
  process_limit: number;
  process_rss_component_probe_limit: number;
  min_process_rss_kb?: number;
}

export interface proxmox_lxc_memory_info_result_record_i {
  node_id: string;
  container_id: string;
  memory: proxmox_lxc_memory_top_level_record_i;
  swap: proxmox_lxc_swap_record_i;
  kernel: proxmox_lxc_kernel_memory_record_i;
  processes: proxmox_lxc_memory_process_record_i[];
  summary: proxmox_lxc_memory_summary_record_i;
  probe_metadata: proxmox_lxc_memory_probe_metadata_record_i;
  scan_errors: proxmox_lxc_memory_scan_error_record_i[];
  parse_warnings: proxmox_lxc_memory_parse_warning_record_i[];
  limits_applied: proxmox_lxc_memory_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export interface proxmox_lxc_get_cpu_info_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_per_core?: boolean;
  include_flags?: boolean;
  include_top_snapshot?: boolean;
  include_cgroup_limits?: boolean;
  include_cpu_pressure?: boolean;
  core_limit?: number;
  include_offline_cores?: boolean;
}

export interface proxmox_lxc_cpu_top_level_record_i {
  vendor_id?: string;
  model_name?: string;
  cpu_family?: string;
  model?: string;
  stepping?: string;
  microcode?: string;
  architecture?: string;
  logical_cpu_count?: number;
  online_cpu_count?: number;
  offline_cpu_count?: number;
  cpuset_effective?: string;
  cpuset_cpu_count?: number;
  cgroup_quota_us?: number;
  cgroup_period_us?: number;
  effective_quota_cores?: number;
  flags?: string[];
}

export interface proxmox_lxc_cpu_core_stat_record_i {
  user?: number;
  nice?: number;
  system?: number;
  idle?: number;
  iowait?: number;
  irq?: number;
  softirq?: number;
  steal?: number;
  guest?: number;
  guest_nice?: number;
}

export interface proxmox_lxc_cpu_core_record_i {
  core_id: number;
  processor_id?: number;
  physical_id?: number;
  siblings?: number;
  cpu_cores?: number;
  bogomips?: number;
  mhz?: number;
  online?: boolean;
  stat?: proxmox_lxc_cpu_core_stat_record_i;
}

export interface proxmox_lxc_cpu_top_process_record_i {
  pid: number;
  comm?: string;
  username?: string;
  cpu_percent?: number;
  args?: string;
}

export interface proxmox_lxc_cpu_scan_error_record_i {
  source_kind: string;
  reason: string;
}

export interface proxmox_lxc_cpu_parse_warning_record_i {
  source_kind: string;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_cpu_summary_record_i {
  total_bogomips?: number;
  per_core_bogomips: Array<{ core_id: number; bogomips: number }>;
  loadavg_1m?: number;
  loadavg_5m?: number;
  loadavg_15m?: number;
  cpu_pressure_available: boolean;
  psi_some_avg10?: number;
  psi_full_avg10?: number;
  top_cpu_pids: number[];
  top_cpu_processes: proxmox_lxc_cpu_top_process_record_i[];
  unknown_or_partial_count: number;
}

export interface proxmox_lxc_cpu_probe_metadata_record_i {
  primary_source: string;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_cpu_limits_applied_record_i {
  include_per_core: boolean;
  include_flags: boolean;
  include_top_snapshot: boolean;
  include_cgroup_limits: boolean;
  include_cpu_pressure: boolean;
  include_offline_cores: boolean;
  core_limit: number;
}

export interface proxmox_lxc_cpu_info_result_record_i {
  node_id: string;
  container_id: string;
  cpu: proxmox_lxc_cpu_top_level_record_i;
  cores: proxmox_lxc_cpu_core_record_i[];
  top_snapshot: proxmox_lxc_cpu_top_process_record_i[];
  summary: proxmox_lxc_cpu_summary_record_i;
  probe_metadata: proxmox_lxc_cpu_probe_metadata_record_i;
  scan_errors: proxmox_lxc_cpu_scan_error_record_i[];
  parse_warnings: proxmox_lxc_cpu_parse_warning_record_i[];
  limits_applied: proxmox_lxc_cpu_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export type proxmox_lxc_identity_password_status_t = "locked" | "set" | "no_password" | "unknown";
export type proxmox_lxc_identity_source_kind_t = "getent" | "file_fallback" | "shadow_status" | "last_login" | "sudoers";
export type proxmox_lxc_identity_privilege_detail_mode_t = "signals_only" | "sudoers_expanded";
export type proxmox_lxc_identity_confidence_t = "high" | "medium" | "low" | "unknown";

export interface proxmox_lxc_get_users_and_groups_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_system_accounts?: boolean;
  include_shadow_status?: boolean;
  include_last_login?: boolean;
  include_sudo_privilege_signals?: boolean;
  privilege_detail_mode?: proxmox_lxc_identity_privilege_detail_mode_t;
  include_group_memberships?: boolean;
  user_limit?: number;
  group_limit?: number;
  username_filter?: string;
  group_filter?: string;
}

export interface proxmox_lxc_identity_status_source_confidence_record_i {
  account_status: proxmox_lxc_identity_confidence_t;
  expiry_status: proxmox_lxc_identity_confidence_t;
  privilege_signal: proxmox_lxc_identity_confidence_t;
  last_login: proxmox_lxc_identity_confidence_t;
}

export interface proxmox_lxc_identity_user_record_i {
  username: string;
  uid: number;
  gid: number;
  gecos?: string;
  home_directory?: string;
  login_shell?: string;
  is_system_account: boolean;
  is_login_shell: boolean;
  is_locked?: boolean;
  is_disabled?: boolean;
  is_expired?: boolean;
  password_status: proxmox_lxc_identity_password_status_t;
  primary_group_name?: string;
  supplementary_groups?: string[];
  has_sudo_signal: boolean;
  sudo_signal_sources: string[];
  status_source_confidence: proxmox_lxc_identity_status_source_confidence_record_i;
  last_login_at_iso?: string;
  source_kind: proxmox_lxc_identity_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_identity_group_record_i {
  group_name: string;
  gid: number;
  members: string[];
  is_system_group: boolean;
  is_admin_group_signal: boolean;
  source_kind: proxmox_lxc_identity_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_identity_scan_error_record_i {
  source_kind: proxmox_lxc_identity_source_kind_t | "probe";
  username?: string;
  group_name?: string;
  reason: string;
}

export interface proxmox_lxc_identity_parse_warning_record_i {
  source_kind: proxmox_lxc_identity_source_kind_t | "probe";
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_identity_summary_record_i {
  total_users: number;
  total_groups: number;
  enabled_users: number;
  disabled_or_locked_users: number;
  expired_users: number;
  system_users: number;
  human_users_estimate: number;
  sudo_signal_user_count: number;
  top_privileged_groups: string[];
  unknown_or_partial_count: number;
}

export interface proxmox_lxc_identity_probe_metadata_record_i {
  primary_source: proxmox_lxc_identity_source_kind_t | "unknown";
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_identity_limits_applied_record_i {
  include_system_accounts: boolean;
  include_shadow_status: boolean;
  include_last_login: boolean;
  include_sudo_privilege_signals: boolean;
  privilege_detail_mode: proxmox_lxc_identity_privilege_detail_mode_t;
  include_group_memberships: boolean;
  user_limit: number;
  group_limit: number;
  username_filter?: string;
  group_filter?: string;
}

export interface proxmox_lxc_users_and_groups_result_record_i {
  node_id: string;
  container_id: string;
  users: proxmox_lxc_identity_user_record_i[];
  groups: proxmox_lxc_identity_group_record_i[];
  summary: proxmox_lxc_identity_summary_record_i;
  probe_metadata: proxmox_lxc_identity_probe_metadata_record_i;
  scan_errors: proxmox_lxc_identity_scan_error_record_i[];
  parse_warnings: proxmox_lxc_identity_parse_warning_record_i[];
  limits_applied: proxmox_lxc_identity_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export type proxmox_lxc_firewall_backend_t = "nftables" | "iptables" | "ufw" | "firewalld" | "unknown";
export type proxmox_lxc_firewall_family_t = "ipv4" | "ipv6" | "inet" | "unknown";
export type proxmox_lxc_firewall_action_t = "accept" | "drop" | "reject" | "jump" | "return" | "dnat" | "snat" | "masquerade" | "unknown";
export type proxmox_lxc_firewall_source_kind_t = "nft" | "iptables" | "ip6tables" | "ufw" | "firewalld" | "sysctl" | "probe";
export type proxmox_lxc_firewall_icmp_posture_t = true | false | "unknown";
export type proxmox_lxc_firewall_ingress_posture_t = "allow_any" | "allow_restricted" | "deny_default" | "unknown";
export type proxmox_lxc_firewall_finding_severity_t = "info" | "low" | "medium" | "high";

export interface proxmox_lxc_get_firewall_info_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_raw_rules?: boolean;
  include_nat?: boolean;
  include_counters?: boolean;
  include_ipv6?: boolean;
  include_security_findings?: boolean;
  rule_limit?: number;
  finding_limit?: number;
}

export interface proxmox_lxc_firewall_top_level_record_i {
  backend_primary: proxmox_lxc_firewall_backend_t;
  backends_detected: proxmox_lxc_firewall_backend_t[];
  is_firewall_active?: boolean;
  default_policy_input?: string;
  default_policy_output?: string;
  default_policy_forward?: string;
  supports_ipv6?: boolean;
}

export interface proxmox_lxc_firewall_rule_record_i {
  rule_index?: number;
  family: proxmox_lxc_firewall_family_t;
  backend: proxmox_lxc_firewall_backend_t;
  table?: string;
  chain?: string;
  hook?: string;
  priority?: string;
  action: proxmox_lxc_firewall_action_t;
  protocol?: string;
  src?: string;
  dst?: string;
  sport?: string;
  dport?: string;
  icmp_type?: string;
  state_match?: string;
  interface_in?: string;
  interface_out?: string;
  is_established_related_rule: boolean;
  is_loopback_rule: boolean;
  raw_rule?: string;
  counter_packets?: number;
  counter_bytes?: number;
  source_kind: proxmox_lxc_firewall_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_firewall_posture_record_i {
  icmp_echo_request_allowed: proxmox_lxc_firewall_icmp_posture_t;
  ingress_tcp_posture: proxmox_lxc_firewall_ingress_posture_t;
  ingress_udp_posture: proxmox_lxc_firewall_ingress_posture_t;
  ingress_default_deny: boolean | "unknown";
  notable_findings: proxmox_lxc_firewall_finding_record_i[];
}

export interface proxmox_lxc_firewall_finding_record_i {
  severity: proxmox_lxc_firewall_finding_severity_t;
  reason_code: string;
  summary: string;
  remediation_hint?: string;
}

export interface proxmox_lxc_firewall_scan_error_record_i {
  source_kind: proxmox_lxc_firewall_source_kind_t | "probe";
  reason: string;
}

export interface proxmox_lxc_firewall_parse_warning_record_i {
  source_kind: proxmox_lxc_firewall_source_kind_t | "probe";
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_firewall_summary_record_i {
  total_rules: number;
  backend_counts: Record<string, number>;
  family_counts: Record<string, number>;
  action_counts: Record<string, number>;
  protocol_counts: Record<string, number>;
  open_ingress_port_hints: string[];
  finding_counts_by_severity: Record<string, number>;
  unknown_or_partial_count: number;
}

export interface proxmox_lxc_firewall_probe_metadata_record_i {
  primary_source: proxmox_lxc_firewall_source_kind_t | "unknown";
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_firewall_limits_applied_record_i {
  include_raw_rules: boolean;
  include_nat: boolean;
  include_counters: boolean;
  include_ipv6: boolean;
  include_security_findings: boolean;
  rule_limit: number;
  finding_limit: number;
}

export interface proxmox_lxc_firewall_info_result_record_i {
  node_id: string;
  container_id: string;
  firewall: proxmox_lxc_firewall_top_level_record_i;
  rules: proxmox_lxc_firewall_rule_record_i[];
  posture: proxmox_lxc_firewall_posture_record_i;
  summary: proxmox_lxc_firewall_summary_record_i;
  probe_metadata: proxmox_lxc_firewall_probe_metadata_record_i;
  scan_errors: proxmox_lxc_firewall_scan_error_record_i[];
  parse_warnings: proxmox_lxc_firewall_parse_warning_record_i[];
  limits_applied: proxmox_lxc_firewall_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export type proxmox_lxc_devtool_ecosystem_kind_t =
  | "c_cpp"
  | "nodejs"
  | "python"
  | "ruby"
  | "go"
  | "rust"
  | "other";
export type proxmox_lxc_devtool_source_kind_t =
  | "probe"
  | "tool"
  | "package_inventory"
  | "system_package_provider"
  | "distro_package_inventory";
export type proxmox_lxc_devtool_inventory_completeness_t = "none" | "partial" | "full";
export type proxmox_lxc_devtool_distro_package_manager_t = "dpkg" | "apk" | "rpm" | "pacman" | "unknown";
export type proxmox_lxc_devtool_distro_package_confidence_t = "high" | "medium" | "low";

export interface proxmox_lxc_get_development_tooling_info_input_i extends proxmox_lxc_reference_input_i {
  timeout_ms?: number;
  max_output_bytes?: number;
  include_c_cpp?: boolean;
  include_nodejs?: boolean;
  include_python?: boolean;
  include_ruby?: boolean;
  include_go?: boolean;
  include_rust?: boolean;
  include_package_inventory?: boolean;
  include_compiler_search_paths?: boolean;
  include_system_package_providers?: boolean;
  module_limit_per_runtime?: number;
  package_limit_per_runtime?: number;
  include_transitive_metadata?: boolean;
  include_distro_package_enrichment?: boolean;
  distro_package_limit_total?: number;
  distro_package_limit_per_ecosystem?: number;
  distro_package_name_filters?: string[];
}

export interface proxmox_lxc_devtool_executable_record_i {
  name: string;
  path?: string;
  version?: string;
}

export interface proxmox_lxc_devtool_package_manager_record_i {
  manager_name: string;
  is_present: boolean;
  path?: string;
  version?: string;
}

export interface proxmox_lxc_devtool_library_record_i {
  name: string;
  version?: string;
  source?: string;
}

export interface proxmox_lxc_devtool_distro_package_record_i {
  package_name: string;
  package_version?: string;
  source_manager: proxmox_lxc_devtool_distro_package_manager_t;
  ecosystem_matches: proxmox_lxc_devtool_ecosystem_kind_t[];
  confidence: proxmox_lxc_devtool_distro_package_confidence_t;
}

export interface proxmox_lxc_devtool_toolchain_record_i {
  ecosystem_kind: proxmox_lxc_devtool_ecosystem_kind_t;
  is_present: boolean;
  executables: proxmox_lxc_devtool_executable_record_i[];
  versions: Record<string, string>;
  package_managers: proxmox_lxc_devtool_package_manager_record_i[];
  libraries_or_modules: proxmox_lxc_devtool_library_record_i[];
  distro_packages?: proxmox_lxc_devtool_distro_package_record_i[];
  search_paths?: Record<string, string>;
  runtime_paths?: Record<string, string>;
  source_kind: proxmox_lxc_devtool_source_kind_t;
  warnings?: string[];
}

export interface proxmox_lxc_devtool_scan_error_record_i {
  source_kind: proxmox_lxc_devtool_source_kind_t | "probe";
  reason: string;
}

export interface proxmox_lxc_devtool_parse_warning_record_i {
  source_kind: proxmox_lxc_devtool_source_kind_t | "probe";
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_devtool_summary_record_i {
  development_tooling_score: number;
  ecosystems_present: proxmox_lxc_devtool_ecosystem_kind_t[];
  ecosystems_missing: proxmox_lxc_devtool_ecosystem_kind_t[];
  ecosystem_module_counts: Record<string, number>;
  package_inventory_completeness: proxmox_lxc_devtool_inventory_completeness_t;
  unknown_or_partial_count: number;
}

export interface proxmox_lxc_devtool_probe_metadata_record_i {
  primary_source: proxmox_lxc_devtool_source_kind_t | "unknown";
  fallback_used: boolean;
  commands: string[];
  distro_package_enrichment_enabled: boolean;
  distro_package_manager_used?: proxmox_lxc_devtool_distro_package_manager_t;
  distro_packages_scanned_count: number;
  distro_packages_mapped_count: number;
  distro_packages_truncated: boolean;
}

export interface proxmox_lxc_devtool_limits_applied_record_i {
  include_package_inventory: boolean;
  include_compiler_search_paths: boolean;
  include_system_package_providers: boolean;
  include_transitive_metadata: boolean;
  module_limit_per_runtime: number;
  package_limit_per_runtime: number;
  include_distro_package_enrichment: boolean;
  distro_package_limit_total: number;
  distro_package_limit_per_ecosystem: number;
  distro_package_name_filters: string[];
}

export interface proxmox_lxc_development_tooling_info_result_record_i {
  node_id: string;
  container_id: string;
  toolchains: proxmox_lxc_devtool_toolchain_record_i[];
  system_package_providers: proxmox_lxc_devtool_package_manager_record_i[];
  summary: proxmox_lxc_devtool_summary_record_i;
  probe_metadata: proxmox_lxc_devtool_probe_metadata_record_i;
  scan_errors: proxmox_lxc_devtool_scan_error_record_i[];
  parse_warnings: proxmox_lxc_devtool_parse_warning_record_i[];
  limits_applied: proxmox_lxc_devtool_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export type proxmox_lxc_system_report_section_id_t =
  | "system_info"
  | "cron_jobs"
  | "processes"
  | "tcp_ports"
  | "udp_ports"
  | "services"
  | "hardware"
  | "disk"
  | "memory"
  | "cpu"
  | "identity"
  | "firewall"
  | "devtools";
export type proxmox_lxc_system_report_section_status_t =
  | "success"
  | "partial"
  | "failed"
  | "disabled";
export type proxmox_lxc_system_report_theme_t = "dark";

export interface proxmox_lxc_system_report_section_selection_i {
  include_system_info?: boolean;
  include_cron_jobs?: boolean;
  include_processes?: boolean;
  include_tcp_ports?: boolean;
  include_udp_ports?: boolean;
  include_services?: boolean;
  include_hardware?: boolean;
  include_disk?: boolean;
  include_memory?: boolean;
  include_cpu?: boolean;
  include_identity?: boolean;
  include_firewall?: boolean;
  include_devtools?: boolean;
}

export interface proxmox_lxc_system_report_collection_options_i {
  section_timeout_ms?: number;
  process_limit?: number;
  listener_limit?: number;
  service_limit?: number;
  hardware_device_limit?: number;
  disk_device_limit?: number;
  disk_filesystem_limit?: number;
  memory_process_limit?: number;
  cpu_core_limit?: number;
  identity_user_limit?: number;
  identity_group_limit?: number;
  firewall_rule_limit?: number;
  firewall_finding_limit?: number;
  devtools_module_limit_per_runtime?: number;
  devtools_package_limit_per_runtime?: number;
  devtools_include_distro_package_enrichment?: boolean;
  devtools_distro_package_limit_total?: number;
  devtools_distro_package_limit_per_ecosystem?: number;
}

export interface proxmox_lxc_system_report_render_options_i {
  theme?: proxmox_lxc_system_report_theme_t;
  report_title?: string;
  include_raw_json?: boolean;
  max_table_rows?: number;
}

export interface proxmox_lxc_generate_system_report_base_input_i extends proxmox_lxc_reference_input_i {
  sections?: proxmox_lxc_system_report_section_selection_i;
  collection_options?: proxmox_lxc_system_report_collection_options_i;
  render_options?: proxmox_lxc_system_report_render_options_i;
  fail_on_section_error?: boolean;
}

export interface proxmox_lxc_generate_system_report_html_input_i
  extends proxmox_lxc_generate_system_report_base_input_i {}

export interface proxmox_lxc_generate_system_report_file_input_i
  extends proxmox_lxc_generate_system_report_base_input_i {
  output_path?: string;
  output_dir?: string;
  file_name_prefix?: string;
  overwrite?: boolean;
}

export interface proxmox_lxc_system_report_section_metadata_record_i {
  section_id: proxmox_lxc_system_report_section_id_t;
  status: proxmox_lxc_system_report_section_status_t;
  warning_count: number;
  error_count: number;
  truncated: boolean;
  duration_ms: number;
  message?: string;
}

export interface proxmox_lxc_system_report_metadata_record_i {
  node_id: string;
  container_id: string;
  generated_at_iso: string;
  total_duration_ms: number;
  sections: proxmox_lxc_system_report_section_metadata_record_i[];
  section_status_counts: Record<proxmox_lxc_system_report_section_status_t, number>;
}

export interface proxmox_lxc_system_report_html_result_record_i {
  html: string;
  metadata: proxmox_lxc_system_report_metadata_record_i;
}

export interface proxmox_lxc_system_report_file_result_record_i {
  report_path: string;
  bytes_written: number;
  metadata: proxmox_lxc_system_report_metadata_record_i;
}

export interface proxmox_lxc_service_record_i {
  service_name: string;
  display_name?: string;
  description?: string;
  manager_kind: proxmox_lxc_service_manager_t;
  active_state: string;
  sub_state?: string;
  is_running: boolean;
  health_state?: string;
  enabled_state?: string;
  start_on_boot?: boolean;
  preset_state?: string;
  main_pid?: number;
  pids?: number[];
  exec_start?: string;
  exec_reload?: string;
  restart_policy?: string;
  tasks_current?: number;
  memory_current_bytes?: number;
  cpu_usage_usec?: number;
  unit_file_path?: string;
  fragment_path?: string;
  source_kind: proxmox_lxc_service_probe_source_kind_t;
  process?: proxmox_lxc_process_record_i;
  warnings?: string[];
}

export interface proxmox_lxc_service_scan_error_record_i {
  source_kind: proxmox_lxc_service_probe_source_kind_t;
  service_name?: string;
  reason: string;
}

export interface proxmox_lxc_service_parse_warning_record_i {
  source_kind: proxmox_lxc_service_probe_source_kind_t;
  service_name?: string;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_service_summary_record_i {
  total_services: number;
  running_count: number;
  stopped_count: number;
  failed_count: number;
  enabled_count: number;
  disabled_count: number;
  static_count: number;
  masked_count: number;
  state_counts: Record<string, number>;
  manager_counts: Record<string, number>;
  process_counts: Record<string, number>;
  user_counts: Record<string, number>;
  top_failed_services: string[];
}

export interface proxmox_lxc_service_probe_metadata_record_i {
  service_manager: proxmox_lxc_service_manager_t;
  primary_source: proxmox_lxc_service_probe_source_kind_t;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_service_limits_applied_record_i {
  service_limit: number;
  include_inactive: boolean;
  include_failed: boolean;
  include_disabled: boolean;
  include_process_details: boolean;
  process_enrichment_mode: proxmox_lxc_service_process_enrichment_mode_t;
  environment_mode: proxmox_lxc_process_environment_mode_t;
  detail_level: proxmox_lxc_service_detail_level_t;
}

export interface proxmox_lxc_services_and_daemons_result_record_i {
  node_id: string;
  container_id: string;
  service_manager: proxmox_lxc_service_manager_t;
  services: proxmox_lxc_service_record_i[];
  summary: proxmox_lxc_service_summary_record_i;
  probe_metadata: proxmox_lxc_service_probe_metadata_record_i;
  scan_errors: proxmox_lxc_service_scan_error_record_i[];
  parse_warnings: proxmox_lxc_service_parse_warning_record_i[];
  limits_applied: proxmox_lxc_service_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export interface proxmox_lxc_upload_file_input_i extends proxmox_lxc_reference_input_i {
  source_file_path: string;
  target_file_path: string;
  owner_user?: string;
  owner_group?: string;
  mode_octal?: string;
  create_parent_directories?: boolean;
  overwrite?: boolean;
  verify_checksum?: boolean;
  timeout_ms?: number;
  chunk_size_bytes?: number;
  high_water_mark_bytes?: number;
}

export interface proxmox_upload_phase_timings_record_i {
  prepare_ms: number;
  manifest_ms: number;
  archive_ms: number;
  transfer_ms: number;
  extract_ms: number;
  checksum_ms: number;
  total_ms: number;
}

export interface proxmox_upload_metrics_record_i {
  logical_bytes_uploaded: number;
  wire_bytes_uploaded: number;
  logical_throughput_bytes_per_sec: number;
  wire_throughput_bytes_per_sec: number;
  phase_timings: proxmox_upload_phase_timings_record_i;
}

export type proxmox_lxc_upload_directory_symlink_policy_t =
  | "skip"
  | "dereference"
  | "preserve";
export type proxmox_lxc_upload_directory_pattern_mode_t = "regex" | "glob";

export interface proxmox_lxc_upload_directory_input_i
  extends proxmox_lxc_reference_input_i {
  source_directory_path: string;
  target_directory_path: string;
  create_parent_directories?: boolean;
  overwrite?: boolean;
  verify_checksum?: boolean;
  timeout_ms?: number;
  chunk_size_bytes?: number;
  high_water_mark_bytes?: number;
  include_patterns?: string[];
  exclude_patterns?: string[];
  pattern_mode?: proxmox_lxc_upload_directory_pattern_mode_t;
  symlink_policy?: proxmox_lxc_upload_directory_symlink_policy_t;
  include_hidden?: boolean;
}

export interface proxmox_lxc_terminal_open_input_i extends proxmox_lxc_reference_input_i {
  command_argv?: string[];
  shell_mode?: boolean;
  shell_command?: string;
  env?: proxmox_lxc_command_environment_i;
  cwd?: string;
  user?: string;
  columns?: number;
  rows?: number;
  timeout_ms?: number;
  retry_allowed?: boolean;
}

export interface proxmox_lxc_terminal_send_input_i {
  session_id: string;
  input_text: string;
}

export interface proxmox_lxc_terminal_resize_input_i {
  session_id: string;
  columns: number;
  rows: number;
}

export interface proxmox_lxc_terminal_read_events_input_i {
  session_id: string;
  max_events?: number;
}

export interface proxmox_lxc_terminal_close_input_i {
  session_id: string;
  reason?: string;
  code?: number;
}

export interface proxmox_lxc_terminal_session_query_i {
  session_id: string;
}

export type proxmox_lxc_terminal_session_state_t = "opening" | "open" | "closed" | "error";
export type proxmox_lxc_terminal_event_type_t = "open" | "output" | "error" | "close";

export interface proxmox_lxc_terminal_handshake_record_i {
  backend: "ssh_pct";
  transport: "ssh";
  task_id?: string;
  user?: string;
  endpoint: string;
}

export interface proxmox_lxc_terminal_session_record_i {
  session_id: string;
  node_id: string;
  container_id: string;
  command: string;
  columns: number;
  rows: number;
  opened_at: string;
  closed_at?: string;
  status: proxmox_lxc_terminal_session_state_t;
  handshake: proxmox_lxc_terminal_handshake_record_i;
}

export interface proxmox_lxc_terminal_event_record_i {
  session_id: string;
  event_type: proxmox_lxc_terminal_event_type_t;
  timestamp_iso: string;
  output_chunk?: string;
  error_message?: string;
  close_code?: number;
  close_reason?: string;
}

export interface proxmox_lxc_run_command_result_record_i {
  session_id: string;
  node_id: string;
  container_id: string;
  command: string;
  execution_mode?: "ssh_pct";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  succeeded: boolean;
  timed_out: boolean;
  exit_code?: number;
  stdout: string;
  stderr: string;
  combined_output: string;
  truncated_output: boolean;
  handshake: proxmox_lxc_terminal_handshake_record_i;
}

export type proxmox_lxc_system_info_source_t =
  | "os_release"
  | "usr_lib_os_release"
  | "lsb_release"
  | "uname"
  | "derived"
  | "unknown";

export interface proxmox_lxc_system_info_source_fields_i {
  distribution_id: proxmox_lxc_system_info_source_t;
  distribution_name: proxmox_lxc_system_info_source_t;
  distribution_version: proxmox_lxc_system_info_source_t;
  distribution_pretty_name: proxmox_lxc_system_info_source_t;
  kernel_release: proxmox_lxc_system_info_source_t;
  kernel_version: proxmox_lxc_system_info_source_t;
}

export interface proxmox_lxc_system_info_record_i {
  node_id: string;
  container_id: string;
  distribution_id: string | null;
  distribution_name: string | null;
  distribution_version: string | null;
  distribution_pretty_name: string | null;
  kernel_release: string | null;
  kernel_version: string | null;
  source_fields: proxmox_lxc_system_info_source_fields_i;
  collected_at_iso: string;
}

export type proxmox_lxc_cron_source_kind_t = "system" | "cron_d" | "user_spool";
export type proxmox_lxc_cron_special_schedule_t =
  | "@annually"
  | "@yearly"
  | "@monthly"
  | "@weekly"
  | "@daily"
  | "@midnight"
  | "@hourly"
  | "@reboot";

export interface proxmox_lxc_cron_schedule_fields_i {
  minute: string;
  hour: string;
  day_of_month: string;
  month: string;
  day_of_week: string;
}

export interface proxmox_lxc_cron_job_record_i {
  schedule_expression: string | null;
  schedule_fields?: proxmox_lxc_cron_schedule_fields_i;
  special_schedule?: proxmox_lxc_cron_special_schedule_t;
  run_as_user: string | null;
  command: string;
  is_disabled: boolean;
  source_path: string;
  source_kind: proxmox_lxc_cron_source_kind_t;
  line_number: number;
  raw_line: string;
}

export interface proxmox_lxc_cron_parse_warning_record_i {
  source_path: string;
  source_kind: proxmox_lxc_cron_source_kind_t;
  line_number: number;
  reason: string;
  raw_line: string;
}

export interface proxmox_lxc_cron_scan_error_record_i {
  source_path: string;
  source_kind: proxmox_lxc_cron_source_kind_t;
  reason: string;
}

export interface proxmox_lxc_cron_jobs_result_record_i {
  node_id: string;
  container_id: string;
  jobs: proxmox_lxc_cron_job_record_i[];
  sources_scanned: string[];
  scan_errors: proxmox_lxc_cron_scan_error_record_i[];
  parse_warnings: proxmox_lxc_cron_parse_warning_record_i[];
  collected_at_iso: string;
}

export type proxmox_lxc_process_source_kind_t = "ps" | "procfs";
export type proxmox_lxc_process_state_t =
  | "running"
  | "sleeping"
  | "disk_sleep"
  | "stopped"
  | "zombie"
  | "idle"
  | "dead"
  | "wakekill"
  | "waking"
  | "parked"
  | "unknown";

export interface proxmox_lxc_process_probe_metadata_i {
  primary_source: proxmox_lxc_process_source_kind_t;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_process_scan_error_record_i {
  source_kind: proxmox_lxc_process_source_kind_t;
  pid?: number;
  reason: string;
}

export interface proxmox_lxc_process_parse_warning_record_i {
  source_kind: proxmox_lxc_process_source_kind_t;
  pid?: number;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_process_summary_record_i {
  total_process_count: number;
  state_counts: Record<string, number>;
  user_counts: Record<string, number>;
  top_cpu_pids: number[];
  top_memory_pids: number[];
}

export interface proxmox_lxc_process_limits_applied_record_i {
  process_limit: number;
  environment_mode: proxmox_lxc_process_environment_mode_t;
  max_environment_bytes_per_process: number;
  max_environment_bytes_total: number;
  include_threads: boolean;
}

export interface proxmox_lxc_process_record_i {
  pid: number;
  ppid?: number;
  pgid?: number;
  sid?: number;
  thread_count?: number;
  uid?: number;
  gid?: number;
  username?: string;
  group_name?: string;
  comm: string;
  argv: string[];
  cmdline: string;
  exe_path?: string;
  cwd_path?: string;
  root_path?: string;
  state: proxmox_lxc_process_state_t;
  start_time?: string;
  elapsed_time?: string;
  cpu_percent?: number;
  memory_percent?: number;
  rss_kb?: number;
  vsz_kb?: number;
  open_fd_count?: number;
  tty?: string;
  source_kind: proxmox_lxc_process_source_kind_t;
  environment_keys?: string[];
  environment?: Record<string, string>;
  warnings?: string[];
}

export interface proxmox_lxc_process_list_result_record_i {
  node_id: string;
  container_id: string;
  processes: proxmox_lxc_process_record_i[];
  summary: proxmox_lxc_process_summary_record_i;
  probe_metadata: proxmox_lxc_process_probe_metadata_i;
  scan_errors: proxmox_lxc_process_scan_error_record_i[];
  parse_warnings: proxmox_lxc_process_parse_warning_record_i[];
  limits_applied: proxmox_lxc_process_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export type proxmox_lxc_tcp_listener_source_kind_t = "ss" | "netstat" | "procfs";
export type proxmox_lxc_tcp_interface_match_kind_t =
  | "exact_ip"
  | "wildcard_any"
  | "loopback_default"
  | "unresolved";

export interface proxmox_lxc_tcp_listener_record_i {
  port: number;
  ip_address: string;
  bind_address: string;
  address_family: proxmox_lxc_address_family_t;
  is_loopback: boolean;
  is_wildcard: boolean;
  state: string;
  recv_queue?: number;
  send_queue?: number;
  source_kind: proxmox_lxc_tcp_listener_source_kind_t;
  pid?: number;
  inode?: number;
  fd?: number;
  interface_name?: string;
  interface_names?: string[];
  interface_match_kind: proxmox_lxc_tcp_interface_match_kind_t;
  interface_addresses?: string[];
  process?: proxmox_lxc_process_record_i;
  warnings?: string[];
}

export interface proxmox_lxc_tcp_listener_scan_error_record_i {
  source_kind: proxmox_lxc_tcp_listener_source_kind_t | "interface";
  pid?: number;
  inode?: number;
  reason: string;
}

export interface proxmox_lxc_tcp_listener_parse_warning_record_i {
  source_kind: proxmox_lxc_tcp_listener_source_kind_t;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_tcp_listener_summary_record_i {
  total_listeners: number;
  unique_ports: number;
  port_counts: Record<string, number>;
  address_family_counts: Record<string, number>;
  bind_scope_counts: Record<string, number>;
  interface_counts: Record<string, number>;
  interface_resolved_count: number;
  interface_unresolved_count: number;
  user_counts: Record<string, number>;
  process_counts: Record<string, number>;
  top_ports: number[];
  top_interfaces: string[];
}

export interface proxmox_lxc_tcp_listener_probe_metadata_record_i {
  primary_source: proxmox_lxc_tcp_listener_source_kind_t;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_tcp_listener_limits_applied_record_i {
  listener_limit: number;
  process_limit: number;
  include_loopback: boolean;
  include_interfaces: boolean;
  environment_mode: proxmox_lxc_process_environment_mode_t;
}

export interface proxmox_lxc_open_tcp_ports_result_record_i {
  node_id: string;
  container_id: string;
  listeners: proxmox_lxc_tcp_listener_record_i[];
  summary: proxmox_lxc_tcp_listener_summary_record_i;
  probe_metadata: proxmox_lxc_tcp_listener_probe_metadata_record_i;
  scan_errors: proxmox_lxc_tcp_listener_scan_error_record_i[];
  parse_warnings: proxmox_lxc_tcp_listener_parse_warning_record_i[];
  limits_applied: proxmox_lxc_tcp_listener_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export type proxmox_lxc_udp_listener_source_kind_t = "ss" | "netstat" | "procfs";

export interface proxmox_lxc_udp_listener_record_i {
  port: number;
  ip_address: string;
  bind_address: string;
  address_family: proxmox_lxc_address_family_t;
  is_loopback: boolean;
  is_wildcard: boolean;
  state: string;
  recv_queue?: number;
  send_queue?: number;
  source_kind: proxmox_lxc_udp_listener_source_kind_t;
  pid?: number;
  inode?: number;
  fd?: number;
  interface_name?: string;
  interface_names?: string[];
  interface_match_kind: proxmox_lxc_tcp_interface_match_kind_t;
  interface_addresses?: string[];
  process?: proxmox_lxc_process_record_i;
  warnings?: string[];
}

export interface proxmox_lxc_udp_listener_scan_error_record_i {
  source_kind: proxmox_lxc_udp_listener_source_kind_t | "interface";
  pid?: number;
  inode?: number;
  reason: string;
}

export interface proxmox_lxc_udp_listener_parse_warning_record_i {
  source_kind: proxmox_lxc_udp_listener_source_kind_t;
  reason: string;
  raw_line?: string;
}

export interface proxmox_lxc_udp_listener_summary_record_i {
  total_listeners: number;
  unique_ports: number;
  port_counts: Record<string, number>;
  address_family_counts: Record<string, number>;
  bind_scope_counts: Record<string, number>;
  interface_counts: Record<string, number>;
  interface_resolved_count: number;
  interface_unresolved_count: number;
  user_counts: Record<string, number>;
  process_counts: Record<string, number>;
  top_ports: number[];
  top_interfaces: string[];
}

export interface proxmox_lxc_udp_listener_probe_metadata_record_i {
  primary_source: proxmox_lxc_udp_listener_source_kind_t;
  fallback_used: boolean;
  commands: string[];
}

export interface proxmox_lxc_udp_listener_limits_applied_record_i {
  listener_limit: number;
  process_limit: number;
  include_loopback: boolean;
  include_interfaces: boolean;
  environment_mode: proxmox_lxc_process_environment_mode_t;
}

export interface proxmox_lxc_open_udp_ports_result_record_i {
  node_id: string;
  container_id: string;
  listeners: proxmox_lxc_udp_listener_record_i[];
  summary: proxmox_lxc_udp_listener_summary_record_i;
  probe_metadata: proxmox_lxc_udp_listener_probe_metadata_record_i;
  scan_errors: proxmox_lxc_udp_listener_scan_error_record_i[];
  parse_warnings: proxmox_lxc_udp_listener_parse_warning_record_i[];
  limits_applied: proxmox_lxc_udp_listener_limits_applied_record_i;
  truncated: boolean;
  collected_at_iso: string;
}

export interface proxmox_lxc_upload_file_result_record_i {
  session_id: string;
  node_id: string;
  container_id: string;
  source_file_path: string;
  target_file_path: string;
  bytes_uploaded: number;
  elapsed_ms: number;
  throughput_bytes_per_sec: number;
  overwrite: boolean;
  verify_checksum: boolean;
  checksum_source?: string;
  checksum_target?: string;
  retries: number;
  truncated: boolean;
  started_at: string;
  finished_at: string;
  metrics?: proxmox_upload_metrics_record_i;
  handshake: proxmox_lxc_terminal_handshake_record_i;
}

export interface proxmox_lxc_upload_directory_failed_entry_record_i {
  relative_path: string;
  reason: string;
}

export interface proxmox_lxc_upload_directory_result_record_i {
  session_id: string;
  node_id: string;
  container_id: string;
  source_directory_path: string;
  target_directory_path: string;
  files_uploaded: number;
  directories_created: number;
  bytes_uploaded: number;
  elapsed_ms: number;
  throughput_bytes_per_sec: number;
  skipped_count: number;
  failed_count: number;
  checksum_verified_count: number;
  overwrite: boolean;
  verify_checksum: boolean;
  checksum_source?: string;
  checksum_target?: string;
  retries: number;
  truncated: boolean;
  started_at: string;
  finished_at: string;
  failed_entries: proxmox_lxc_upload_directory_failed_entry_record_i[];
  metrics?: proxmox_upload_metrics_record_i;
  handshake: proxmox_lxc_terminal_handshake_record_i;
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
export type proxmox_lxc_terminal_session_t = proxmox_lxc_terminal_session_record_i;
export type proxmox_lxc_terminal_event_t = proxmox_lxc_terminal_event_record_i;
export type proxmox_lxc_run_command_result_t = proxmox_lxc_run_command_result_record_i;
export type proxmox_lxc_system_info_result_t = proxmox_lxc_system_info_record_i;
export type proxmox_lxc_cron_job_t = proxmox_lxc_cron_job_record_i;
export type proxmox_lxc_cron_parse_warning_t = proxmox_lxc_cron_parse_warning_record_i;
export type proxmox_lxc_cron_scan_error_t = proxmox_lxc_cron_scan_error_record_i;
export type proxmox_lxc_cron_jobs_result_t = proxmox_lxc_cron_jobs_result_record_i;
export type proxmox_lxc_process_record_t = proxmox_lxc_process_record_i;
export type proxmox_lxc_process_summary_t = proxmox_lxc_process_summary_record_i;
export type proxmox_lxc_process_scan_error_t = proxmox_lxc_process_scan_error_record_i;
export type proxmox_lxc_process_parse_warning_t = proxmox_lxc_process_parse_warning_record_i;
export type proxmox_lxc_process_list_result_t = proxmox_lxc_process_list_result_record_i;
export type proxmox_lxc_tcp_listener_t = proxmox_lxc_tcp_listener_record_i;
export type proxmox_lxc_tcp_listener_scan_error_t = proxmox_lxc_tcp_listener_scan_error_record_i;
export type proxmox_lxc_tcp_listener_parse_warning_t = proxmox_lxc_tcp_listener_parse_warning_record_i;
export type proxmox_lxc_tcp_listener_summary_t = proxmox_lxc_tcp_listener_summary_record_i;
export type proxmox_lxc_open_tcp_ports_result_t = proxmox_lxc_open_tcp_ports_result_record_i;
export type proxmox_lxc_udp_listener_t = proxmox_lxc_udp_listener_record_i;
export type proxmox_lxc_udp_listener_scan_error_t = proxmox_lxc_udp_listener_scan_error_record_i;
export type proxmox_lxc_udp_listener_parse_warning_t = proxmox_lxc_udp_listener_parse_warning_record_i;
export type proxmox_lxc_udp_listener_summary_t = proxmox_lxc_udp_listener_summary_record_i;
export type proxmox_lxc_open_udp_ports_result_t = proxmox_lxc_open_udp_ports_result_record_i;
export type proxmox_lxc_service_record_t = proxmox_lxc_service_record_i;
export type proxmox_lxc_service_scan_error_t = proxmox_lxc_service_scan_error_record_i;
export type proxmox_lxc_service_parse_warning_t = proxmox_lxc_service_parse_warning_record_i;
export type proxmox_lxc_service_summary_t = proxmox_lxc_service_summary_record_i;
export type proxmox_lxc_services_and_daemons_result_t = proxmox_lxc_services_and_daemons_result_record_i;
export type proxmox_lxc_hardware_device_t = proxmox_lxc_hardware_device_record_i;
export type proxmox_lxc_hardware_scan_error_t = proxmox_lxc_hardware_scan_error_record_i;
export type proxmox_lxc_hardware_parse_warning_t = proxmox_lxc_hardware_parse_warning_record_i;
export type proxmox_lxc_hardware_summary_t = proxmox_lxc_hardware_summary_record_i;
export type proxmox_lxc_hardware_inventory_result_t = proxmox_lxc_hardware_inventory_result_record_i;
export type proxmox_lxc_block_device_t = proxmox_lxc_block_device_record_i;
export type proxmox_lxc_block_partition_t = proxmox_lxc_block_partition_record_i;
export type proxmox_lxc_filesystem_t = proxmox_lxc_filesystem_record_i;
export type proxmox_lxc_mount_t = proxmox_lxc_mount_record_i;
export type proxmox_lxc_disk_scan_error_t = proxmox_lxc_disk_scan_error_record_i;
export type proxmox_lxc_disk_parse_warning_t = proxmox_lxc_disk_parse_warning_record_i;
export type proxmox_lxc_disk_summary_t = proxmox_lxc_disk_summary_record_i;
export type proxmox_lxc_disk_and_block_devices_result_t = proxmox_lxc_disk_and_block_devices_result_record_i;
export type proxmox_lxc_memory_top_level_t = proxmox_lxc_memory_top_level_record_i;
export type proxmox_lxc_swap_device_t = proxmox_lxc_swap_device_record_i;
export type proxmox_lxc_swap_t = proxmox_lxc_swap_record_i;
export type proxmox_lxc_kernel_memory_t = proxmox_lxc_kernel_memory_record_i;
export type proxmox_lxc_memory_process_t = proxmox_lxc_memory_process_record_i;
export type proxmox_lxc_memory_scan_error_t = proxmox_lxc_memory_scan_error_record_i;
export type proxmox_lxc_memory_parse_warning_t = proxmox_lxc_memory_parse_warning_record_i;
export type proxmox_lxc_memory_summary_t = proxmox_lxc_memory_summary_record_i;
export type proxmox_lxc_memory_info_result_t = proxmox_lxc_memory_info_result_record_i;
export type proxmox_lxc_cpu_top_level_t = proxmox_lxc_cpu_top_level_record_i;
export type proxmox_lxc_cpu_core_stat_t = proxmox_lxc_cpu_core_stat_record_i;
export type proxmox_lxc_cpu_core_t = proxmox_lxc_cpu_core_record_i;
export type proxmox_lxc_cpu_top_process_t = proxmox_lxc_cpu_top_process_record_i;
export type proxmox_lxc_cpu_scan_error_t = proxmox_lxc_cpu_scan_error_record_i;
export type proxmox_lxc_cpu_parse_warning_t = proxmox_lxc_cpu_parse_warning_record_i;
export type proxmox_lxc_cpu_summary_t = proxmox_lxc_cpu_summary_record_i;
export type proxmox_lxc_cpu_info_result_t = proxmox_lxc_cpu_info_result_record_i;
export type proxmox_lxc_identity_user_t = proxmox_lxc_identity_user_record_i;
export type proxmox_lxc_identity_group_t = proxmox_lxc_identity_group_record_i;
export type proxmox_lxc_identity_scan_error_t = proxmox_lxc_identity_scan_error_record_i;
export type proxmox_lxc_identity_parse_warning_t = proxmox_lxc_identity_parse_warning_record_i;
export type proxmox_lxc_identity_summary_t = proxmox_lxc_identity_summary_record_i;
export type proxmox_lxc_identity_status_source_confidence_t = proxmox_lxc_identity_status_source_confidence_record_i;
export type proxmox_lxc_users_and_groups_result_t = proxmox_lxc_users_and_groups_result_record_i;
export type proxmox_lxc_firewall_rule_t = proxmox_lxc_firewall_rule_record_i;
export type proxmox_lxc_firewall_scan_error_t = proxmox_lxc_firewall_scan_error_record_i;
export type proxmox_lxc_firewall_parse_warning_t = proxmox_lxc_firewall_parse_warning_record_i;
export type proxmox_lxc_firewall_summary_t = proxmox_lxc_firewall_summary_record_i;
export type proxmox_lxc_firewall_finding_t = proxmox_lxc_firewall_finding_record_i;
export type proxmox_lxc_firewall_info_result_t = proxmox_lxc_firewall_info_result_record_i;
export type proxmox_lxc_devtool_toolchain_t = proxmox_lxc_devtool_toolchain_record_i;
export type proxmox_lxc_devtool_distro_package_t = proxmox_lxc_devtool_distro_package_record_i;
export type proxmox_lxc_devtool_scan_error_t = proxmox_lxc_devtool_scan_error_record_i;
export type proxmox_lxc_devtool_parse_warning_t = proxmox_lxc_devtool_parse_warning_record_i;
export type proxmox_lxc_devtool_summary_t = proxmox_lxc_devtool_summary_record_i;
export type proxmox_lxc_development_tooling_info_result_t = proxmox_lxc_development_tooling_info_result_record_i;
export type proxmox_lxc_system_report_section_metadata_t =
  proxmox_lxc_system_report_section_metadata_record_i;
export type proxmox_lxc_system_report_metadata_t = proxmox_lxc_system_report_metadata_record_i;
export type proxmox_lxc_system_report_html_result_t = proxmox_lxc_system_report_html_result_record_i;
export type proxmox_lxc_system_report_file_result_t = proxmox_lxc_system_report_file_result_record_i;
export type proxmox_lxc_upload_file_result_t = proxmox_lxc_upload_file_result_record_i;
export type proxmox_lxc_upload_directory_failed_entry_t =
  proxmox_lxc_upload_directory_failed_entry_record_i;
export type proxmox_lxc_upload_directory_result_t =
  proxmox_lxc_upload_directory_result_record_i;
export type proxmox_upload_phase_timings_t = proxmox_upload_phase_timings_record_i;
export type proxmox_upload_metrics_t = proxmox_upload_metrics_record_i;

export type proxmox_vm_list_response_t = proxmox_api_response_t<proxmox_vm_list_t>;
export type proxmox_lxc_list_response_t = proxmox_api_response_t<proxmox_lxc_list_t>;
export type proxmox_vm_get_response_t = proxmox_api_response_t<proxmox_vm_get_t>;
export type proxmox_lxc_get_response_t = proxmox_api_response_t<proxmox_lxc_get_t>;
export type proxmox_cluster_next_id_response_t = proxmox_api_response_t<proxmox_cluster_next_id_t>;
export type proxmox_cluster_storage_compatibility_response_t = proxmox_api_response_t<proxmox_cluster_storage_compatibility_t>;
export type proxmox_cluster_bridge_compatibility_response_t = proxmox_api_response_t<proxmox_cluster_bridge_compatibility_t>;
