import * as fs from "node:fs/promises";
import * as path from "node:path";
import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_node_connection_i, proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { TaskPoller, proxmox_task_result_t } from "../core/task/task_poller";
import {
  ProxmoxLxcExecError,
  ProxmoxLxcUploadError,
  ProxmoxTerminalSessionError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";
import {
  proxmox_lxc_shell_backend_i,
} from "../core/lxc_shell/lxc_shell_backend";
import { SshPctLxcShellBackend } from "../core/lxc_shell/ssh_pct_lxc_shell_backend";
import {
  proxmox_task_polling_options_t,
  proxmox_lxc_list_query_i,
  proxmox_lxc_list_response_t,
  proxmox_lxc_reference_request_i,
  proxmox_lxc_get_response_t,
  proxmox_lxc_create_input_i,
  proxmox_lxc_update_input_i,
  proxmox_lxc_delete_input_i,
  proxmox_lxc_start_input_i,
  proxmox_lxc_stop_input_i,
  proxmox_lxc_migrate_input_i,
  proxmox_lxc_snapshot_input_i,
  proxmox_lxc_restore_input_i,
  proxmox_lxc_task_started_t,
  proxmox_lxc_task_completed_t,
  proxmox_lxc_task_result_t,
  proxmox_lxc_run_command_input_i,
  proxmox_lxc_run_command_result_t,
  proxmox_lxc_get_system_info_input_i,
  proxmox_lxc_system_info_result_t,
  proxmox_lxc_system_info_source_t,
  proxmox_lxc_get_cron_jobs_input_i,
  proxmox_lxc_cron_jobs_result_t,
  proxmox_lxc_cron_job_t,
  proxmox_lxc_cron_parse_warning_t,
  proxmox_lxc_cron_scan_error_t,
  proxmox_lxc_cron_source_kind_t,
  proxmox_lxc_cron_special_schedule_t,
  proxmox_lxc_get_process_list_input_i,
  proxmox_lxc_process_environment_mode_t,
  proxmox_lxc_process_list_result_t,
  proxmox_lxc_process_parse_warning_t,
  proxmox_lxc_process_record_t,
  proxmox_lxc_process_scan_error_t,
  proxmox_lxc_process_source_kind_t,
  proxmox_lxc_process_state_t,
  proxmox_lxc_get_open_tcp_ports_input_i,
  proxmox_lxc_open_tcp_ports_result_t,
  proxmox_lxc_tcp_listener_t,
  proxmox_lxc_tcp_listener_scan_error_t,
  proxmox_lxc_tcp_listener_parse_warning_t,
  proxmox_lxc_tcp_listener_source_kind_t,
  proxmox_lxc_address_family_t,
  proxmox_lxc_get_open_udp_ports_input_i,
  proxmox_lxc_open_udp_ports_result_t,
  proxmox_lxc_udp_listener_t,
  proxmox_lxc_udp_listener_scan_error_t,
  proxmox_lxc_udp_listener_parse_warning_t,
  proxmox_lxc_udp_listener_source_kind_t,
  proxmox_lxc_get_services_and_daemons_input_i,
  proxmox_lxc_services_and_daemons_result_t,
  proxmox_lxc_service_record_t,
  proxmox_lxc_service_scan_error_t,
  proxmox_lxc_service_parse_warning_t,
  proxmox_lxc_service_probe_source_kind_t,
  proxmox_lxc_service_manager_t,
  proxmox_lxc_service_detail_level_t,
  proxmox_lxc_service_process_enrichment_mode_t,
  proxmox_lxc_get_hardware_inventory_input_i,
  proxmox_lxc_hardware_inventory_result_t,
  proxmox_lxc_hardware_device_t,
  proxmox_lxc_hardware_scan_error_t,
  proxmox_lxc_hardware_parse_warning_t,
  proxmox_lxc_hardware_source_kind_t,
  proxmox_lxc_get_disk_and_block_devices_input_i,
  proxmox_lxc_filesystem_scope_t,
  proxmox_lxc_disk_and_block_devices_result_t,
  proxmox_lxc_block_device_t,
  proxmox_lxc_block_partition_t,
  proxmox_lxc_filesystem_t,
  proxmox_lxc_mount_t,
  proxmox_lxc_disk_scan_error_t,
  proxmox_lxc_disk_parse_warning_t,
  proxmox_lxc_disk_source_kind_t,
  proxmox_lxc_get_memory_info_input_i,
  proxmox_lxc_get_cpu_info_input_i,
  proxmox_lxc_get_users_and_groups_input_i,
  proxmox_lxc_get_firewall_info_input_i,
  proxmox_lxc_memory_info_result_t,
  proxmox_lxc_memory_process_t,
  proxmox_lxc_memory_scan_error_t,
  proxmox_lxc_memory_parse_warning_t,
  proxmox_lxc_cpu_info_result_t,
  proxmox_lxc_cpu_core_t,
  proxmox_lxc_cpu_scan_error_t,
  proxmox_lxc_cpu_parse_warning_t,
  proxmox_lxc_cpu_top_process_t,
  proxmox_lxc_users_and_groups_result_t,
  proxmox_lxc_identity_user_t,
  proxmox_lxc_identity_group_t,
  proxmox_lxc_identity_scan_error_t,
  proxmox_lxc_identity_parse_warning_t,
  proxmox_lxc_identity_source_kind_t,
  proxmox_lxc_identity_privilege_detail_mode_t,
  proxmox_lxc_firewall_info_result_t,
  proxmox_lxc_firewall_rule_t,
  proxmox_lxc_firewall_scan_error_t,
  proxmox_lxc_firewall_parse_warning_t,
  proxmox_lxc_firewall_source_kind_t,
  proxmox_lxc_firewall_backend_t,
  proxmox_lxc_firewall_family_t,
  proxmox_lxc_firewall_action_t,
  proxmox_lxc_firewall_finding_t,
  proxmox_lxc_get_development_tooling_info_input_i,
  proxmox_lxc_development_tooling_info_result_t,
  proxmox_lxc_devtool_toolchain_t,
  proxmox_lxc_devtool_distro_package_t,
  proxmox_lxc_devtool_scan_error_t,
  proxmox_lxc_devtool_parse_warning_t,
  proxmox_lxc_devtool_summary_t,
  proxmox_lxc_devtool_ecosystem_kind_t,
  proxmox_lxc_devtool_source_kind_t,
  proxmox_lxc_devtool_distro_package_manager_t,
  proxmox_lxc_devtool_distro_package_confidence_t,
  proxmox_lxc_devtool_package_manager_record_i,
  proxmox_lxc_generate_system_report_html_input_i,
  proxmox_lxc_generate_system_report_file_input_i,
  proxmox_lxc_system_report_section_id_t,
  proxmox_lxc_system_report_section_selection_i,
  proxmox_lxc_system_report_collection_options_i,
  proxmox_lxc_system_report_render_options_i,
  proxmox_lxc_system_report_metadata_t,
  proxmox_lxc_system_report_section_metadata_t,
  proxmox_lxc_system_report_html_result_t,
  proxmox_lxc_system_report_file_result_t,
  proxmox_lxc_system_report_section_status_t,
  proxmox_lxc_upload_file_input_i,
  proxmox_lxc_upload_file_result_t,
  proxmox_lxc_upload_directory_input_i,
  proxmox_lxc_upload_directory_pattern_mode_t,
  proxmox_lxc_upload_directory_result_t,
  proxmox_lxc_upload_directory_symlink_policy_t,
  proxmox_lxc_terminal_open_input_i,
  proxmox_lxc_terminal_session_t,
  proxmox_lxc_terminal_event_t,
  proxmox_lxc_terminal_send_input_i,
  proxmox_lxc_terminal_resize_input_i,
  proxmox_lxc_terminal_read_events_input_i,
  proxmox_lxc_terminal_close_input_i,
  proxmox_lxc_terminal_session_query_i,
} from "../types/proxmox_service_types";

export interface lxc_service_input_i {
  request_client: proxmox_request_client_i;
  task_poller?: TaskPoller;
  task_polling_enabled?: boolean;
  task_poll_options?: proxmox_task_polling_options_t;
  ssh_shell_backend?: proxmox_lxc_shell_backend_i;
}

/**
 * Example:
 * const created = await client.lxc_service.createContainer({
 *   node_id: "pve1",
 *   config: {
 *     ostemplate: "local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst",
 *     storage: "local-lvm",
 *   },
 * });
 *
 * const started = await client.lxc_service.startContainer({
 *   node_id: "pve1",
 *   container_id: created.resource_id,
 *   wait_for_task: true,
 * });
 */
export class LxcService {
  public readonly request_client: proxmox_request_client_i;
  public readonly task_poller?: TaskPoller;
  public readonly task_polling_enabled: boolean;
  public readonly task_poll_options?: proxmox_task_polling_options_t;
  public readonly ssh_pct_shell_backend: proxmox_lxc_shell_backend_i;
  private readonly command_results: Map<string, proxmox_lxc_run_command_result_t>;

  constructor(params: lxc_service_input_i) {
    this.request_client = params.request_client;
    this.task_poller = params.task_poller;
    this.task_polling_enabled = params.task_polling_enabled === true;
    this.task_poll_options = params.task_poll_options;
    this.ssh_pct_shell_backend = params.ssh_shell_backend ?? new SshPctLxcShellBackend();
    this.command_results = new Map<string, proxmox_lxc_run_command_result_t>();
  }

  /**
   * Example:
   * const list = await client.lxc_service.listContainers({ node_id: "pve1" });
   */
  public async listContainers(params: proxmox_lxc_list_query_i = {}): Promise<proxmox_lxc_list_response_t> {
    const query = BuildLxcListQuery(params);
    return this.request_client.request<proxmox_lxc_list_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: query.path,
      node_id: query.node_id,
      query: query.request_query,
      retry_allowed: true,
    });
  }

  /**
   * Example:
   * const container = await client.lxc_service.getContainer({
   *   node_id: "pve1",
   *   container_id: "101",
   * });
   */
  public async getContainer(params: proxmox_lxc_reference_request_i): Promise<proxmox_lxc_get_response_t> {
    const normalized = BuildLxcReference(params);
    return this.request_client.request<proxmox_lxc_get_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(normalized.node_id)}/lxc/${encodeURIComponent(normalized.container_id)}/status/current`,
      node_id: normalized.node_id,
      retry_allowed: true,
    });
  }

  public async createContainer(params: proxmox_lxc_create_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async createContainer(params: proxmox_lxc_create_input_i): Promise<proxmox_lxc_task_started_t>;
  public async createContainer(params: proxmox_lxc_create_input_i): Promise<proxmox_lxc_task_result_t> {
    const node_id = ValidateNodeId(params.node_id);
    const container_id = params.container_id === undefined
      ? "unknown"
      : ValidateContainerId(params.container_id, "container_id");
    const body = BuildCreateUpdateBody(params.config, "create.config");

    if (params.container_id !== undefined) {
      body.vmid = container_id;
    }

    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/lxc`,
      node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id,
      container_id,
      operation: "create",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async updateContainer(params: proxmox_lxc_update_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async updateContainer(params: proxmox_lxc_update_input_i): Promise<proxmox_lxc_task_started_t>;
  public async updateContainer(params: proxmox_lxc_update_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const body = BuildCreateUpdateBody(params.config, "update.config");
    const response = await this.request_client.request<unknown>({
      method: "PUT" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/config`,
      node_id: reference.node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "update",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async deleteContainer(params: proxmox_lxc_delete_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async deleteContainer(params: proxmox_lxc_delete_input_i): Promise<proxmox_lxc_task_started_t>;
  public async deleteContainer(params: proxmox_lxc_delete_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const body = BuildDeleteBody({
      purge: params.purge,
      force: params.force,
    });
    const response = await this.request_client.request<unknown>({
      method: "DELETE" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}`,
      node_id: reference.node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "delete",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async startContainer(params: proxmox_lxc_start_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async startContainer(params: proxmox_lxc_start_input_i): Promise<proxmox_lxc_task_started_t>;
  public async startContainer(params: proxmox_lxc_start_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/status/start`,
      node_id: reference.node_id,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "start",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async stopContainer(params: proxmox_lxc_stop_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async stopContainer(params: proxmox_lxc_stop_input_i): Promise<proxmox_lxc_task_started_t>;
  public async stopContainer(params: proxmox_lxc_stop_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/status/stop`,
      node_id: reference.node_id,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
      body: params.force === true
        ? {
          timeout: params.timeout_ms,
        }
        : undefined,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "stop",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async migrateContainer(params: proxmox_lxc_migrate_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async migrateContainer(params: proxmox_lxc_migrate_input_i): Promise<proxmox_lxc_task_started_t>;
  public async migrateContainer(params: proxmox_lxc_migrate_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const target_node_id = ValidateNodeId(params.target_node_id);
    if (target_node_id.toLowerCase() === reference.node_id.toLowerCase()) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "target_node_id must be different from source node_id for migrate.",
        details: {
          field: "target_node_id",
        },
      });
    }

    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/migrate`,
      node_id: reference.node_id,
      body: {
        target: target_node_id,
        restart: params.restart === true ? 1 : 0,
        migrate_volumes: params.migrate_volumes === true ? 1 : 0,
      },
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "migrate",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async snapshotContainer(params: proxmox_lxc_snapshot_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async snapshotContainer(params: proxmox_lxc_snapshot_input_i): Promise<proxmox_lxc_task_started_t>;
  public async snapshotContainer(params: proxmox_lxc_snapshot_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const snapshot_name = ValidateSnapshotName(params.snapshot_name);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/snapshot`,
      node_id: reference.node_id,
      body: {
        snapname: snapshot_name,
        description: params.description,
        vmstate: params.include_memory === true ? 1 : 0,
        stop: params.stop === true ? 1 : 0,
      },
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "snapshot",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async restoreContainer(params: proxmox_lxc_restore_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async restoreContainer(params: proxmox_lxc_restore_input_i): Promise<proxmox_lxc_task_started_t>;
  public async restoreContainer(params: proxmox_lxc_restore_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const snapshot_name = ValidateSnapshotName(params.snapshot_name);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/snapshot/${encodeURIComponent(snapshot_name)}/rollback`,
      node_id: reference.node_id,
      body: {
        force: params.force === true ? 1 : 0,
      },
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "restore",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  /**
   * Example:
   * const command_result = await client.lxc_service.runCommand({
   *   node_id: "pve1",
   *   container_id: 101,
   *   command_argv: ["uname", "-a"],
   *   timeout_ms: 30000,
   * });
   */
  public async runCommand(params: proxmox_lxc_run_command_input_i): Promise<proxmox_lxc_run_command_result_t> {
    const reference = BuildLxcReference(params);
    const normalized_input = NormalizeRunCommandInput(params);
    const node_connection = this.request_client.resolveNode(reference.node_id);
    if (!ShouldUseSshShellBackend(node_connection)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "LXC runCommand requires node shell_backend=ssh_pct with ssh_shell configuration.",
        details: {
          field: "node.ssh_shell",
          value: node_connection.node_id,
        },
      });
    }
    const ssh_result = await this.ssh_pct_shell_backend.runCommand({
      node_connection,
      command_input: {
        ...normalized_input,
        node_id: reference.node_id,
        container_id: reference.container_id,
      },
    });
    this.command_results.set(ssh_result.session_id, ssh_result);
    return ssh_result;
  }

  /**
   * Example:
   * const system_info = await client.lxc_service.getSystemInfo({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getSystemInfo(
    params: proxmox_lxc_get_system_info_input_i,
  ): Promise<proxmox_lxc_system_info_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 256 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 8 * 1024 * 1024,
    });
    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getSystemInfo requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const os_release_primary_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      command_argv: ["cat", "/etc/os-release"],
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    let os_release_fields = ParseOsReleaseFields(os_release_primary_result.stdout);
    let os_release_source: proxmox_lxc_system_info_source_t | undefined = Object.keys(os_release_fields).length > 0
      ? "os_release"
      : undefined;

    if (!os_release_source) {
      const os_release_fallback_result = await this.runCommand({
        node_id: reference.node_id,
        container_id: reference.container_id,
        command_argv: ["cat", "/usr/lib/os-release"],
        timeout_ms,
        max_output_bytes,
        fail_on_non_zero_exit: false,
        retry_allowed: false,
      });
      os_release_fields = ParseOsReleaseFields(os_release_fallback_result.stdout);
      if (Object.keys(os_release_fields).length > 0) {
        os_release_source = "usr_lib_os_release";
      }
    }

    let lsb_release_fields: Record<string, string> | undefined;
    if (ShouldProbeLsbRelease(os_release_fields)) {
      const lsb_release_result = await this.runCommand({
        node_id: reference.node_id,
        container_id: reference.container_id,
        command_argv: ["lsb_release", "-a"],
        timeout_ms,
        max_output_bytes,
        fail_on_non_zero_exit: false,
        retry_allowed: false,
      });
      lsb_release_fields = ParseLsbReleaseFields(lsb_release_result.stdout);
    }

    const os_distribution_id = NormalizeDistributionId(os_release_fields.ID);
    const os_distribution_name = NormalizeOptionalText(os_release_fields.NAME);
    const os_distribution_version = NormalizeOptionalText(os_release_fields.VERSION_ID);
    const os_distribution_pretty_name = NormalizeOptionalText(os_release_fields.PRETTY_NAME);

    const lsb_distribution_id = NormalizeDistributionId(lsb_release_fields?.DISTRIBUTOR_ID);
    const lsb_distribution_name = NormalizeOptionalText(lsb_release_fields?.DISTRIBUTOR_ID);
    const lsb_distribution_version = NormalizeOptionalText(lsb_release_fields?.RELEASE);
    const lsb_distribution_pretty_name = NormalizeOptionalText(lsb_release_fields?.DESCRIPTION);

    const distribution_id = os_distribution_id ?? lsb_distribution_id;
    const distribution_name = os_distribution_name ?? lsb_distribution_name;
    const distribution_version = os_distribution_version ?? lsb_distribution_version;
    const distribution_pretty_name = os_distribution_pretty_name
      ?? lsb_distribution_pretty_name
      ?? BuildDerivedDistributionPrettyName({
        distribution_name,
        distribution_version,
      });

    if (
      !HasMeaningfulText(distribution_id)
      && !HasMeaningfulText(distribution_name)
      && !HasMeaningfulText(distribution_pretty_name)
    ) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to resolve Linux distribution information from the container.",
        details: {
          field: "lxc.system_info.distribution",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const kernel_release_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      command_argv: ["uname", "-r"],
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const kernel_version_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      command_argv: ["uname", "-v"],
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const kernel_release = NormalizeSingleLine(kernel_release_result.stdout);
    const kernel_version = NormalizeSingleLine(kernel_version_result.stdout);

    if (!HasMeaningfulText(kernel_release) && !HasMeaningfulText(kernel_version)) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to resolve kernel information from the container.",
        details: {
          field: "lxc.system_info.kernel",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      distribution_id,
      distribution_name,
      distribution_version,
      distribution_pretty_name,
      kernel_release,
      kernel_version,
      source_fields: {
        distribution_id: distribution_id === null
          ? "unknown"
          : (os_distribution_id !== null ? (os_release_source ?? "os_release") : "lsb_release"),
        distribution_name: distribution_name === null
          ? "unknown"
          : (os_distribution_name !== null ? (os_release_source ?? "os_release") : "lsb_release"),
        distribution_version: distribution_version === null
          ? "unknown"
          : (os_distribution_version !== null ? (os_release_source ?? "os_release") : "lsb_release"),
        distribution_pretty_name: distribution_pretty_name === null
          ? "unknown"
          : (os_distribution_pretty_name !== null
            ? (os_release_source ?? "os_release")
            : (lsb_distribution_pretty_name !== null ? "lsb_release" : "derived")),
        kernel_release: kernel_release === null ? "unknown" : "uname",
        kernel_version: kernel_version === null ? "unknown" : "uname",
      },
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const cron_jobs = await client.lxc_service.getCronJobs({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getCronJobs(
    params: proxmox_lxc_get_cron_jobs_input_i,
  ): Promise<proxmox_lxc_cron_jobs_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 8 * 1024 * 1024,
    });
    const include_system_cron = params.include_system_cron !== false;
    const include_user_cron = params.include_user_cron !== false;
    if (!include_system_cron && !include_user_cron) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "At least one cron source group must be enabled.",
        details: {
          field: "include_system_cron/include_user_cron",
        },
      });
    }

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getCronJobs requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const jobs: proxmox_lxc_cron_job_t[] = [];
    const sources_scanned: string[] = [];
    const scan_errors: proxmox_lxc_cron_scan_error_t[] = [];
    const parse_warnings: proxmox_lxc_cron_parse_warning_t[] = [];

    if (include_system_cron) {
      const system_probe_result = await this.runCommand({
        node_id: reference.node_id,
        container_id: reference.container_id,
        shell_mode: true,
        shell_command: BuildSystemCronProbeShellCommand(),
        timeout_ms,
        max_output_bytes,
        fail_on_non_zero_exit: false,
        retry_allowed: false,
      });
      const system_probe_sections = ParseCronProbeSections({
        probe_output: system_probe_result.stdout,
      });
      if (system_probe_result.truncated_output) {
        scan_errors.push({
          source_path: "__system_probe__",
          source_kind: "system",
          reason: "System cron probe output was truncated.",
        });
      }
      scan_errors.push(...system_probe_sections.scan_errors);
      for (const section of system_probe_sections.sections) {
        sources_scanned.push(section.source_path);
        const parsed_result = ParseCronSourceContent({
          source_path: section.source_path,
          source_kind: ResolveCronSourceKind(section.source_path),
          content: section.content,
        });
        jobs.push(...parsed_result.jobs);
        parse_warnings.push(...parsed_result.parse_warnings);
      }
    }

    if (include_user_cron) {
      const user_probe_result = await this.runCommand({
        node_id: reference.node_id,
        container_id: reference.container_id,
        shell_mode: true,
        shell_command: BuildUserCronProbeShellCommand(),
        timeout_ms,
        max_output_bytes,
        fail_on_non_zero_exit: false,
        retry_allowed: false,
      });
      const user_probe_sections = ParseCronProbeSections({
        probe_output: user_probe_result.stdout,
      });
      if (user_probe_result.truncated_output) {
        scan_errors.push({
          source_path: "__user_probe__",
          source_kind: "user_spool",
          reason: "User cron probe output was truncated.",
        });
      }
      scan_errors.push(...user_probe_sections.scan_errors);
      for (const section of user_probe_sections.sections) {
        sources_scanned.push(section.source_path);
        const parsed_result = ParseCronSourceContent({
          source_path: section.source_path,
          source_kind: ResolveCronSourceKind(section.source_path),
          content: section.content,
        });
        jobs.push(...parsed_result.jobs);
        parse_warnings.push(...parsed_result.parse_warnings);
      }
    }

    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      jobs,
      sources_scanned: [...new Set(sources_scanned)],
      scan_errors,
      parse_warnings,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const process_result = await client.lxc_service.getProcessList({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getProcessList(
    params: proxmox_lxc_get_process_list_input_i,
  ): Promise<proxmox_lxc_process_list_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_environment = params.include_environment === true;
    const include_threads = params.include_threads === true;
    const environment_mode = ResolveEnvironmentMode(params.environment_mode, include_environment);
    const process_limit = ValidatePositiveInteger({
      raw_value: params.process_limit ?? 200,
      field_name: "process_limit",
      minimum: 1,
      maximum: 4096,
    });
    const max_environment_bytes_per_process = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_per_process ?? 4096,
      field_name: "max_environment_bytes_per_process",
      minimum: 128,
      maximum: 256 * 1024,
    });
    const max_environment_bytes_total = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_total ?? 256 * 1024,
      field_name: "max_environment_bytes_total",
      minimum: 1024,
      maximum: 4 * 1024 * 1024,
    });
    const pid_filter = NormalizeProcessPidFilter(params.pid_filter);
    const user_filter = NormalizeUserFilter(params.user_filter);

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getProcessList requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const process_scan_errors: proxmox_lxc_process_scan_error_t[] = [];
    const process_parse_warnings: proxmox_lxc_process_parse_warning_t[] = [];
    let truncated = false;
    let process_records = await this.collectPsProcessRecords({
      node_id: reference.node_id,
      container_id: reference.container_id,
      timeout_ms,
      max_output_bytes,
      user_filter,
      pid_filter,
      process_parse_warnings,
      process_scan_errors,
    });
    let primary_source: proxmox_lxc_process_source_kind_t = "ps";
    let fallback_used = false;

    if (process_records.length === 0) {
      fallback_used = true;
      primary_source = "procfs";
      process_records = await this.collectProcFallbackProcessRecords({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        user_filter,
        pid_filter,
        process_parse_warnings,
        process_scan_errors,
      });
    }

    if (process_records.length > process_limit) {
      truncated = true;
      process_scan_errors.push({
        source_kind: primary_source,
        reason: "process_limit_applied",
      });
      process_records = process_records.slice(0, process_limit);
    }

    const proc_details_result = await this.collectProcDetails({
      node_id: reference.node_id,
      container_id: reference.container_id,
      timeout_ms,
      max_output_bytes,
      process_records,
      include_environment,
      include_threads,
      environment_mode,
      max_environment_bytes_per_process,
      max_environment_bytes_total,
    });
    process_records = proc_details_result.processes;
    process_scan_errors.push(...proc_details_result.scan_errors);
    process_parse_warnings.push(...proc_details_result.parse_warnings);
    if (proc_details_result.truncated) {
      truncated = true;
    }

    const summary = BuildProcessSummary(process_records);
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      processes: process_records,
      summary,
      probe_metadata: {
        primary_source,
        fallback_used,
        commands: proc_details_result.commands,
      },
      scan_errors: process_scan_errors,
      parse_warnings: process_parse_warnings,
      limits_applied: {
        process_limit,
        environment_mode,
        max_environment_bytes_per_process,
        max_environment_bytes_total,
        include_threads,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const services_result = await client.lxc_service.getServicesAndDaemons({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getServicesAndDaemons(
    params: proxmox_lxc_get_services_and_daemons_input_i,
  ): Promise<proxmox_lxc_services_and_daemons_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_inactive = params.include_inactive !== false;
    const include_failed = params.include_failed !== false;
    const include_disabled = params.include_disabled !== false;
    const include_process_details = params.include_process_details !== false;
    const process_enrichment_mode = ResolveServiceProcessEnrichmentMode({
      raw_process_enrichment_mode: params.process_enrichment_mode,
      include_process_details,
    });
    const include_environment = params.include_environment === true;
    const environment_mode = ResolveEnvironmentMode(params.environment_mode, include_environment);
    const detail_level = ResolveServiceDetailLevel(params.detail_level);
    const service_limit = ValidatePositiveInteger({
      raw_value: params.service_limit ?? 512,
      field_name: "service_limit",
      minimum: 1,
      maximum: 8192,
    });
    const max_environment_bytes_per_process = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_per_process ?? 4096,
      field_name: "max_environment_bytes_per_process",
      minimum: 128,
      maximum: 256 * 1024,
    });
    const max_environment_bytes_total = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_total ?? 256 * 1024,
      field_name: "max_environment_bytes_total",
      minimum: 1024,
      maximum: 4 * 1024 * 1024,
    });
    const name_filter = NormalizeServiceNameFilter(params.name_filter);

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getServicesAndDaemons requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const scan_errors: proxmox_lxc_service_scan_error_t[] = [];
    const parse_warnings: proxmox_lxc_service_parse_warning_t[] = [];
    const commands: string[] = [];
    let services: proxmox_lxc_service_record_t[] = [];
    let service_manager: proxmox_lxc_service_manager_t = "unknown";
    let primary_source: proxmox_lxc_service_probe_source_kind_t = "fallback_static";
    let fallback_used = false;
    let truncated = false;

    const systemd_result = await this.collectServicesFromSystemd({
      node_id: reference.node_id,
      container_id: reference.container_id,
      timeout_ms,
      max_output_bytes,
      detail_level,
      service_limit,
    });
    commands.push(...systemd_result.commands);
    scan_errors.push(...systemd_result.scan_errors);
    parse_warnings.push(...systemd_result.parse_warnings);
    if (systemd_result.truncated) {
      truncated = true;
    }
    if (systemd_result.manager_detected) {
      service_manager = "systemd";
      primary_source = "systemd_units";
      services = systemd_result.services;
    }

    if (services.length === 0) {
      fallback_used = true;
      const openrc_result = await this.collectServicesFromOpenrc({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        service_limit,
      });
      commands.push(...openrc_result.commands);
      scan_errors.push(...openrc_result.scan_errors);
      parse_warnings.push(...openrc_result.parse_warnings);
      if (openrc_result.truncated) {
        truncated = true;
      }
      if (openrc_result.manager_detected) {
        service_manager = "openrc";
        primary_source = "openrc_status";
      }
      if (openrc_result.services.length > 0) {
        services = openrc_result.services;
      }
    }

    if (services.length === 0) {
      fallback_used = true;
      const sysv_result = await this.collectServicesFromSysv({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        service_limit,
      });
      commands.push(...sysv_result.commands);
      scan_errors.push(...sysv_result.scan_errors);
      parse_warnings.push(...sysv_result.parse_warnings);
      if (sysv_result.truncated) {
        truncated = true;
      }
      if (sysv_result.manager_detected) {
        if (service_manager === "unknown") {
          service_manager = "sysvinit";
        }
        primary_source = "sysv_service_status";
      }
      if (sysv_result.services.length > 0) {
        services = sysv_result.services;
      }
    }

    if (services.length === 0) {
      fallback_used = true;
      const static_result = await this.collectServicesFromStaticFallback({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        service_limit,
      });
      commands.push(...static_result.commands);
      scan_errors.push(...static_result.scan_errors);
      parse_warnings.push(...static_result.parse_warnings);
      if (static_result.truncated) {
        truncated = true;
      }
      services = static_result.services;
      primary_source = "fallback_static";
    }

    if (services.length === 0) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect service and daemon metadata from container.",
        details: {
          field: "lxc.services",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    services = ApplyServiceFilters({
      services,
      include_inactive,
      include_failed,
      include_disabled,
      name_filter,
    });

    if (services.length > service_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: primary_source,
        reason: "service_limit_applied",
      });
      services = services.slice(0, service_limit);
    }

    if (process_enrichment_mode !== "none") {
      const pid_filter = Array.from(
        new Set(
          services
            .flatMap((service_record) => {
              const pid_values: number[] = [];
              if (typeof service_record.main_pid === "number" && service_record.main_pid > 0) {
                pid_values.push(service_record.main_pid);
              }
              if (process_enrichment_mode === "full" && service_record.pids) {
                for (const pid_value of service_record.pids) {
                  if (typeof pid_value === "number" && pid_value > 0) {
                    pid_values.push(pid_value);
                  }
                }
              }
              return pid_values;
            }),
        ),
      );
      if (pid_filter.length > 0) {
        try {
          const process_result = await this.getProcessList({
            node_id: reference.node_id,
            container_id: reference.container_id,
            timeout_ms,
            max_output_bytes,
            include_environment,
            environment_mode,
            process_limit: pid_filter.length,
            pid_filter,
            max_environment_bytes_per_process,
            max_environment_bytes_total,
          });
          const process_lookup = new Map<number, proxmox_lxc_process_record_t>(
            process_result.processes.map((process_record) => [process_record.pid, process_record]),
          );
          services = services.map((service_record) => {
            const main_process = service_record.main_pid !== undefined
              ? process_lookup.get(service_record.main_pid)
              : undefined;
            if (main_process) {
              return {
                ...service_record,
                process: main_process,
              };
            }
            if (process_enrichment_mode !== "full") {
              return service_record;
            }
            const candidate_process = service_record.pids?.find((pid_value) => process_lookup.has(pid_value));
            if (candidate_process === undefined) {
              return service_record;
            }
            return {
              ...service_record,
              process: process_lookup.get(candidate_process),
            };
          });
        } catch (error) {
          scan_errors.push({
            source_kind: primary_source,
            reason: `service_process_enrichment_failed:${process_enrichment_mode}:${error instanceof Error ? error.message : "unknown"}`,
          });
        }
      }
    }

    const summary = BuildServiceSummary(services);
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      service_manager,
      services,
      summary,
      probe_metadata: {
        service_manager,
        primary_source,
        fallback_used,
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        service_limit,
        include_inactive,
        include_failed,
        include_disabled,
        include_process_details,
        process_enrichment_mode,
        environment_mode,
        detail_level,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const hardware_result = await client.lxc_service.getHardwareInventory({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getHardwareInventory(
    params: proxmox_lxc_get_hardware_inventory_input_i,
  ): Promise<proxmox_lxc_hardware_inventory_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_network = params.include_network !== false;
    const include_storage = params.include_storage !== false;
    const include_pci = params.include_pci !== false;
    const include_usb = params.include_usb !== false;
    const include_graphics = params.include_graphics !== false;
    const include_virtual_devices = params.include_virtual_devices !== false;
    const device_limit = ValidatePositiveInteger({
      raw_value: params.device_limit ?? 512,
      field_name: "device_limit",
      minimum: 1,
      maximum: 8192,
    });

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getHardwareInventory requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const commands = ["hardware_probe"];
    const probe_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      shell_mode: true,
      shell_command: BuildHardwareInventoryProbeShellCommand({
        include_network,
        include_storage,
        include_pci,
        include_usb,
        include_graphics,
      }),
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });

    const parse_result = ParseHardwareProbeOutput(probe_result.stdout);
    const scan_errors: proxmox_lxc_hardware_scan_error_t[] = [...parse_result.scan_errors];
    const parse_warnings: proxmox_lxc_hardware_parse_warning_t[] = [...parse_result.parse_warnings];
    let truncated = probe_result.truncated_output;
    if (probe_result.truncated_output) {
      scan_errors.push({
        source_kind: "probe",
        reason: "hardware_partial_data:probe_output_truncated",
      });
    }

    let devices = parse_result.devices
      .filter((device_record) => include_virtual_devices || device_record.is_virtual_device !== true)
      .filter((device_record) => include_graphics || device_record.is_graphics !== true)
      .sort((left_device, right_device) => {
        const left_key = `${left_device.class}|${left_device.name ?? ""}|${left_device.device_id}`;
        const right_key = `${right_device.class}|${right_device.name ?? ""}|${right_device.device_id}`;
        return left_key.localeCompare(right_key);
      });

    if (devices.length > device_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "hardware_partial_data:device_limit_applied",
      });
      devices = devices.slice(0, device_limit);
    }

    if (devices.length === 0) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect hardware inventory from container.",
        details: {
          field: "lxc.hardware_inventory",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const summary = BuildHardwareSummary(devices);
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      devices,
      summary,
      probe_metadata: {
        primary_source: "probe",
        fallback_used: scan_errors.some((scan_error) => scan_error.reason.includes("unavailable")),
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        device_limit,
        include_network,
        include_storage,
        include_pci,
        include_usb,
        include_graphics,
        include_virtual_devices,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const disk_result = await client.lxc_service.getDiskAndBlockDevices({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getDiskAndBlockDevices(
    params: proxmox_lxc_get_disk_and_block_devices_input_i,
  ): Promise<proxmox_lxc_disk_and_block_devices_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 32 * 1024 * 1024,
    });
    const include_partitions = params.include_partitions !== false;
    const include_filesystems = params.include_filesystems !== false;
    const include_mounts = params.include_mounts !== false;
    const include_usage = params.include_usage !== false;
    const include_loop_devices = params.include_loop_devices === true;
    const include_virtual_devices = params.include_virtual_devices !== false;
    const filesystem_scope = ResolveFilesystemScope(params.filesystem_scope);
    const device_limit = ValidatePositiveInteger({
      raw_value: params.device_limit ?? 512,
      field_name: "device_limit",
      minimum: 1,
      maximum: 8192,
    });
    const filesystem_limit = ValidatePositiveInteger({
      raw_value: params.filesystem_limit ?? 1024,
      field_name: "filesystem_limit",
      minimum: 1,
      maximum: 16384,
    });

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getDiskAndBlockDevices requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const commands = ["disk_probe"];
    const probe_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      shell_mode: true,
      shell_command: BuildDiskInventoryProbeShellCommand({
        include_usage,
      }),
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parse_result = ParseDiskProbeOutput({
      probe_output: probe_result.stdout,
    });
    const scan_errors: proxmox_lxc_disk_scan_error_t[] = [...parse_result.scan_errors];
    const parse_warnings: proxmox_lxc_disk_parse_warning_t[] = [...parse_result.parse_warnings];
    let truncated = probe_result.truncated_output;
    if (probe_result.truncated_output) {
      scan_errors.push({
        source_kind: "probe",
        reason: "disk_partial_data:probe_output_truncated",
      });
    }

    let block_devices = parse_result.block_devices
      .filter((device_record) => include_virtual_devices || device_record.is_virtual_device !== true)
      .filter((device_record) => include_loop_devices || device_record.device_type !== "loop")
      .sort((left_device, right_device) => left_device.path.localeCompare(right_device.path));
    let partitions = include_partitions
      ? parse_result.partitions
        .sort((left_partition, right_partition) => left_partition.path.localeCompare(right_partition.path))
      : [];
    let filesystems = include_filesystems
      ? parse_result.filesystems
        .sort((left_filesystem, right_filesystem) => left_filesystem.mountpoint.localeCompare(right_filesystem.mountpoint))
      : [];
    let mounts = include_mounts
      ? parse_result.mounts
        .sort((left_mount, right_mount) => left_mount.target.localeCompare(right_mount.target))
      : [];
    const scoped_filesystem_records = FilterFilesystemRecordsByScope({
      filesystems,
      mounts,
      filesystem_scope,
    });
    filesystems = scoped_filesystem_records.filesystems;
    mounts = scoped_filesystem_records.mounts;

    if (block_devices.length > device_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "disk_partial_data:device_limit_applied",
      });
      block_devices = block_devices.slice(0, device_limit);
    }
    if (partitions.length > filesystem_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "disk_partial_data:filesystem_limit_applied",
      });
      partitions = partitions.slice(0, filesystem_limit);
    }
    if (filesystems.length > filesystem_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "disk_partial_data:filesystem_limit_applied",
      });
      filesystems = filesystems.slice(0, filesystem_limit);
    }
    if (mounts.length > filesystem_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "disk_partial_data:filesystem_limit_applied",
      });
      mounts = mounts.slice(0, filesystem_limit);
    }

    if (block_devices.length === 0 && partitions.length === 0 && filesystems.length === 0 && mounts.length === 0) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect disk and block device inventory from container.",
        details: {
          field: "lxc.disk_inventory",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const summary = BuildDiskSummary({
      block_devices,
      partitions,
      filesystems,
      mounts,
    });

    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      block_devices,
      partitions,
      filesystems,
      mounts,
      summary,
      probe_metadata: {
        primary_source: parse_result.primary_source,
        fallback_used: parse_result.primary_source !== "lsblk",
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        device_limit,
        filesystem_limit,
        include_partitions,
        include_filesystems,
        include_mounts,
        include_usage,
        include_loop_devices,
        include_virtual_devices,
        filesystem_scope,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const memory_result = await client.lxc_service.getMemoryInfo({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getMemoryInfo(
    params: proxmox_lxc_get_memory_info_input_i,
  ): Promise<proxmox_lxc_memory_info_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_process_breakdown = params.include_process_breakdown !== false;
    const include_process_rss_components = params.include_process_rss_components !== false;
    const include_kernel_breakdown = params.include_kernel_breakdown !== false;
    const include_cgroup_limits = params.include_cgroup_limits !== false;
    const include_zero_swap_entries = params.include_zero_swap_entries === true;
    const process_limit = ValidatePositiveInteger({
      raw_value: params.process_limit ?? 200,
      field_name: "process_limit",
      minimum: 1,
      maximum: 4096,
    });
    const process_rss_component_probe_limit = ValidatePositiveInteger({
      raw_value: params.process_rss_component_probe_limit ?? 64,
      field_name: "process_rss_component_probe_limit",
      minimum: 1,
      maximum: 4096,
    });
    const min_process_rss_kb = params.min_process_rss_kb === undefined
      ? undefined
      : ValidatePositiveInteger({
        raw_value: params.min_process_rss_kb,
        field_name: "min_process_rss_kb",
        minimum: 1,
        maximum: 1024 * 1024 * 1024,
      });

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getMemoryInfo requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const commands = ["memory_probe"];
    const probe_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      shell_mode: true,
      shell_command: BuildMemoryProbeShellCommand({
        include_cgroup_limits,
      }),
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parse_result = ParseMemoryProbeOutput({
      probe_output: probe_result.stdout,
    });
    const scan_errors: proxmox_lxc_memory_scan_error_t[] = [...parse_result.scan_errors];
    const parse_warnings: proxmox_lxc_memory_parse_warning_t[] = [...parse_result.parse_warnings];
    let truncated = probe_result.truncated_output;
    if (probe_result.truncated_output) {
      scan_errors.push({
        source_kind: "probe",
        reason: "memory_partial_data:probe_output_truncated",
      });
    }

    const memory = {
      ...parse_result.memory,
    };
    const swap_devices = include_zero_swap_entries
      ? parse_result.swap.devices
      : parse_result.swap.devices.filter((device_record) => (device_record.size_kb ?? 0) > 0);
    const swap = {
      ...parse_result.swap,
      devices: swap_devices,
    };
    const kernel = include_kernel_breakdown
      ? parse_result.kernel
      : {};

    let processes: proxmox_lxc_memory_process_t[] = [];
    if (include_process_breakdown) {
      try {
        const process_result = await this.getProcessList({
          node_id: reference.node_id,
          container_id: reference.container_id,
          timeout_ms,
          max_output_bytes,
          include_environment: false,
          process_limit,
        });
        processes = process_result.processes
          .map((process_record) => ({
            pid: process_record.pid,
            ppid: process_record.ppid,
            comm: process_record.comm,
            cmdline: process_record.cmdline,
            username: process_record.username,
            uid: process_record.uid,
            state: process_record.state,
            rss_kb: process_record.rss_kb,
            vsz_kb: process_record.vsz_kb,
            memory_percent: process_record.memory_percent,
          }))
          .filter((process_record) => min_process_rss_kb === undefined
            || (process_record.rss_kb !== undefined && process_record.rss_kb >= min_process_rss_kb))
          .sort((left_process, right_process) => {
            const left_rss = left_process.rss_kb ?? -1;
            const right_rss = right_process.rss_kb ?? -1;
            if (left_rss !== right_rss) {
              return right_rss - left_rss;
            }
            return left_process.pid - right_process.pid;
          });
        if (include_process_rss_components && processes.length > 0) {
          const rss_probe_pid_list = processes
            .slice(0, process_rss_component_probe_limit)
            .map((process_record) => process_record.pid);
          if (rss_probe_pid_list.length > 0) {
            commands.push("memory_process_rss_probe");
            const rss_probe_result = await this.runCommand({
              node_id: reference.node_id,
              container_id: reference.container_id,
              shell_mode: true,
              shell_command: BuildMemoryProcessRssProbeShellCommand({
                pid_list: rss_probe_pid_list,
              }),
              timeout_ms,
              max_output_bytes: Math.min(max_output_bytes, 1024 * 1024),
              fail_on_non_zero_exit: false,
              retry_allowed: false,
            });
            const rss_parse_result = ParseMemoryProcessRssProbeOutput({
              probe_output: rss_probe_result.stdout,
            });
            scan_errors.push(...rss_parse_result.scan_errors);
            parse_warnings.push(...rss_parse_result.parse_warnings);
            if (rss_probe_result.truncated_output) {
              truncated = true;
              scan_errors.push({
                source_kind: "process_rss",
                reason: "memory_partial_data:process_rss_probe_output_truncated",
              });
            }
            const rss_component_map = rss_parse_result.rss_components_by_pid;
            if (rss_component_map.size > 0) {
              processes = processes.map((process_record) => {
                const rss_components = rss_component_map.get(process_record.pid);
                if (!rss_components) {
                  return process_record;
                }
                return {
                  ...process_record,
                  rss_kb: process_record.rss_kb ?? rss_components.vm_rss_kb,
                  rss_anon_kb: rss_components.rss_anon_kb,
                  rss_file_kb: rss_components.rss_file_kb,
                  rss_shmem_kb: rss_components.rss_shmem_kb,
                };
              });
            }
          }
        }
      } catch (error) {
        scan_errors.push({
          source_kind: "process",
          reason: `memory_partial_data:process_probe_failed:${error instanceof Error ? error.message : "unknown"}`,
        });
      }
    }

    if (!memory.mem_total_kb && !memory.mem_available_kb && !swap.swap_total_kb) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect memory telemetry from container.",
        details: {
          field: "lxc.memory_info",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const summary = BuildMemorySummary({
      memory,
      swap,
      kernel,
      processes,
      psi_some_avg10: parse_result.psi_some_avg10,
      psi_full_avg10: parse_result.psi_full_avg10,
      cgroup_limit_kb: parse_result.cgroup_limit_kb,
      cgroup_current_kb: parse_result.cgroup_current_kb,
      cgroup_swap_limit_kb: parse_result.cgroup_swap_limit_kb,
      cgroup_swap_current_kb: parse_result.cgroup_swap_current_kb,
    });
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      memory,
      swap,
      kernel,
      processes,
      summary,
      probe_metadata: {
        primary_source: parse_result.primary_source,
        fallback_used: parse_result.fallback_used,
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        include_process_breakdown,
        include_process_rss_components,
        include_kernel_breakdown,
        include_cgroup_limits,
        include_zero_swap_entries,
        process_limit,
        process_rss_component_probe_limit,
        min_process_rss_kb,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const cpu_result = await client.lxc_service.getCpuInfo({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getCpuInfo(
    params: proxmox_lxc_get_cpu_info_input_i,
  ): Promise<proxmox_lxc_cpu_info_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_per_core = params.include_per_core !== false;
    const include_flags = params.include_flags === true;
    const include_top_snapshot = params.include_top_snapshot !== false;
    const include_cgroup_limits = params.include_cgroup_limits !== false;
    const include_cpu_pressure = params.include_cpu_pressure !== false;
    const include_offline_cores = params.include_offline_cores === true;
    const core_limit = ValidatePositiveInteger({
      raw_value: params.core_limit ?? 512,
      field_name: "core_limit",
      minimum: 1,
      maximum: 4096,
    });

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getCpuInfo requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const commands = ["cpu_probe"];
    const probe_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      shell_mode: true,
      shell_command: BuildCpuProbeShellCommand({
        include_cgroup_limits,
        include_cpu_pressure,
      }),
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parse_result = ParseCpuProbeOutput({
      probe_output: probe_result.stdout,
    });
    const scan_errors: proxmox_lxc_cpu_scan_error_t[] = [...parse_result.scan_errors];
    const parse_warnings: proxmox_lxc_cpu_parse_warning_t[] = [...parse_result.parse_warnings];
    let truncated = probe_result.truncated_output;
    if (probe_result.truncated_output) {
      scan_errors.push({
        source_kind: "probe",
        reason: "cpu_partial_data:probe_output_truncated",
      });
    }

    const cpu = {
      ...parse_result.cpu,
      flags: include_flags ? parse_result.cpu.flags : undefined,
    };

    let cores: proxmox_lxc_cpu_core_t[] = include_per_core
      ? [...parse_result.cores]
      : [];
    if (include_per_core && !include_offline_cores) {
      cores = cores.filter((core_record) => core_record.online !== false);
    }
    if (include_per_core && cores.length > core_limit) {
      cores = cores.slice(0, core_limit);
      truncated = true;
      scan_errors.push({
        source_kind: "core",
        reason: "cpu_partial_data:core_limit_applied",
      });
    }

    let top_snapshot: proxmox_lxc_cpu_top_process_t[] = [];
    if (include_top_snapshot) {
      commands.push("cpu_top_snapshot");
      const top_result = await this.runCommand({
        node_id: reference.node_id,
        container_id: reference.container_id,
        shell_mode: true,
        shell_command: BuildCpuTopSnapshotShellCommand(),
        timeout_ms,
        max_output_bytes: Math.min(max_output_bytes, 512 * 1024),
        fail_on_non_zero_exit: false,
        retry_allowed: false,
      });
      const top_parse_result = ParseCpuTopSnapshotOutput({
        probe_output: top_result.stdout,
      });
      top_snapshot = top_parse_result.top_snapshot;
      scan_errors.push(...top_parse_result.scan_errors);
      parse_warnings.push(...top_parse_result.parse_warnings);
      if (top_result.truncated_output) {
        truncated = true;
        scan_errors.push({
          source_kind: "top_snapshot",
          reason: "cpu_partial_data:top_snapshot_output_truncated",
        });
      }
    }

    if (!cpu.logical_cpu_count && !cpu.model_name && cores.length === 0) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect CPU telemetry from container.",
        details: {
          field: "lxc.cpu_info",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const summary = BuildCpuSummary({
      cpu,
      cores,
      top_snapshot,
      loadavg_1m: parse_result.loadavg_1m,
      loadavg_5m: parse_result.loadavg_5m,
      loadavg_15m: parse_result.loadavg_15m,
      psi_some_avg10: parse_result.psi_some_avg10,
      psi_full_avg10: parse_result.psi_full_avg10,
    });
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      cpu,
      cores,
      top_snapshot,
      summary,
      probe_metadata: {
        primary_source: parse_result.primary_source,
        fallback_used: parse_result.fallback_used,
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        include_per_core,
        include_flags,
        include_top_snapshot,
        include_cgroup_limits,
        include_cpu_pressure,
        include_offline_cores,
        core_limit,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const identity_result = await client.lxc_service.getUsersAndGroups({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getUsersAndGroups(
    params: proxmox_lxc_get_users_and_groups_input_i,
  ): Promise<proxmox_lxc_users_and_groups_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? (2 * 1024 * 1024),
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_system_accounts = params.include_system_accounts !== false;
    const include_shadow_status = params.include_shadow_status !== false;
    const include_last_login = params.include_last_login === true;
    const include_sudo_privilege_signals = params.include_sudo_privilege_signals !== false;
    const privilege_detail_mode = ResolveIdentityPrivilegeDetailMode({
      raw_value: params.privilege_detail_mode,
      include_sudo_privilege_signals,
    });
    const include_group_memberships = params.include_group_memberships !== false;
    const user_limit = ValidatePositiveInteger({
      raw_value: params.user_limit ?? 1024,
      field_name: "user_limit",
      minimum: 1,
      maximum: 16384,
    });
    const group_limit = ValidatePositiveInteger({
      raw_value: params.group_limit ?? 1024,
      field_name: "group_limit",
      minimum: 1,
      maximum: 16384,
    });
    const username_filter = NormalizeOptionalText(params.username_filter)?.toLowerCase();
    const group_filter = NormalizeOptionalText(params.group_filter)?.toLowerCase();

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getUsersAndGroups requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const commands = ["identity_probe"];
    const probe_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      shell_mode: true,
      shell_command: BuildIdentityProbeShellCommand({
        include_shadow_status,
        include_last_login,
        include_sudo_privilege_signals,
        privilege_detail_mode,
      }),
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parse_result = ParseIdentityProbeOutput({
      probe_output: probe_result.stdout,
    });
    const scan_errors: proxmox_lxc_identity_scan_error_t[] = [...parse_result.scan_errors];
    const parse_warnings: proxmox_lxc_identity_parse_warning_t[] = [...parse_result.parse_warnings];
    let truncated = probe_result.truncated_output;
    if (probe_result.truncated_output) {
      scan_errors.push({
        source_kind: "probe",
        reason: "identity_partial_data:probe_output_truncated",
      });
    }

    let groups: proxmox_lxc_identity_group_t[] = parse_result.groups
      .map((group_record) => ({
        ...group_record,
        members: [...new Set(group_record.members)]
          .map((member_name) => member_name.trim())
          .filter((member_name) => member_name.length > 0)
          .sort((left_member, right_member) => left_member.localeCompare(right_member)),
      }))
      .sort((left_group, right_group) => {
        if (left_group.gid !== right_group.gid) {
          return left_group.gid - right_group.gid;
        }
        return left_group.group_name.localeCompare(right_group.group_name);
      });
    const groups_by_gid = new Map<number, string>();
    for (const group_record of groups) {
      groups_by_gid.set(group_record.gid, group_record.group_name);
    }

    const supplementary_groups_by_user = new Map<string, string[]>();
    for (const group_record of groups) {
      for (const member_name of group_record.members) {
        const normalized_member_name = member_name.toLowerCase();
        const current_group_list = supplementary_groups_by_user.get(normalized_member_name) ?? [];
        current_group_list.push(group_record.group_name);
        supplementary_groups_by_user.set(normalized_member_name, current_group_list);
      }
    }
    for (const [member_name, member_groups] of supplementary_groups_by_user.entries()) {
      supplementary_groups_by_user.set(
        member_name,
        [...new Set(member_groups)].sort((left_group, right_group) => left_group.localeCompare(right_group)),
      );
    }

    const admin_group_names = new Set(["sudo", "wheel", "adm", "admin", "docker", "lxd", "root"]);
    groups = groups.map((group_record) => {
      const normalized_group_name = group_record.group_name.toLowerCase();
      const has_admin_signal = admin_group_names.has(normalized_group_name)
        || parse_result.sudo_groups.has(normalized_group_name);
      return {
        ...group_record,
        is_admin_group_signal: has_admin_signal,
      };
    });

    let users: proxmox_lxc_identity_user_t[] = parse_result.users
      .map((user_record) => {
        const normalized_username = user_record.username.toLowerCase();
        const supplementary_groups = supplementary_groups_by_user.get(normalized_username) ?? [];
        const primary_group_name = groups_by_gid.get(user_record.gid);
        const sudo_signal_sources: string[] = [];
        if (include_sudo_privilege_signals) {
          if (parse_result.sudo_users.has(normalized_username)) {
            const sudo_user_sources = parse_result.sudo_user_sources.get(normalized_username) ?? [];
            if (sudo_user_sources.length === 0) {
              sudo_signal_sources.push("sudoers:user");
            } else {
              for (const source_path of sudo_user_sources) {
                sudo_signal_sources.push(`sudoers:user:${source_path}`);
              }
            }
          }
          for (const group_name of supplementary_groups) {
            const normalized_group_name = group_name.toLowerCase();
            if (admin_group_names.has(normalized_group_name)) {
              sudo_signal_sources.push(`group:${group_name}`);
            }
            if (parse_result.sudo_groups.has(normalized_group_name)) {
              const sudo_group_sources = parse_result.sudo_group_sources.get(normalized_group_name) ?? [];
              if (sudo_group_sources.length === 0) {
                sudo_signal_sources.push(`sudoers:group:${group_name}`);
              } else {
                for (const source_path of sudo_group_sources) {
                  sudo_signal_sources.push(`sudoers:group:${group_name}:${source_path}`);
                }
              }
            }
          }
        }
        const has_sudo_signal = include_sudo_privilege_signals && sudo_signal_sources.length > 0;
        return {
          ...user_record,
          primary_group_name,
          supplementary_groups: include_group_memberships
            ? supplementary_groups
            : undefined,
          has_sudo_signal,
          sudo_signal_sources: has_sudo_signal
            ? [...new Set(sudo_signal_sources)].sort((left_source, right_source) => left_source.localeCompare(right_source))
            : [],
          status_source_confidence: BuildIdentityStatusSourceConfidence({
            include_shadow_status,
            include_last_login,
            include_sudo_privilege_signals,
            privilege_detail_mode,
            password_status: user_record.password_status,
            is_expired: user_record.is_expired,
            has_sudo_signal,
            has_last_login: typeof user_record.last_login_at_iso === "string" && user_record.last_login_at_iso.length > 0,
          }),
        };
      })
      .sort((left_user, right_user) => {
        if (left_user.uid !== right_user.uid) {
          return left_user.uid - right_user.uid;
        }
        return left_user.username.localeCompare(right_user.username);
      });

    if (!include_system_accounts) {
      users = users.filter((user_record) => !user_record.is_system_account);
      groups = groups.filter((group_record) => !group_record.is_system_group);
    }
    if (username_filter) {
      users = users.filter((user_record) => user_record.username.toLowerCase().includes(username_filter));
    }
    if (group_filter) {
      groups = groups.filter((group_record) => group_record.group_name.toLowerCase().includes(group_filter));
    }

    if (users.length > user_limit) {
      users = users.slice(0, user_limit);
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "identity_partial_data:user_limit_applied",
      });
    }
    if (groups.length > group_limit) {
      groups = groups.slice(0, group_limit);
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "identity_partial_data:group_limit_applied",
      });
    }

    if (users.length === 0 && groups.length === 0) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect user/group identity telemetry from container.",
        details: {
          field: "lxc.identity_info",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const summary = BuildIdentitySummary({
      users,
      groups,
    });
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      users,
      groups,
      summary,
      probe_metadata: {
        primary_source: parse_result.primary_source,
        fallback_used: parse_result.fallback_used,
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        include_system_accounts,
        include_shadow_status,
        include_last_login,
        include_sudo_privilege_signals,
        privilege_detail_mode,
        include_group_memberships,
        user_limit,
        group_limit,
        username_filter,
        group_filter,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const firewall_result = await client.lxc_service.getFirewallInfo({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getFirewallInfo(
    params: proxmox_lxc_get_firewall_info_input_i,
  ): Promise<proxmox_lxc_firewall_info_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? (2 * 1024 * 1024),
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_raw_rules = params.include_raw_rules === true;
    const include_nat = params.include_nat !== false;
    const include_counters = params.include_counters === true;
    const include_ipv6 = params.include_ipv6 !== false;
    const include_security_findings = params.include_security_findings !== false;
    const rule_limit = ValidatePositiveInteger({
      raw_value: params.rule_limit ?? 2048,
      field_name: "rule_limit",
      minimum: 1,
      maximum: 32768,
    });
    const finding_limit = ValidatePositiveInteger({
      raw_value: params.finding_limit ?? 128,
      field_name: "finding_limit",
      minimum: 1,
      maximum: 4096,
    });

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getFirewallInfo requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const commands = ["firewall_probe"];
    const probe_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      shell_mode: true,
      shell_command: BuildFirewallProbeShellCommand({
        include_nat,
        include_counters,
        include_ipv6,
      }),
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });

    const parse_result = ParseFirewallProbeOutput({
      probe_output: probe_result.stdout,
      include_raw_rules,
    });
    const scan_errors: proxmox_lxc_firewall_scan_error_t[] = [...parse_result.scan_errors];
    const parse_warnings: proxmox_lxc_firewall_parse_warning_t[] = [...parse_result.parse_warnings];
    let truncated = probe_result.truncated_output;
    if (probe_result.truncated_output) {
      scan_errors.push({
        source_kind: "probe",
        reason: "firewall_partial_data:probe_output_truncated",
      });
    }

    let rules: proxmox_lxc_firewall_rule_t[] = [...parse_result.rules];
    if (rules.length > rule_limit) {
      rules = rules.slice(0, rule_limit);
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "firewall_partial_data:rule_limit_applied",
      });
    }

    const posture = BuildFirewallPosture({
      firewall: parse_result.firewall,
      rules,
      sysctl_values: parse_result.sysctl_values,
    });
    let findings: proxmox_lxc_firewall_finding_t[] = include_security_findings
      ? BuildFirewallFindings({
        firewall: parse_result.firewall,
        rules,
        posture,
      })
      : [];
    if (findings.length > finding_limit) {
      findings = findings.slice(0, finding_limit);
      truncated = true;
      scan_errors.push({
        source_kind: "probe",
        reason: "firewall_partial_data:finding_limit_applied",
      });
    }
    posture.notable_findings = findings;

    if (
      parse_result.firewall.backends_detected.length === 0
      && parse_result.sysctl_values.size === 0
      && rules.length === 0
    ) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect firewall telemetry from container.",
        details: {
          field: "lxc.firewall_info",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const summary = BuildFirewallSummary({
      rules,
      findings,
      parse_warning_count: parse_warnings.length,
      scan_error_count: scan_errors.length,
    });

    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      firewall: parse_result.firewall,
      rules,
      posture,
      summary,
      probe_metadata: {
        primary_source: parse_result.primary_source,
        fallback_used: parse_result.fallback_used,
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        include_raw_rules,
        include_nat,
        include_counters,
        include_ipv6,
        include_security_findings,
        rule_limit,
        finding_limit,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const devtool_result = await client.lxc_service.getDevelopmentToolingInfo({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getDevelopmentToolingInfo(
    params: proxmox_lxc_get_development_tooling_info_input_i,
  ): Promise<proxmox_lxc_development_tooling_info_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? (3 * 1024 * 1024),
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 32 * 1024 * 1024,
    });
    const include_c_cpp = params.include_c_cpp !== false;
    const include_nodejs = params.include_nodejs !== false;
    const include_python = params.include_python !== false;
    const include_ruby = params.include_ruby !== false;
    const include_go = params.include_go !== false;
    const include_rust = params.include_rust !== false;
    const include_package_inventory = params.include_package_inventory !== false;
    const include_compiler_search_paths = params.include_compiler_search_paths === true;
    const include_system_package_providers = params.include_system_package_providers !== false;
    const include_transitive_metadata = params.include_transitive_metadata === true;
    const include_distro_package_enrichment = params.include_distro_package_enrichment === true;
    const module_limit_per_runtime = ValidatePositiveInteger({
      raw_value: params.module_limit_per_runtime ?? 200,
      field_name: "module_limit_per_runtime",
      minimum: 1,
      maximum: 10000,
    });
    const package_limit_per_runtime = ValidatePositiveInteger({
      raw_value: params.package_limit_per_runtime ?? 500,
      field_name: "package_limit_per_runtime",
      minimum: 1,
      maximum: 20000,
    });
    const distro_package_limit_total = ValidatePositiveInteger({
      raw_value: params.distro_package_limit_total ?? 2000,
      field_name: "distro_package_limit_total",
      minimum: 1,
      maximum: 100000,
    });
    const distro_package_limit_per_ecosystem = ValidatePositiveInteger({
      raw_value: params.distro_package_limit_per_ecosystem ?? 500,
      field_name: "distro_package_limit_per_ecosystem",
      minimum: 1,
      maximum: 20000,
    });
    const distro_package_name_filters = Array.from(
      new Set(
        (params.distro_package_name_filters ?? [])
          .map((filter_value) => NormalizeOptionalText(filter_value)?.toLowerCase())
          .filter((filter_value): filter_value is string => filter_value !== undefined)
          .slice(0, 128),
      ),
    );

    const selected_ecosystems = new Set<proxmox_lxc_devtool_ecosystem_kind_t>();
    if (include_c_cpp) {
      selected_ecosystems.add("c_cpp");
    }
    if (include_nodejs) {
      selected_ecosystems.add("nodejs");
    }
    if (include_python) {
      selected_ecosystems.add("python");
    }
    if (include_ruby) {
      selected_ecosystems.add("ruby");
    }
    if (include_go) {
      selected_ecosystems.add("go");
    }
    if (include_rust) {
      selected_ecosystems.add("rust");
    }
    if (selected_ecosystems.size === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getDevelopmentToolingInfo requires at least one ecosystem include flag set to true.",
        details: {
          field: "include_*",
          value: "all_disabled",
        },
      });
    }

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getDevelopmentToolingInfo requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const commands = ["development_tooling_probe"];
    const probe_result = await this.runCommand({
      node_id: reference.node_id,
      container_id: reference.container_id,
      shell_mode: true,
      shell_command: BuildDevelopmentToolingProbeShellCommand({
        include_c_cpp,
        include_nodejs,
        include_python,
        include_ruby,
        include_go,
        include_rust,
        include_package_inventory,
        include_compiler_search_paths,
        include_system_package_providers,
        module_limit_per_runtime,
        package_limit_per_runtime,
        include_transitive_metadata,
        include_distro_package_enrichment,
        distro_package_limit_total,
      }),
      timeout_ms,
      max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });

    const parse_result = ParseDevelopmentToolingProbeOutput({
      probe_output: probe_result.stdout,
    });
    const scan_errors: proxmox_lxc_devtool_scan_error_t[] = [...parse_result.scan_errors];
    const parse_warnings: proxmox_lxc_devtool_parse_warning_t[] = [...parse_result.parse_warnings];
    let truncated = probe_result.truncated_output;
    let distro_packages_truncated = false;
    if (probe_result.truncated_output) {
      scan_errors.push({
        source_kind: "probe",
        reason: "devtool_partial_data:probe_output_truncated",
      });
    }

    let effective_distro_packages = include_distro_package_enrichment
      ? [...parse_result.distro_packages]
      : [];
    if (include_distro_package_enrichment && distro_package_name_filters.length > 0) {
      effective_distro_packages = effective_distro_packages.filter((package_record) => {
        const normalized_name = package_record.package_name.toLowerCase();
        return distro_package_name_filters.some((name_filter) => normalized_name.includes(name_filter));
      });
    }
    if (include_distro_package_enrichment && effective_distro_packages.length > distro_package_limit_total) {
      effective_distro_packages = effective_distro_packages.slice(0, distro_package_limit_total);
      truncated = true;
      distro_packages_truncated = true;
      scan_errors.push({
        source_kind: "distro_package_inventory",
        reason: "devtool_distro_inventory_truncated:total_limit_applied",
      });
    }

    const ecosystem_distro_package_map = new Map<proxmox_lxc_devtool_ecosystem_kind_t, proxmox_lxc_devtool_distro_package_t[]>();
    if (include_distro_package_enrichment) {
      for (const ecosystem_kind of GetDevelopmentToolingEcosystemOrder()) {
        ecosystem_distro_package_map.set(ecosystem_kind, []);
      }
      for (const distro_package_record of effective_distro_packages) {
        for (const ecosystem_kind of distro_package_record.ecosystem_matches) {
          const ecosystem_packages = ecosystem_distro_package_map.get(ecosystem_kind) ?? [];
          const existing_package = ecosystem_packages.find((candidate_record) => {
            const left_name = candidate_record.package_name.toLowerCase();
            const right_name = distro_package_record.package_name.toLowerCase();
            return left_name === right_name && candidate_record.source_manager === distro_package_record.source_manager;
          });
          if (!existing_package) {
            ecosystem_packages.push(distro_package_record);
            ecosystem_distro_package_map.set(ecosystem_kind, ecosystem_packages);
          }
        }
      }
    }

    const toolchains = parse_result.toolchains
      .filter((toolchain_record) => selected_ecosystems.has(toolchain_record.ecosystem_kind))
      .map((toolchain_record) => {
        const normalized_modules = include_package_inventory
          ? [...toolchain_record.libraries_or_modules]
          : [];
        const per_runtime_limit = toolchain_record.ecosystem_kind === "c_cpp"
          ? package_limit_per_runtime
          : module_limit_per_runtime;
        if (normalized_modules.length > per_runtime_limit) {
          truncated = true;
          scan_errors.push({
            source_kind: "package_inventory",
            reason: `devtool_inventory_truncated:${toolchain_record.ecosystem_kind}:module_limit_applied`,
          });
        }
        return {
          ...toolchain_record,
          source_kind: toolchain_record.source_kind === "probe"
            && include_distro_package_enrichment
            && (ecosystem_distro_package_map.get(toolchain_record.ecosystem_kind)?.length ?? 0) > 0
            ? "distro_package_inventory"
            : toolchain_record.source_kind,
          is_present: toolchain_record.is_present || (
            include_distro_package_enrichment
            && (ecosystem_distro_package_map.get(toolchain_record.ecosystem_kind)?.length ?? 0) > 0
          ),
          libraries_or_modules: normalized_modules.slice(0, per_runtime_limit),
          distro_packages: include_distro_package_enrichment
            ? (() => {
              const selected_distro_packages = [
                ...(ecosystem_distro_package_map.get(toolchain_record.ecosystem_kind) ?? []),
              ].sort((left_record, right_record) => {
                const by_name = left_record.package_name.localeCompare(right_record.package_name);
                if (by_name !== 0) {
                  return by_name;
                }
                const left_manager = left_record.source_manager;
                const right_manager = right_record.source_manager;
                return left_manager.localeCompare(right_manager);
              });
              if (selected_distro_packages.length > distro_package_limit_per_ecosystem) {
                truncated = true;
                distro_packages_truncated = true;
                scan_errors.push({
                  source_kind: "distro_package_inventory",
                  reason: `devtool_distro_inventory_truncated:${toolchain_record.ecosystem_kind}:per_ecosystem_limit_applied`,
                });
              }
              return selected_distro_packages.slice(0, distro_package_limit_per_ecosystem);
            })()
            : undefined,
          search_paths: include_compiler_search_paths ? toolchain_record.search_paths : undefined,
          runtime_paths: include_compiler_search_paths ? toolchain_record.runtime_paths : undefined,
        };
      })
      .sort((left_toolchain, right_toolchain) => {
        return DevelopmentToolingEcosystemSortValue(left_toolchain.ecosystem_kind)
          - DevelopmentToolingEcosystemSortValue(right_toolchain.ecosystem_kind);
      });

    let system_package_providers = include_system_package_providers
      ? [...parse_result.system_package_providers]
      : [];
    if (system_package_providers.length > package_limit_per_runtime) {
      truncated = true;
      scan_errors.push({
        source_kind: "system_package_provider",
        reason: "devtool_inventory_truncated:system_package_provider_limit_applied",
      });
      system_package_providers = system_package_providers.slice(0, package_limit_per_runtime);
    }

    const has_meaningful_data = parse_result.probed_ecosystems.size > 0
      || toolchains.some((toolchain_record) => toolchain_record.is_present);
    if (!has_meaningful_data) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect development tooling telemetry from container.",
        details: {
          field: "lxc.development_tooling",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    const summary = BuildDevelopmentToolingSummary({
      toolchains,
      include_package_inventory,
      include_distro_package_enrichment,
      system_package_providers,
      parse_warning_count: parse_warnings.length,
      scan_error_count: scan_errors.length,
    });
    const distro_packages_mapped_count = toolchains.reduce((count_accumulator, toolchain_record) => {
      return count_accumulator + (toolchain_record.distro_packages?.length ?? 0);
    }, 0);
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      toolchains,
      system_package_providers,
      summary,
      probe_metadata: {
        primary_source: parse_result.primary_source,
        fallback_used: parse_result.fallback_used,
        commands,
        distro_package_enrichment_enabled: include_distro_package_enrichment,
        distro_package_manager_used: include_distro_package_enrichment
          ? parse_result.distro_package_manager_used
          : undefined,
        distro_packages_scanned_count: include_distro_package_enrichment
          ? parse_result.distro_packages_scanned_count
          : 0,
        distro_packages_mapped_count: include_distro_package_enrichment
          ? distro_packages_mapped_count
          : 0,
        distro_packages_truncated: include_distro_package_enrichment
          ? distro_packages_truncated
          : false,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        include_package_inventory,
        include_compiler_search_paths,
        include_system_package_providers,
        include_transitive_metadata,
        module_limit_per_runtime,
        package_limit_per_runtime,
        include_distro_package_enrichment,
        distro_package_limit_total,
        distro_package_limit_per_ecosystem,
        distro_package_name_filters,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  public async generateSystemReportHtml(
    params: proxmox_lxc_generate_system_report_html_input_i,
  ): Promise<proxmox_lxc_system_report_html_result_t> {
    const reference = BuildLxcReference(params);
    const section_selection = ResolveSystemReportSectionSelection(params.sections);
    const collection_options = ResolveSystemReportCollectionOptions(params.collection_options);
    const render_options = ResolveSystemReportRenderOptions(params.render_options);
    const fail_on_section_error = params.fail_on_section_error === true;
    const section_payloads: Partial<Record<proxmox_lxc_system_report_section_id_t, unknown>> = {};
    const sections: proxmox_lxc_system_report_section_metadata_t[] = [];
    const started_at_ms = Date.now();

    const runSection = async (
      section_id: proxmox_lxc_system_report_section_id_t,
      enabled: boolean,
      runner: () => Promise<unknown>,
    ): Promise<void> => {
      if (!enabled) {
        sections.push({
          section_id,
          status: "disabled",
          warning_count: 0,
          error_count: 0,
          truncated: false,
          duration_ms: 0,
        });
        return;
      }
      const section_started_at_ms = Date.now();
      try {
        const payload = await runner();
        section_payloads[section_id] = payload;
        const stats = ResolveSystemReportResultStats(payload);
        sections.push({
          section_id,
          status: stats.warning_count > 0 || stats.error_count > 0 || stats.truncated
            ? "partial"
            : "success",
          warning_count: stats.warning_count,
          error_count: stats.error_count,
          truncated: stats.truncated,
          duration_ms: Math.max(0, Date.now() - section_started_at_ms),
        });
      } catch (error) {
        const message = ResolveSafeErrorMessage(error);
        sections.push({
          section_id,
          status: "failed",
          warning_count: 0,
          error_count: 1,
          truncated: false,
          duration_ms: Math.max(0, Date.now() - section_started_at_ms),
          message,
        });
        if (fail_on_section_error) {
          throw new ProxmoxLxcExecError({
            code: "proxmox.lxc.exec_start_failed",
            message: `System report section failed: ${section_id}.`,
            details: {
              field: "lxc.system_report.section",
              value: section_id,
            },
          });
        }
      }
    };

    await runSection("system_info", section_selection.system_info, async () => {
      return this.getSystemInfo({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
      });
    });
    await runSection("cron_jobs", section_selection.cron_jobs, async () => {
      return this.getCronJobs({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_system_cron: true,
        include_user_cron: true,
      });
    });
    await runSection("processes", section_selection.processes, async () => {
      return this.getProcessList({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_environment: false,
        environment_mode: "keys_only",
        process_limit: collection_options.process_limit,
      });
    });
    await runSection("tcp_ports", section_selection.tcp_ports, async () => {
      return this.getOpenTcpPorts({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_environment: false,
        environment_mode: "keys_only",
        include_interfaces: true,
        listener_limit: collection_options.listener_limit,
        include_loopback: true,
      });
    });
    await runSection("udp_ports", section_selection.udp_ports, async () => {
      return this.getOpenUdpPorts({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_environment: false,
        environment_mode: "keys_only",
        include_interfaces: true,
        listener_limit: collection_options.listener_limit,
        include_loopback: true,
      });
    });
    await runSection("services", section_selection.services, async () => {
      return this.getServicesAndDaemons({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_inactive: true,
        include_failed: true,
        include_disabled: true,
        include_process_details: true,
        process_enrichment_mode: "main_pid_only",
        detail_level: "standard",
        service_limit: collection_options.service_limit,
      });
    });
    await runSection("hardware", section_selection.hardware, async () => {
      return this.getHardwareInventory({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        device_limit: collection_options.hardware_device_limit,
        include_network: true,
        include_storage: true,
        include_pci: true,
        include_usb: true,
        include_graphics: true,
        include_virtual_devices: true,
      });
    });
    await runSection("disk", section_selection.disk, async () => {
      return this.getDiskAndBlockDevices({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        device_limit: collection_options.disk_device_limit,
        filesystem_limit: collection_options.disk_filesystem_limit,
        include_partitions: true,
        include_filesystems: true,
        include_mounts: true,
        include_usage: true,
        include_loop_devices: false,
        include_virtual_devices: true,
        filesystem_scope: "all",
      });
    });
    await runSection("memory", section_selection.memory, async () => {
      return this.getMemoryInfo({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_process_breakdown: true,
        include_kernel_breakdown: true,
        include_cgroup_limits: true,
        process_limit: collection_options.memory_process_limit,
      });
    });
    await runSection("cpu", section_selection.cpu, async () => {
      return this.getCpuInfo({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_per_core: true,
        include_flags: false,
        include_top_snapshot: true,
        include_cgroup_limits: true,
        include_cpu_pressure: true,
        core_limit: collection_options.cpu_core_limit,
      });
    });
    await runSection("identity", section_selection.identity, async () => {
      return this.getUsersAndGroups({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_system_accounts: true,
        include_shadow_status: true,
        include_last_login: false,
        include_sudo_privilege_signals: true,
        include_group_memberships: true,
        privilege_detail_mode: "signals_only",
        user_limit: collection_options.identity_user_limit,
        group_limit: collection_options.identity_group_limit,
      });
    });
    await runSection("firewall", section_selection.firewall, async () => {
      return this.getFirewallInfo({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_raw_rules: false,
        include_nat: true,
        include_counters: false,
        include_ipv6: true,
        include_security_findings: true,
        rule_limit: collection_options.firewall_rule_limit,
        finding_limit: collection_options.firewall_finding_limit,
      });
    });
    await runSection("devtools", section_selection.devtools, async () => {
      return this.getDevelopmentToolingInfo({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms: collection_options.section_timeout_ms,
        include_package_inventory: true,
        include_compiler_search_paths: false,
        include_system_package_providers: true,
        module_limit_per_runtime: collection_options.devtools_module_limit_per_runtime,
        package_limit_per_runtime: collection_options.devtools_package_limit_per_runtime,
        include_transitive_metadata: false,
        include_distro_package_enrichment: collection_options.devtools_include_distro_package_enrichment,
        distro_package_limit_total: collection_options.devtools_distro_package_limit_total,
        distro_package_limit_per_ecosystem: collection_options.devtools_distro_package_limit_per_ecosystem,
      });
    });

    const metadata: proxmox_lxc_system_report_metadata_t = {
      node_id: reference.node_id,
      container_id: reference.container_id,
      generated_at_iso: new Date().toISOString(),
      total_duration_ms: Math.max(0, Date.now() - started_at_ms),
      sections,
      section_status_counts: BuildSystemReportStatusCounts({ sections }),
    };
    const html = BuildSystemReportHtmlDocument({
      metadata,
      section_payloads,
      render_options,
    });
    return {
      html,
      metadata,
    };
  }

  public async generateSystemReportFile(
    params: proxmox_lxc_generate_system_report_file_input_i,
  ): Promise<proxmox_lxc_system_report_file_result_t> {
    const html_result = await this.generateSystemReportHtml(params);
    const reference = BuildLxcReference(params);
    const overwrite = params.overwrite !== false;
    const resolved_output_path = ResolveSystemReportOutputPath({
      output_path: params.output_path,
      output_dir: params.output_dir,
      file_name_prefix: params.file_name_prefix,
      node_id: reference.node_id,
      container_id: reference.container_id,
      generated_at_iso: html_result.metadata.generated_at_iso,
    });

    if (!overwrite) {
      try {
        await fs.access(resolved_output_path);
        throw new ProxmoxValidationError({
          code: "proxmox.validation.invalid_input",
          message: "System report output path already exists and overwrite is disabled.",
          details: {
            field: "output_path",
            value: resolved_output_path,
          },
        });
      } catch (error) {
        if (!(error instanceof Error) || !(error as NodeJS.ErrnoException).code || (error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }

    await fs.mkdir(path.dirname(resolved_output_path), { recursive: true });
    await fs.writeFile(resolved_output_path, html_result.html, "utf8");
    return {
      report_path: resolved_output_path,
      bytes_written: Buffer.byteLength(html_result.html, "utf8"),
      metadata: html_result.metadata,
    };
  }

  /**
   * Example:
   * const tcp_result = await client.lxc_service.getOpenTcpPorts({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getOpenTcpPorts(
    params: proxmox_lxc_get_open_tcp_ports_input_i,
  ): Promise<proxmox_lxc_open_tcp_ports_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_environment = params.include_environment === true;
    const environment_mode = ResolveEnvironmentMode(params.environment_mode, include_environment);
    const include_interfaces = params.include_interfaces !== false;
    const process_limit = ValidatePositiveInteger({
      raw_value: params.process_limit ?? 200,
      field_name: "process_limit",
      minimum: 1,
      maximum: 4096,
    });
    const listener_limit = ValidatePositiveInteger({
      raw_value: params.listener_limit ?? 512,
      field_name: "listener_limit",
      minimum: 1,
      maximum: 8192,
    });
    const include_loopback = params.include_loopback !== false;
    const max_environment_bytes_per_process = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_per_process ?? 4096,
      field_name: "max_environment_bytes_per_process",
      minimum: 128,
      maximum: 256 * 1024,
    });
    const max_environment_bytes_total = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_total ?? 256 * 1024,
      field_name: "max_environment_bytes_total",
      minimum: 1024,
      maximum: 4 * 1024 * 1024,
    });
    const port_filter = NormalizeTcpPortFilter(params.port_filter);
    const address_family_filter = NormalizeAddressFamilyFilter(params.address_family_filter);

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getOpenTcpPorts requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const parse_warnings: proxmox_lxc_tcp_listener_parse_warning_t[] = [];
    const scan_errors: proxmox_lxc_tcp_listener_scan_error_t[] = [];
    const commands: string[] = [];
    let fallback_used = false;
    let primary_source: proxmox_lxc_tcp_listener_source_kind_t = "ss";
    let truncated = false;

    let listeners = await this.collectTcpListenersFromSs({
      node_id: reference.node_id,
      container_id: reference.container_id,
      timeout_ms,
      max_output_bytes,
      parse_warnings,
      scan_errors,
      commands,
    });

    if (listeners.length === 0) {
      fallback_used = true;
      primary_source = "netstat";
      listeners = await this.collectTcpListenersFromNetstat({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        parse_warnings,
        scan_errors,
        commands,
      });
    }

    if (listeners.length === 0) {
      fallback_used = true;
      primary_source = "procfs";
      const procfs_result = await this.collectTcpListenersFromProcfs({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        parse_warnings,
        scan_errors,
        commands,
      });
      listeners = procfs_result.listeners;
      if (procfs_result.truncated) {
        truncated = true;
      }
    }

    if (listeners.length === 0) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect TCP listening sockets from container.",
        details: {
          field: "lxc.tcp_listeners",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    listeners = ApplyTcpListenerFilters({
      listeners,
      include_loopback,
      port_filter,
      address_family_filter,
    });

    if (include_interfaces) {
      const interface_inventory_result = await this.collectInterfaceInventory({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        commands,
      });
      scan_errors.push(...interface_inventory_result.scan_errors);
      listeners = listeners.map((listener) => CorrelateListenerInterface({
        listener,
        interface_inventory: interface_inventory_result.interfaces,
      }));
      for (const listener of listeners) {
        if (listener.interface_match_kind === "unresolved") {
          scan_errors.push({
            source_kind: "interface",
            pid: listener.pid,
            inode: listener.inode,
            reason: "interface_correlation_unresolved",
          });
        }
      }
    }

    if (listeners.length > listener_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: primary_source,
        reason: "listener_limit_applied",
      });
      listeners = listeners.slice(0, listener_limit);
    }

    const pid_filter = Array.from(
      new Set(
        listeners
          .map((listener) => listener.pid)
          .filter((listener_pid): listener_pid is number => typeof listener_pid === "number"),
      ),
    );
    let process_lookup = new Map<number, proxmox_lxc_process_record_t>();
    if (pid_filter.length > 0) {
      try {
        const process_result = await this.getProcessList({
          node_id: reference.node_id,
          container_id: reference.container_id,
          timeout_ms,
          max_output_bytes,
          include_environment,
          environment_mode,
          process_limit,
          pid_filter,
          max_environment_bytes_per_process,
          max_environment_bytes_total,
        });
        process_lookup = new Map<number, proxmox_lxc_process_record_t>(
          process_result.processes.map((process_record) => [process_record.pid, process_record]),
        );
      } catch (error) {
        scan_errors.push({
          source_kind: primary_source,
          reason: `process_enrichment_failed:${error instanceof Error ? error.message : "unknown"}`,
        });
      }
    }

    listeners = listeners.map((listener) => {
      if (listener.pid === undefined) {
        return listener;
      }
      const process_record = process_lookup.get(listener.pid);
      if (!process_record) {
        return listener;
      }
      return {
        ...listener,
        process: process_record,
      };
    });

    const summary = BuildTcpListenerSummary(listeners);
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      listeners,
      summary,
      probe_metadata: {
        primary_source,
        fallback_used,
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        listener_limit,
        process_limit,
        include_loopback,
        include_interfaces,
        environment_mode,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  /**
   * Example:
   * const udp_result = await client.lxc_service.getOpenUdpPorts({
   *   node_id: "pve1",
   *   container_id: 101,
   * });
   */
  public async getOpenUdpPorts(
    params: proxmox_lxc_get_open_udp_ports_input_i,
  ): Promise<proxmox_lxc_open_udp_ports_result_t> {
    const reference = BuildLxcReference(params);
    const timeout_ms = ValidatePositiveInteger({
      raw_value: params.timeout_ms ?? 30000,
      field_name: "timeout_ms",
      minimum: 1000,
      maximum: 600000,
    });
    const max_output_bytes = ValidatePositiveInteger({
      raw_value: params.max_output_bytes ?? 2 * 1024 * 1024,
      field_name: "max_output_bytes",
      minimum: 1024,
      maximum: 16 * 1024 * 1024,
    });
    const include_environment = params.include_environment === true;
    const environment_mode = ResolveEnvironmentMode(params.environment_mode, include_environment);
    const include_interfaces = params.include_interfaces !== false;
    const process_limit = ValidatePositiveInteger({
      raw_value: params.process_limit ?? 200,
      field_name: "process_limit",
      minimum: 1,
      maximum: 4096,
    });
    const listener_limit = ValidatePositiveInteger({
      raw_value: params.listener_limit ?? 512,
      field_name: "listener_limit",
      minimum: 1,
      maximum: 8192,
    });
    const include_loopback = params.include_loopback !== false;
    const max_environment_bytes_per_process = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_per_process ?? 4096,
      field_name: "max_environment_bytes_per_process",
      minimum: 128,
      maximum: 256 * 1024,
    });
    const max_environment_bytes_total = ValidatePositiveInteger({
      raw_value: params.max_environment_bytes_total ?? 256 * 1024,
      field_name: "max_environment_bytes_total",
      minimum: 1024,
      maximum: 4 * 1024 * 1024,
    });
    const port_filter = NormalizeTcpPortFilter(params.port_filter);
    const address_family_filter = NormalizeAddressFamilyFilter(params.address_family_filter);

    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "getOpenUdpPorts requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const parse_warnings: proxmox_lxc_udp_listener_parse_warning_t[] = [];
    const scan_errors: proxmox_lxc_udp_listener_scan_error_t[] = [];
    const commands: string[] = [];
    let fallback_used = false;
    let primary_source: proxmox_lxc_udp_listener_source_kind_t = "ss";
    let truncated = false;

    let listeners = await this.collectUdpListenersFromSs({
      node_id: reference.node_id,
      container_id: reference.container_id,
      timeout_ms,
      max_output_bytes,
      parse_warnings,
      scan_errors,
      commands,
    });

    if (listeners.length === 0) {
      fallback_used = true;
      primary_source = "netstat";
      listeners = await this.collectUdpListenersFromNetstat({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        parse_warnings,
        scan_errors,
        commands,
      });
    }

    if (listeners.length === 0) {
      fallback_used = true;
      primary_source = "procfs";
      const procfs_result = await this.collectUdpListenersFromProcfs({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        parse_warnings,
        scan_errors,
        commands,
      });
      listeners = procfs_result.listeners;
      if (procfs_result.truncated) {
        truncated = true;
      }
    }

    if (listeners.length === 0) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Unable to collect UDP sockets from container.",
        details: {
          field: "lxc.udp_listeners",
          value: `${reference.node_id}/${reference.container_id}`,
        },
      });
    }

    listeners = ApplyUdpListenerFilters({
      listeners,
      include_loopback,
      port_filter,
      address_family_filter,
    });

    if (include_interfaces) {
      const interface_inventory_result = await this.collectInterfaceInventory({
        node_id: reference.node_id,
        container_id: reference.container_id,
        timeout_ms,
        max_output_bytes,
        commands,
      });
      scan_errors.push(...interface_inventory_result.scan_errors);
      listeners = listeners.map((listener) => CorrelateUdpListenerInterface({
        listener,
        interface_inventory: interface_inventory_result.interfaces,
      }));
      for (const listener of listeners) {
        if (listener.interface_match_kind === "unresolved") {
          scan_errors.push({
            source_kind: "interface",
            pid: listener.pid,
            inode: listener.inode,
            reason: "interface_correlation_unresolved",
          });
        }
      }
    }

    if (listeners.length > listener_limit) {
      truncated = true;
      scan_errors.push({
        source_kind: primary_source,
        reason: "listener_limit_applied",
      });
      listeners = listeners.slice(0, listener_limit);
    }

    const pid_filter = Array.from(
      new Set(
        listeners
          .map((listener) => listener.pid)
          .filter((listener_pid): listener_pid is number => typeof listener_pid === "number"),
      ),
    );
    let process_lookup = new Map<number, proxmox_lxc_process_record_t>();
    if (pid_filter.length > 0) {
      try {
        const process_result = await this.getProcessList({
          node_id: reference.node_id,
          container_id: reference.container_id,
          timeout_ms,
          max_output_bytes,
          include_environment,
          environment_mode,
          process_limit,
          pid_filter,
          max_environment_bytes_per_process,
          max_environment_bytes_total,
        });
        process_lookup = new Map<number, proxmox_lxc_process_record_t>(
          process_result.processes.map((process_record) => [process_record.pid, process_record]),
        );
      } catch (error) {
        scan_errors.push({
          source_kind: primary_source,
          reason: `process_enrichment_failed:${error instanceof Error ? error.message : "unknown"}`,
        });
      }
    }

    listeners = listeners.map((listener) => {
      if (listener.pid === undefined) {
        return listener;
      }
      const process_record = process_lookup.get(listener.pid);
      if (!process_record) {
        return listener;
      }
      return {
        ...listener,
        process: process_record,
      };
    });

    const summary = BuildUdpListenerSummary(listeners);
    return {
      node_id: reference.node_id,
      container_id: reference.container_id,
      listeners,
      summary,
      probe_metadata: {
        primary_source,
        fallback_used,
        commands,
      },
      scan_errors,
      parse_warnings,
      limits_applied: {
        listener_limit,
        process_limit,
        include_loopback,
        include_interfaces,
        environment_mode,
      },
      truncated,
      collected_at_iso: new Date().toISOString(),
    };
  }

  private async collectServicesFromSystemd(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    detail_level: proxmox_lxc_service_detail_level_t;
    service_limit: number;
  }): Promise<{
    manager_detected: boolean;
    services: proxmox_lxc_service_record_t[];
    scan_errors: proxmox_lxc_service_scan_error_t[];
    parse_warnings: proxmox_lxc_service_parse_warning_t[];
    commands: string[];
    truncated: boolean;
  }> {
    const commands = ["systemd_services_probe"];
    const run_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildSystemdServicesProbeShellCommand({
        detail_level: params.detail_level,
        service_limit: params.service_limit,
      }),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parsed_result = ParseSystemdServicesProbeOutput({
      probe_output: run_result.stdout,
      detail_level: params.detail_level,
      metadata_max_length: 2048,
      service_limit: params.service_limit,
    });
    const limit_applied = parsed_result.scan_errors.some((scan_error) => scan_error.reason.includes("limit_applied"));
    return {
      manager_detected: parsed_result.manager_detected,
      services: parsed_result.services,
      scan_errors: [
        ...(run_result.truncated_output
          ? [{
            source_kind: "systemd_units" as proxmox_lxc_service_probe_source_kind_t,
            reason: "systemd_probe_output_truncated",
          }]
          : []),
        ...parsed_result.scan_errors,
      ],
      parse_warnings: parsed_result.parse_warnings,
      commands,
      truncated: run_result.truncated_output || limit_applied,
    };
  }

  private async collectServicesFromOpenrc(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    service_limit: number;
  }): Promise<{
    manager_detected: boolean;
    services: proxmox_lxc_service_record_t[];
    scan_errors: proxmox_lxc_service_scan_error_t[];
    parse_warnings: proxmox_lxc_service_parse_warning_t[];
    commands: string[];
    truncated: boolean;
  }> {
    const commands = ["openrc_services_probe"];
    const run_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildOpenrcServicesProbeShellCommand({
        service_limit: params.service_limit,
      }),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parsed_result = ParseOpenrcServicesProbeOutput(run_result.stdout);
    const limit_applied = parsed_result.scan_errors.some((scan_error) => scan_error.reason.includes("limit_applied"));
    return {
      manager_detected: parsed_result.manager_detected,
      services: parsed_result.services,
      scan_errors: [
        ...(run_result.truncated_output
          ? [{
            source_kind: "openrc_status" as proxmox_lxc_service_probe_source_kind_t,
            reason: "openrc_probe_output_truncated",
          }]
          : []),
        ...parsed_result.scan_errors,
      ],
      parse_warnings: parsed_result.parse_warnings,
      commands,
      truncated: run_result.truncated_output || limit_applied,
    };
  }

  private async collectServicesFromSysv(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    service_limit: number;
  }): Promise<{
    manager_detected: boolean;
    services: proxmox_lxc_service_record_t[];
    scan_errors: proxmox_lxc_service_scan_error_t[];
    parse_warnings: proxmox_lxc_service_parse_warning_t[];
    commands: string[];
    truncated: boolean;
  }> {
    const commands = ["sysv_services_probe"];
    const run_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildSysvServicesProbeShellCommand({
        service_limit: params.service_limit,
      }),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parsed_result = ParseSysvServicesProbeOutput(run_result.stdout);
    const limit_applied = parsed_result.scan_errors.some((scan_error) => scan_error.reason.includes("limit_applied"));
    return {
      manager_detected: parsed_result.manager_detected,
      services: parsed_result.services,
      scan_errors: [
        ...(run_result.truncated_output
          ? [{
            source_kind: "sysv_service_status" as proxmox_lxc_service_probe_source_kind_t,
            reason: "sysv_probe_output_truncated",
          }]
          : []),
        ...parsed_result.scan_errors,
      ],
      parse_warnings: parsed_result.parse_warnings,
      commands,
      truncated: run_result.truncated_output || limit_applied,
    };
  }

  private async collectServicesFromStaticFallback(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    service_limit: number;
  }): Promise<{
    services: proxmox_lxc_service_record_t[];
    scan_errors: proxmox_lxc_service_scan_error_t[];
    parse_warnings: proxmox_lxc_service_parse_warning_t[];
    commands: string[];
    truncated: boolean;
  }> {
    const commands = ["static_services_probe"];
    const run_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildStaticServicesProbeShellCommand({
        service_limit: params.service_limit,
      }),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const parsed_result = ParseStaticServicesProbeOutput(run_result.stdout);
    const limit_applied = parsed_result.scan_errors.some((scan_error) => scan_error.reason.includes("limit_applied"));
    return {
      services: parsed_result.services,
      scan_errors: [
        ...(run_result.truncated_output
          ? [{
            source_kind: "fallback_static" as proxmox_lxc_service_probe_source_kind_t,
            reason: "static_probe_output_truncated",
          }]
          : []),
        ...parsed_result.scan_errors,
      ],
      parse_warnings: parsed_result.parse_warnings,
      commands,
      truncated: run_result.truncated_output || limit_applied,
    };
  }

  private async collectUdpListenersFromSs(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    parse_warnings: proxmox_lxc_udp_listener_parse_warning_t[];
    scan_errors: proxmox_lxc_udp_listener_scan_error_t[];
    commands: string[];
  }): Promise<proxmox_lxc_udp_listener_t[]> {
    params.commands.push("ss_udp_probe");
    const ss_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildUdpSsProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (ss_result.truncated_output) {
      params.scan_errors.push({
        source_kind: "ss",
        reason: "udp_ss_output_truncated",
      });
    }
    const listeners: proxmox_lxc_udp_listener_t[] = [];
    for (const raw_line of ss_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line || normalized_line.startsWith("__ERR__")) {
        continue;
      }
      const parsed_listener = ParseSsUdpListenerLine(raw_line);
      if (!parsed_listener) {
        params.parse_warnings.push({
          source_kind: "ss",
          reason: "invalid_udp_ss_listener_line",
          raw_line,
        });
        continue;
      }
      listeners.push(parsed_listener);
    }
    return listeners;
  }

  private async collectUdpListenersFromNetstat(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    parse_warnings: proxmox_lxc_udp_listener_parse_warning_t[];
    scan_errors: proxmox_lxc_udp_listener_scan_error_t[];
    commands: string[];
  }): Promise<proxmox_lxc_udp_listener_t[]> {
    params.commands.push("netstat_udp_probe");
    const netstat_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildUdpNetstatProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (netstat_result.truncated_output) {
      params.scan_errors.push({
        source_kind: "netstat",
        reason: "udp_netstat_output_truncated",
      });
    }
    const listeners: proxmox_lxc_udp_listener_t[] = [];
    for (const raw_line of netstat_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line || normalized_line.startsWith("__ERR__")) {
        continue;
      }
      if (!normalized_line.startsWith("udp")) {
        continue;
      }
      const parsed_listener = ParseNetstatUdpListenerLine(raw_line);
      if (!parsed_listener) {
        params.parse_warnings.push({
          source_kind: "netstat",
          reason: "invalid_udp_netstat_listener_line",
          raw_line,
        });
        continue;
      }
      listeners.push(parsed_listener);
    }
    return listeners;
  }

  private async collectUdpListenersFromProcfs(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    parse_warnings: proxmox_lxc_udp_listener_parse_warning_t[];
    scan_errors: proxmox_lxc_udp_listener_scan_error_t[];
    commands: string[];
  }): Promise<{
    listeners: proxmox_lxc_udp_listener_t[];
    truncated: boolean;
  }> {
    params.commands.push("proc_udp_probe");
    const proc_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildUdpProcProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const listeners_by_inode = new Map<number, proxmox_lxc_udp_listener_t>();
    const inode_map = new Map<number, { pid?: number; fd?: number }>();
    let truncated = proc_result.truncated_output;
    if (proc_result.truncated_output) {
      params.scan_errors.push({
        source_kind: "procfs",
        reason: "udp_proc_output_truncated",
      });
    }
    for (const raw_line of proc_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line) {
        continue;
      }
      if (normalized_line.startsWith("__UDP__\t")) {
        const fields = normalized_line.split("\t");
        if (fields.length < 5) {
          params.parse_warnings.push({
            source_kind: "procfs",
            reason: "invalid_udp_proc_field_count",
            raw_line,
          });
          continue;
        }
        const parsed_listener = ParseProcUdpListenerLine({
          source_path: fields[1],
          local_address_hex: fields[2],
          state_hex: fields[3],
          inode_raw: fields[4],
        });
        if (!parsed_listener) {
          params.parse_warnings.push({
            source_kind: "procfs",
            reason: "invalid_udp_proc_record",
            raw_line,
          });
          continue;
        }
        if (parsed_listener.inode !== undefined) {
          listeners_by_inode.set(parsed_listener.inode, parsed_listener);
        } else {
          const synthetic_inode = Number.MAX_SAFE_INTEGER - listeners_by_inode.size;
          listeners_by_inode.set(synthetic_inode, parsed_listener);
        }
        continue;
      }
      if (normalized_line.startsWith("__MAP__\t")) {
        const fields = normalized_line.split("\t");
        if (fields.length < 4) {
          continue;
        }
        const inode = ParseOptionalInteger(fields[1]);
        if (inode === undefined) {
          continue;
        }
        inode_map.set(inode, {
          pid: ParseOptionalInteger(fields[2]),
          fd: ParseOptionalInteger(fields[3]),
        });
        continue;
      }
      if (normalized_line.startsWith("__ERR__\t")) {
        const fields = normalized_line.split("\t");
        params.scan_errors.push({
          source_kind: "procfs",
          reason: fields[1] ?? "unknown",
        });
      }
    }
    const listeners: proxmox_lxc_udp_listener_t[] = [];
    for (const [inode_key, listener] of listeners_by_inode.entries()) {
      const inode_record = inode_map.get(inode_key);
      listeners.push({
        ...listener,
        pid: inode_record?.pid ?? listener.pid,
        fd: inode_record?.fd ?? listener.fd,
      });
    }
    return {
      listeners,
      truncated,
    };
  }

  private async collectTcpListenersFromSs(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    parse_warnings: proxmox_lxc_tcp_listener_parse_warning_t[];
    scan_errors: proxmox_lxc_tcp_listener_scan_error_t[];
    commands: string[];
  }): Promise<proxmox_lxc_tcp_listener_t[]> {
    params.commands.push("ss_probe");
    const ss_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildTcpSsProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (ss_result.truncated_output) {
      params.scan_errors.push({
        source_kind: "ss",
        reason: "ss_output_truncated",
      });
    }
    const listeners: proxmox_lxc_tcp_listener_t[] = [];
    for (const raw_line of ss_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line || normalized_line.startsWith("__ERR__")) {
        continue;
      }
      const parsed_listener = ParseSsListenerLine(raw_line);
      if (!parsed_listener) {
        params.parse_warnings.push({
          source_kind: "ss",
          reason: "invalid_ss_listener_line",
          raw_line,
        });
        continue;
      }
      listeners.push(parsed_listener);
    }
    return listeners;
  }

  private async collectTcpListenersFromNetstat(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    parse_warnings: proxmox_lxc_tcp_listener_parse_warning_t[];
    scan_errors: proxmox_lxc_tcp_listener_scan_error_t[];
    commands: string[];
  }): Promise<proxmox_lxc_tcp_listener_t[]> {
    params.commands.push("netstat_probe");
    const netstat_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildTcpNetstatProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (netstat_result.truncated_output) {
      params.scan_errors.push({
        source_kind: "netstat",
        reason: "netstat_output_truncated",
      });
    }
    const listeners: proxmox_lxc_tcp_listener_t[] = [];
    for (const raw_line of netstat_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line || normalized_line.startsWith("__ERR__")) {
        continue;
      }
      if (!normalized_line.startsWith("tcp")) {
        continue;
      }
      const parsed_listener = ParseNetstatListenerLine(raw_line);
      if (!parsed_listener) {
        params.parse_warnings.push({
          source_kind: "netstat",
          reason: "invalid_netstat_listener_line",
          raw_line,
        });
        continue;
      }
      listeners.push(parsed_listener);
    }
    return listeners;
  }

  private async collectTcpListenersFromProcfs(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    parse_warnings: proxmox_lxc_tcp_listener_parse_warning_t[];
    scan_errors: proxmox_lxc_tcp_listener_scan_error_t[];
    commands: string[];
  }): Promise<{
    listeners: proxmox_lxc_tcp_listener_t[];
    truncated: boolean;
  }> {
    params.commands.push("proc_tcp_probe");
    const proc_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildTcpProcProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const listeners_by_inode = new Map<number, proxmox_lxc_tcp_listener_t>();
    const inode_map = new Map<number, { pid?: number; fd?: number }>();
    let truncated = proc_result.truncated_output;
    if (proc_result.truncated_output) {
      params.scan_errors.push({
        source_kind: "procfs",
        reason: "proc_tcp_output_truncated",
      });
    }
    for (const raw_line of proc_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line) {
        continue;
      }
      if (normalized_line.startsWith("__TCP__\t")) {
        const fields = normalized_line.split("\t");
        if (fields.length < 5) {
          params.parse_warnings.push({
            source_kind: "procfs",
            reason: "invalid_proc_tcp_field_count",
            raw_line,
          });
          continue;
        }
        const parsed_listener = ParseProcTcpListenerLine({
          source_path: fields[1],
          local_address_hex: fields[2],
          state_hex: fields[3],
          inode_raw: fields[4],
        });
        if (!parsed_listener) {
          params.parse_warnings.push({
            source_kind: "procfs",
            reason: "invalid_proc_tcp_record",
            raw_line,
          });
          continue;
        }
        if (parsed_listener.inode !== undefined) {
          listeners_by_inode.set(parsed_listener.inode, parsed_listener);
        } else {
          const synthetic_inode = Number.MAX_SAFE_INTEGER - listeners_by_inode.size;
          listeners_by_inode.set(synthetic_inode, parsed_listener);
        }
        continue;
      }
      if (normalized_line.startsWith("__MAP__\t")) {
        const fields = normalized_line.split("\t");
        if (fields.length < 4) {
          continue;
        }
        const inode = ParseOptionalInteger(fields[1]);
        if (inode === undefined) {
          continue;
        }
        inode_map.set(inode, {
          pid: ParseOptionalInteger(fields[2]),
          fd: ParseOptionalInteger(fields[3]),
        });
        continue;
      }
      if (normalized_line.startsWith("__ERR__\t")) {
        const fields = normalized_line.split("\t");
        params.scan_errors.push({
          source_kind: "procfs",
          reason: fields[1] ?? "unknown",
        });
      }
    }
    const listeners: proxmox_lxc_tcp_listener_t[] = [];
    for (const [inode_key, listener] of listeners_by_inode.entries()) {
      const inode_record = inode_map.get(inode_key);
      listeners.push({
        ...listener,
        pid: inode_record?.pid ?? listener.pid,
        fd: inode_record?.fd ?? listener.fd,
      });
    }
    return {
      listeners,
      truncated,
    };
  }

  private async collectInterfaceInventory(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    commands: string[];
  }): Promise<{
    interfaces: Map<string, lxc_interface_inventory_record_t>;
    scan_errors: proxmox_lxc_tcp_listener_scan_error_t[];
  }> {
    const scan_errors: proxmox_lxc_tcp_listener_scan_error_t[] = [];
    const interface_inventory = new Map<string, lxc_interface_inventory_record_t>();

    params.commands.push("interface_ip_probe");
    const ip_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildInterfaceIpProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (ip_result.truncated_output) {
      scan_errors.push({
        source_kind: "interface",
        reason: "interface_ip_probe_truncated",
      });
    }
    const parsed_from_ip = ParseInterfaceIpProbeOutput(ip_result.stdout);
    scan_errors.push(...ParseInterfaceProbeErrors(ip_result.stdout));
    for (const interface_record of parsed_from_ip) {
      UpsertInterfaceInventory({
        interface_inventory,
        interface_record,
      });
    }
    if (interface_inventory.size > 0) {
      return {
        interfaces: interface_inventory,
        scan_errors,
      };
    }

    params.commands.push("interface_ifconfig_probe");
    const ifconfig_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildInterfaceIfconfigProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (ifconfig_result.truncated_output) {
      scan_errors.push({
        source_kind: "interface",
        reason: "interface_ifconfig_probe_truncated",
      });
    }
    const parsed_from_ifconfig = ParseIfconfigProbeOutput(ifconfig_result.stdout);
    scan_errors.push(...ParseInterfaceProbeErrors(ifconfig_result.stdout));
    for (const interface_record of parsed_from_ifconfig) {
      UpsertInterfaceInventory({
        interface_inventory,
        interface_record,
      });
    }
    if (interface_inventory.size > 0) {
      return {
        interfaces: interface_inventory,
        scan_errors,
      };
    }

    params.commands.push("interface_base_probe");
    const base_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildInterfaceBaseProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (base_result.truncated_output) {
      scan_errors.push({
        source_kind: "interface",
        reason: "interface_base_probe_truncated",
      });
    }
    const parsed_base_names = ParseInterfaceBaseProbeOutput(base_result.stdout);
    scan_errors.push(...ParseInterfaceProbeErrors(base_result.stdout));
    for (const interface_name of parsed_base_names) {
      UpsertInterfaceInventory({
        interface_inventory,
        interface_record: {
          interface_name,
          is_loopback: interface_name === "lo",
          ipv4_addresses: [],
          ipv6_addresses: [],
        },
      });
    }
    if (interface_inventory.size === 0) {
      scan_errors.push({
        source_kind: "interface",
        reason: "interface_probe_unavailable",
      });
    }
    return {
      interfaces: interface_inventory,
      scan_errors,
    };
  }

  private async collectPsProcessRecords(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    user_filter?: Set<string>;
    pid_filter?: Set<number>;
    process_parse_warnings: proxmox_lxc_process_parse_warning_t[];
    process_scan_errors: proxmox_lxc_process_scan_error_t[];
  }): Promise<proxmox_lxc_process_record_t[]> {
    const ps_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildProcessPsProbeShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    const process_records: proxmox_lxc_process_record_t[] = [];
    if (ps_result.truncated_output) {
      params.process_scan_errors.push({
        source_kind: "ps",
        reason: "ps_output_truncated",
      });
    }
    for (const raw_line of ps_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line) {
        continue;
      }
      const fields = normalized_line.split("\t");
      if (fields.length < 17) {
        params.process_parse_warnings.push({
          source_kind: "ps",
          reason: "invalid_ps_record_field_count",
          raw_line,
        });
        continue;
      }
      const pid = ParseOptionalInteger(fields[0]);
      if (pid === undefined) {
        params.process_parse_warnings.push({
          source_kind: "ps",
          reason: "invalid_ps_pid",
          raw_line,
        });
        continue;
      }
      if (params.pid_filter && !params.pid_filter.has(pid)) {
        continue;
      }
      const username = NormalizeOptionalText(fields[6]) ?? undefined;
      if (params.user_filter && username && !params.user_filter.has(username.toLowerCase())) {
        continue;
      }
      const cmdline = NormalizeOptionalText(fields[16]) ?? "";
      const comm = NormalizeOptionalText(fields[15]) ?? "[unknown]";
      process_records.push({
        pid,
        ppid: ParseOptionalInteger(fields[1]),
        pgid: ParseOptionalInteger(fields[2]),
        sid: ParseOptionalInteger(fields[3]),
        uid: ParseOptionalInteger(fields[4]),
        gid: ParseOptionalInteger(fields[5]),
        username,
        group_name: NormalizeOptionalText(fields[7]) ?? undefined,
        comm,
        argv: cmdline.length > 0 ? cmdline.split(/\s+/g).filter((value) => value.length > 0) : [comm],
        cmdline,
        state: MapProcessState(fields[8]),
        elapsed_time: NormalizeOptionalText(fields[9]) ?? undefined,
        cpu_percent: ParseOptionalNumber(fields[10]),
        memory_percent: ParseOptionalNumber(fields[11]),
        rss_kb: ParseOptionalInteger(fields[12]),
        vsz_kb: ParseOptionalInteger(fields[13]),
        tty: NormalizeOptionalText(fields[14]) ?? undefined,
        source_kind: "ps",
      });
    }
    return process_records;
  }

  private async collectProcFallbackProcessRecords(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    user_filter?: Set<string>;
    pid_filter?: Set<number>;
    process_parse_warnings: proxmox_lxc_process_parse_warning_t[];
    process_scan_errors: proxmox_lxc_process_scan_error_t[];
  }): Promise<proxmox_lxc_process_record_t[]> {
    const fallback_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: BuildProcessPidFallbackShellCommand(),
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    if (fallback_result.truncated_output) {
      params.process_scan_errors.push({
        source_kind: "procfs",
        reason: "proc_pid_list_truncated",
      });
    }
    const process_records: proxmox_lxc_process_record_t[] = [];
    for (const raw_line of fallback_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line) {
        continue;
      }
      const pid = ParseOptionalInteger(normalized_line);
      if (pid === undefined) {
        params.process_parse_warnings.push({
          source_kind: "procfs",
          reason: "invalid_proc_pid_record",
          raw_line,
        });
        continue;
      }
      if (params.pid_filter && !params.pid_filter.has(pid)) {
        continue;
      }
      process_records.push({
        pid,
        comm: "[unknown]",
        argv: ["[unknown]"],
        cmdline: "",
        state: "unknown",
        source_kind: "procfs",
      });
    }
    return process_records;
  }

  private async collectProcDetails(params: {
    node_id: string;
    container_id: string;
    timeout_ms: number;
    max_output_bytes: number;
    process_records: proxmox_lxc_process_record_t[];
    include_environment: boolean;
    include_threads: boolean;
    environment_mode: proxmox_lxc_process_environment_mode_t;
    max_environment_bytes_per_process: number;
    max_environment_bytes_total: number;
  }): Promise<{
    processes: proxmox_lxc_process_record_t[];
    scan_errors: proxmox_lxc_process_scan_error_t[];
    parse_warnings: proxmox_lxc_process_parse_warning_t[];
    truncated: boolean;
    commands: string[];
  }> {
    const scan_errors: proxmox_lxc_process_scan_error_t[] = [];
    const parse_warnings: proxmox_lxc_process_parse_warning_t[] = [];
    const process_lookup = new Map<number, proxmox_lxc_process_record_t>();
    for (const process_record of params.process_records) {
      process_lookup.set(process_record.pid, {
        ...process_record,
      });
    }
    const pid_list = params.process_records.map((process_record) => process_record.pid);
    if (pid_list.length === 0) {
      return {
        processes: [],
        scan_errors,
        parse_warnings,
        truncated: false,
        commands: [],
      };
    }

    const command_list: string[] = [];
    const proc_details_command = BuildProcessProcDetailsShellCommand({
      pid_list,
      include_environment: params.include_environment,
      include_threads: params.include_threads,
      max_environment_bytes_per_process: params.max_environment_bytes_per_process,
    });
    command_list.push("proc_details_probe");
    const proc_details_result = await this.runCommand({
      node_id: params.node_id,
      container_id: params.container_id,
      shell_mode: true,
      shell_command: proc_details_command,
      timeout_ms: params.timeout_ms,
      max_output_bytes: params.max_output_bytes,
      fail_on_non_zero_exit: false,
      retry_allowed: false,
    });
    let truncated = proc_details_result.truncated_output;
    if (proc_details_result.truncated_output) {
      scan_errors.push({
        source_kind: "procfs",
        reason: "proc_details_output_truncated",
      });
    }

    let total_environment_bytes = 0;
    for (const raw_line of proc_details_result.stdout.split(/\r?\n/g)) {
      const normalized_line = raw_line.trim();
      if (!normalized_line) {
        continue;
      }
      if (normalized_line.startsWith("__ERR__\t")) {
        const parts = normalized_line.split("\t");
        scan_errors.push({
          source_kind: "procfs",
          pid: ParseOptionalInteger(parts[1]),
          reason: parts[2] ?? "unknown",
        });
        continue;
      }
      if (normalized_line.startsWith("__PROC__\t")) {
        const fields = normalized_line.split("\t");
        if (fields.length < 17) {
          parse_warnings.push({
            source_kind: "procfs",
            reason: "invalid_proc_detail_field_count",
            raw_line,
          });
          continue;
        }
        const pid = ParseOptionalInteger(fields[1]);
        if (pid === undefined) {
          parse_warnings.push({
            source_kind: "procfs",
            reason: "invalid_proc_detail_pid",
            raw_line,
          });
          continue;
        }
        const target_process = process_lookup.get(pid);
        if (!target_process) {
          continue;
        }
        target_process.uid = ParseOptionalInteger(fields[2]) ?? target_process.uid;
        target_process.gid = ParseOptionalInteger(fields[3]) ?? target_process.gid;
        target_process.thread_count = ParseOptionalInteger(fields[4]) ?? target_process.thread_count;
        target_process.open_fd_count = ParseOptionalInteger(fields[5]) ?? target_process.open_fd_count;
        target_process.comm = NormalizeOptionalText(fields[6]) ?? target_process.comm;
        const cmdline = NormalizeOptionalText(fields[7]);
        if (cmdline !== null) {
          target_process.cmdline = cmdline;
          target_process.argv = cmdline.split(/\s+/g).filter((value) => value.length > 0);
        }
        target_process.exe_path = NormalizeOptionalText(fields[8]) ?? target_process.exe_path;
        target_process.cwd_path = NormalizeOptionalText(fields[9]) ?? target_process.cwd_path;
        target_process.root_path = NormalizeOptionalText(fields[10]) ?? target_process.root_path;
        const status_state = NormalizeOptionalText(fields[11]) ?? undefined;
        if (status_state) {
          target_process.state = MapProcessState(status_state);
        }
        target_process.rss_kb = ParseOptionalInteger(fields[12]) ?? target_process.rss_kb;
        target_process.vsz_kb = ParseOptionalInteger(fields[13]) ?? target_process.vsz_kb;
        target_process.username = NormalizeOptionalText(fields[14]) ?? target_process.username;
        target_process.group_name = NormalizeOptionalText(fields[15]) ?? target_process.group_name;
        target_process.start_time = NormalizeOptionalText(fields[16]) ?? target_process.start_time;
        continue;
      }
      if (normalized_line.startsWith("__ENV__\t")) {
        const fields = normalized_line.split("\t");
        if (fields.length < 3) {
          continue;
        }
        const pid = ParseOptionalInteger(fields[1]);
        if (pid === undefined) {
          continue;
        }
        const target_process = process_lookup.get(pid);
        if (!target_process) {
          continue;
        }
        const raw_env_payload = fields.slice(2).join("\t");
        total_environment_bytes += raw_env_payload.length;
        if (total_environment_bytes > params.max_environment_bytes_total) {
          truncated = true;
          scan_errors.push({
            source_kind: "procfs",
            pid,
            reason: "environment_total_limit_exceeded",
          });
          continue;
        }
        const environment_entries = raw_env_payload
          .split("__ENV_NL__")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
        const environment_map: Record<string, string> = {};
        const environment_keys: string[] = [];
        for (const environment_entry of environment_entries) {
          const separator_index = environment_entry.indexOf("=");
          if (separator_index <= 0) {
            continue;
          }
          const key = environment_entry.slice(0, separator_index).trim();
          const value = environment_entry.slice(separator_index + 1);
          if (!key) {
            continue;
          }
          environment_keys.push(key);
          if (params.environment_mode === "sanitized_values") {
            environment_map[key] = IsSensitiveEnvironmentKey(key) ? "[REDACTED]" : value;
          }
        }
        if (params.environment_mode === "keys_only") {
          target_process.environment_keys = [...new Set(environment_keys)];
        } else if (params.environment_mode === "sanitized_values") {
          target_process.environment = environment_map;
          target_process.environment_keys = Object.keys(environment_map);
        }
      }
    }

    return {
      processes: Array.from(process_lookup.values()),
      scan_errors,
      parse_warnings,
      truncated,
      commands: command_list,
    };
  }

  /**
   * Example:
   * const upload_result = await client.lxc_service.uploadFile({
   *   node_id: "pve1",
   *   container_id: 101,
   *   source_file_path: "/tmp/config.yaml",
   *   target_file_path: "/root/config.yaml",
   *   verify_checksum: true,
   * });
   */
  public async uploadFile(params: proxmox_lxc_upload_file_input_i): Promise<proxmox_lxc_upload_file_result_t> {
    const reference = BuildLxcReference(params);
    const normalized = NormalizeUploadFileInput(params);
    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(container_status_response.data as Record<string, unknown>);
    if (container_status !== undefined && container_status.toLowerCase() !== "running") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "uploadFile requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const node_connection = this.request_client.resolveNode(reference.node_id);
    if (!ShouldUseSshShellBackend(node_connection)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "LXC uploadFile requires node shell_backend=ssh_pct with ssh_shell configuration.",
        details: {
          field: "node.ssh_shell",
          value: node_connection.node_id,
        },
      });
    }

    try {
      return await this.ssh_pct_shell_backend.uploadFile({
        node_connection,
        upload_input: {
          node_id: reference.node_id,
          container_id: reference.container_id,
          source_file_path: normalized.source_file_path,
          target_file_path: normalized.target_file_path,
          owner_user: normalized.owner_user,
          owner_group: normalized.owner_group,
          mode_octal: normalized.mode_octal,
          create_parent_directories: normalized.create_parent_directories,
          overwrite: normalized.overwrite,
          verify_checksum: normalized.verify_checksum,
          timeout_ms: normalized.timeout_ms,
          chunk_size_bytes: normalized.chunk_size_bytes,
          high_water_mark_bytes: normalized.high_water_mark_bytes,
        },
      });
    } catch (error) {
      if (error instanceof ProxmoxLxcUploadError || error instanceof ProxmoxValidationError) {
        throw error;
      }
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_transfer_failed",
        message: "LXC file upload failed.",
        details: {
          field: "lxc.upload_file",
          value: `${reference.node_id}/${reference.container_id}`,
        },
        cause: error,
      });
    }
  }

  /**
   * Example:
   * const upload_result = await client.lxc_service.uploadDirectory({
   *   node_id: "pve1",
   *   container_id: 101,
   *   source_directory_path: "/tmp/app-config",
   *   target_directory_path: "/opt/app-config",
   *   overwrite: true,
   * });
   */
  public async uploadDirectory(
    params: proxmox_lxc_upload_directory_input_i,
  ): Promise<proxmox_lxc_upload_directory_result_t> {
    const reference = BuildLxcReference(params);
    const normalized = NormalizeUploadDirectoryInput(params);
    const container_status_response = await this.getContainer({
      node_id: reference.node_id,
      container_id: reference.container_id,
    });
    const container_status = ResolveContainerStatus(
      container_status_response.data as Record<string, unknown>,
    );
    if (
      container_status !== undefined &&
      container_status.toLowerCase() !== "running"
    ) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "uploadDirectory requires a running container.",
        details: {
          field: "container.status",
          value: container_status,
        },
      });
    }

    const node_connection = this.request_client.resolveNode(reference.node_id);
    if (!ShouldUseSshShellBackend(node_connection)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message:
          "LXC uploadDirectory requires node shell_backend=ssh_pct with ssh_shell configuration.",
        details: {
          field: "node.ssh_shell",
          value: node_connection.node_id,
        },
      });
    }

    try {
      return await this.ssh_pct_shell_backend.uploadDirectory({
        node_connection,
        upload_input: {
          node_id: reference.node_id,
          container_id: reference.container_id,
          source_directory_path: normalized.source_directory_path,
          target_directory_path: normalized.target_directory_path,
          create_parent_directories: normalized.create_parent_directories,
          overwrite: normalized.overwrite,
          verify_checksum: normalized.verify_checksum,
          timeout_ms: normalized.timeout_ms,
          chunk_size_bytes: normalized.chunk_size_bytes,
          high_water_mark_bytes: normalized.high_water_mark_bytes,
          include_patterns: normalized.include_patterns,
          exclude_patterns: normalized.exclude_patterns,
          pattern_mode: normalized.pattern_mode,
          symlink_policy: normalized.symlink_policy,
          include_hidden: normalized.include_hidden,
        },
      });
    } catch (error) {
      if (
        error instanceof ProxmoxLxcUploadError ||
        error instanceof ProxmoxValidationError
      ) {
        throw error;
      }
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_directory_extract_failed",
        message: "LXC directory upload failed.",
        details: {
          field: "lxc.upload_directory",
          value: `${reference.node_id}/${reference.container_id}`,
        },
        cause: error,
      });
    }
  }

  /**
   * Example:
   * const session = await client.lxc_service.openTerminalSession({
   *   node_id: "pve1",
   *   container_id: 101,
   *   shell_mode: true,
   *   shell_command: "/bin/bash -il",
   * });
   */
  public async openTerminalSession(params: proxmox_lxc_terminal_open_input_i): Promise<proxmox_lxc_terminal_session_t> {
    const reference = BuildLxcReference(params);
    const normalized = NormalizeTerminalOpenInput(params);
    const command_to_run = BuildContainerCommand(normalized);
    const should_send_initial_command = ShouldSendInitialTerminalCommand({
      shell_mode: normalized.shell_mode,
      command_argv: params.command_argv,
    });
    const node_connection = this.request_client.resolveNode(reference.node_id);
    if (!ShouldUseSshShellBackend(node_connection)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "LXC terminal requires node shell_backend=ssh_pct with ssh_shell configuration.",
        details: {
          field: "node.ssh_shell",
          value: node_connection.node_id,
        },
      });
    }

    let session: proxmox_lxc_terminal_session_t;
    try {
      session = await this.ssh_pct_shell_backend.openInteractiveSession({
        node_connection,
        session_input: {
          node_id: reference.node_id,
          container_id: reference.container_id,
          command: command_to_run,
          columns: normalized.columns,
          rows: normalized.rows,
          timeout_ms: normalized.timeout_ms,
        },
      });
    } catch (error) {
      throw new ProxmoxLxcExecError({
        code: "proxmox.lxc.exec_start_failed",
        message: "Failed to open SSH LXC terminal session.",
        details: {
          field: "lxc.open_terminal",
          value: `${reference.node_id}/${reference.container_id}`,
        },
        cause: error,
      });
    }

    if (should_send_initial_command) {
      try {
        await this.ssh_pct_shell_backend.sendInput({
          session_id: session.session_id,
          input_text: `${command_to_run}\n`,
        });
      } catch (error) {
        await this.ssh_pct_shell_backend.close({
          session_id: session.session_id,
          code: 4501,
          reason: "session_setup_failed",
        });
        throw new ProxmoxLxcExecError({
          code: "proxmox.lxc.exec_start_failed",
          message: "Failed to send initial LXC command to SSH terminal session.",
          details: {
            field: "lxc.open_terminal.initial_command",
            value: session.session_id,
          },
          cause: error,
        });
      }
    }

    return session;
  }

  public async sendTerminalInput(params: proxmox_lxc_terminal_send_input_i): Promise<void> {
    const input_text = params.input_text;
    if (!input_text) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "input_text is required.",
        details: {
          field: "input_text",
        },
      });
    }
    if (!this.ssh_pct_shell_backend.ownsSession(params.session_id)) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "Terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: params.session_id,
        },
      });
    }
    try {
      await this.ssh_pct_shell_backend.sendInput({
        session_id: params.session_id,
        input_text,
      });
    } catch (error) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_io_failed",
        message: "Failed to write input to SSH terminal session.",
        details: {
          field: "terminal.send_input",
          value: params.session_id,
        },
        cause: error,
      });
    }
  }

  public async resizeTerminal(params: proxmox_lxc_terminal_resize_input_i): Promise<proxmox_lxc_terminal_session_t> {
    ValidateTerminalSize({
      columns: params.columns,
      rows: params.rows,
    });
    if (!this.ssh_pct_shell_backend.ownsSession(params.session_id)) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "Terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: params.session_id,
        },
      });
    }
    await this.ssh_pct_shell_backend.resize({
      session_id: params.session_id,
      columns: params.columns,
      rows: params.rows,
    });
    const ssh_session = this.ssh_pct_shell_backend.getSession({
      session_id: params.session_id,
    });
    if (!ssh_session) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "SSH terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: params.session_id,
        },
      });
    }
    return ssh_session;
  }

  public async readTerminalEvents(params: proxmox_lxc_terminal_read_events_input_i): Promise<proxmox_lxc_terminal_event_t[]> {
    if (!this.ssh_pct_shell_backend.ownsSession(params.session_id)) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "Terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: params.session_id,
        },
      });
    }
    return this.ssh_pct_shell_backend.readEvents({
      session_id: params.session_id,
      max_events: params.max_events,
    });
  }

  public getTerminalSession(params: proxmox_lxc_terminal_session_query_i): proxmox_lxc_terminal_session_t {
    const ssh_session = this.ssh_pct_shell_backend.getSession({
      session_id: params.session_id,
    });
    if (!ssh_session) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "Terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: params.session_id,
        },
      });
    }
    return ssh_session;
  }

  public getCommandResult(params: proxmox_lxc_terminal_session_query_i): proxmox_lxc_run_command_result_t | undefined {
    return this.command_results.get(params.session_id);
  }

  public async closeTerminalSession(params: proxmox_lxc_terminal_close_input_i): Promise<void> {
    if (!this.ssh_pct_shell_backend.ownsSession(params.session_id)) {
      throw new ProxmoxTerminalSessionError({
        code: "proxmox.lxc.terminal_session_not_found",
        message: "Terminal session was not found or already closed.",
        details: {
          field: "session_id",
          value: params.session_id,
        },
      });
    }
    await this.ssh_pct_shell_backend.close({
      session_id: params.session_id,
      reason: params.reason,
      code: params.code,
    });
  }

  public async waitForTask(params: {
    operation: "create" | "update" | "delete" | "start" | "stop" | "migrate" | "snapshot" | "restore";
    node_id: string;
    task_id: string;
    timeout_ms?: number;
  }): Promise<proxmox_task_result_t> {
    const request_node_id = ValidateNodeId(params.node_id);
    if (this.task_poller === undefined || !this.task_polling_enabled) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Task polling is disabled or not configured.",
        details: {
          field: "task_poller",
        },
      });
    }
    const node_connection = this.request_client.resolveNode(request_node_id);
    const auth_header = await node_connection.auth_provider.getAuthHeader();
    return this.task_poller!.waitForTaskCompletion({
      node: request_node_id,
      task_id: params.task_id,
      host: node_connection.host,
      protocol: node_connection.protocol,
      port: node_connection.port,
      verify_tls: node_connection.verify_tls,
      request_timeout_ms: params.timeout_ms,
      request_headers: {
        Authorization: auth_header,
      },
      options: this.task_poll_options,
    });
  }
  
  private async resolveTaskResult(params: {
    response_data: unknown;
    node_id: string;
    container_id: string;
    operation: "create" | "update" | "delete" | "start" | "stop" | "migrate" | "snapshot" | "restore";
    wait_for_task?: boolean;
    timeout_ms?: number;
  }): Promise<proxmox_lxc_task_result_t> {
    const task_id = ResolveTaskId(
      params.response_data,
      params.container_id,
      params.operation,
      params.node_id,
    );

    if (params.wait_for_task !== true) {
      return {
        resource_type: "lxc",
        node_id: params.node_id,
        task_id,
        resource_id: params.container_id,
        operation: params.operation,
      };
    }

    if (this.task_poller !== undefined && this.task_polling_enabled) {
      const node_connection = this.request_client.resolveNode(params.node_id);
      const auth_header = await node_connection.auth_provider.getAuthHeader();
      const completed_task = await this.task_poller.waitForTaskCompletion({
        node: params.node_id,
        task_id,
        host: node_connection.host,
        protocol: node_connection.protocol,
        port: node_connection.port,
        verify_tls: node_connection.verify_tls,
        request_timeout_ms: params.timeout_ms,
        request_headers: {
          Authorization: auth_header,
        },
        options: this.task_poll_options,
      });
      return {
        resource_type: "lxc",
        node_id: params.node_id,
        task_id,
        resource_id: params.container_id,
        operation: params.operation,
        status: completed_task.status,
        exit_status: completed_task.exit_status,
        percent: completed_task.percent,
        message: completed_task.message,
        raw: completed_task.raw,
      };
    }

    return {
      resource_type: "lxc",
      node_id: params.node_id,
      task_id,
      resource_id: params.container_id,
      operation: params.operation,
      status: "running",
      raw: params.response_data,
    };
  }
}

function BuildLxcListQuery(params: proxmox_lxc_list_query_i): {
  node_id?: string;
  path: string;
  request_query: { [key: string]: string | number | boolean };
} {
  const request_query: { [key: string]: string | number | boolean } = {};
  const node_id = ValidateOptionalNodeId(params.node_id);
  if (params.running !== undefined) {
    request_query.status = params.running ? "running" : "stopped";
  }
  if (params.pool !== undefined) {
    const pool = params.pool.trim();
    if (!pool) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "pool must not be empty.",
        details: {
          field: "pool",
        },
      });
    }
    request_query.pool = pool;
  }

  if (node_id !== undefined) {
    return {
      node_id,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/lxc`,
      request_query,
    };
  }

  request_query.type = "lxc";
  if (params.full !== undefined) {
    request_query.full = params.full;
  }

  return {
    node_id: undefined,
    path: "/api2/json/cluster/resources",
    request_query,
  };
}

function BuildLxcReference(params: proxmox_lxc_reference_request_i): {
  node_id: string;
  container_id: string;
} {
  return {
    node_id: ValidateNodeId(params.node_id),
    container_id: ValidateContainerId(params.container_id, "container_id"),
  };
}

function BuildCreateUpdateBody(raw_config: Record<string, unknown>, _field: string): Record<string, unknown> {
  if (!raw_config || typeof raw_config !== "object" || Array.isArray(raw_config)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "config must be an object.",
      details: {
        field: "config",
      },
    });
  }

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(raw_config)) {
    if (key.trim()) {
      sanitized[key.trim()] = raw_config[key];
    }
  }
  if (Object.keys(sanitized).length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "config must contain at least one value.",
      details: {
        field: "config",
      },
    });
  }
  return sanitized;
}

function BuildDeleteBody(params: {
  purge?: boolean;
  force?: boolean;
}): Record<string, number> | undefined {
  const keys_present = params.purge !== undefined || params.force !== undefined;
  if (!keys_present) {
    return undefined;
  }
  return {
    purge: params.purge === true ? 1 : 0,
    force: params.force === true ? 1 : 0,
  };
}

function ResolveTaskId(
  raw_task: unknown,
  _container_id: string,
  operation: string,
  node_id: string,
): string {
  if (typeof raw_task === "string" && raw_task.trim().length > 0) {
    return raw_task.trim();
  }

  if (raw_task !== null && raw_task !== undefined && typeof raw_task === "object") {
    const typed = raw_task as Record<string, unknown>;
    if (typeof typed.upid === "string" && typed.upid.trim().length > 0) {
      return typed.upid.trim();
    }
    if (typeof typed.task === "string" && typed.task.trim().length > 0) {
      return typed.task.trim();
    }
    if (typeof typed.task_id === "string" && typed.task_id.trim().length > 0) {
      return typed.task_id.trim();
    }
  }

  throw new ProxmoxValidationError({
    code: "proxmox.validation.missing_input",
    message: `${operation} response did not include a task id.`,
    details: {
      field: `${operation}.task_id`,
      value: node_id,
    },
  });
}

function ValidateContainerId(raw_container_id: string | number, field: string): string {
  const normalized = typeof raw_container_id === "number"
    ? String(raw_container_id)
    : raw_container_id.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${field} is required and cannot be empty.`,
      details: {
        field,
      },
    });
  }
  if (!/^\d+$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${field} must be a numeric identifier.`,
      details: {
        field,
      },
    });
  }
  return normalized;
}

function ValidateNodeId(raw_node_id: string): string {
  if (!raw_node_id.trim()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id is required and cannot be empty.",
      details: {
        field: "node_id",
      },
    });
  }
  return raw_node_id.trim();
}

function ValidateOptionalNodeId(raw_node_id?: string): string | undefined {
  if (raw_node_id === undefined) {
    return undefined;
  }
  return ValidateNodeId(raw_node_id);
}

function ValidateSnapshotName(snapshot_name: string): string {
  const normalized = snapshot_name.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "snapshot_name is required and cannot be empty.",
      details: {
        field: "snapshot_name",
      },
    });
  }
  return normalized;
}

function ResolveContainerStatus(raw_record: Record<string, unknown>): string | undefined {
  const status = raw_record.status;
  if (typeof status !== "string") {
    return undefined;
  }
  const normalized = status.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function ParseOsReleaseFields(raw_text: string): Record<string, string> {
  const parsed_fields: Record<string, string> = {};
  const raw_lines = raw_text.split(/\r?\n/g);
  for (const raw_line of raw_lines) {
    const normalized_line = raw_line.trim();
    if (!normalized_line || normalized_line.startsWith("#")) {
      continue;
    }
    const field_match = normalized_line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!field_match) {
      continue;
    }
    const field_name = field_match[1].trim().toUpperCase();
    const field_value = DecodeOsReleaseValue(field_match[2].trim());
    if (field_value.length > 0) {
      parsed_fields[field_name] = field_value;
    }
  }
  return parsed_fields;
}

function DecodeOsReleaseValue(raw_value: string): string {
  if (raw_value.length >= 2) {
    const first_char = raw_value.charAt(0);
    const last_char = raw_value.charAt(raw_value.length - 1);
    if ((first_char === "\"" || first_char === "'") && first_char === last_char) {
      const quoted_value = raw_value.slice(1, -1);
      return quoted_value.replace(/\\(.)/g, "$1").trim();
    }
  }
  return raw_value.replace(/\\(.)/g, "$1").trim();
}

function ParseLsbReleaseFields(raw_text: string): Record<string, string> {
  const parsed_fields: Record<string, string> = {};
  const raw_lines = raw_text.split(/\r?\n/g);
  for (const raw_line of raw_lines) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    const delimiter_index = normalized_line.indexOf(":");
    if (delimiter_index <= 0) {
      continue;
    }
    const raw_key = normalized_line.slice(0, delimiter_index).trim();
    const raw_value = normalized_line.slice(delimiter_index + 1).trim();
    if (!raw_key || !raw_value) {
      continue;
    }
    const normalized_key = raw_key.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    if (normalized_key.length === 0) {
      continue;
    }
    parsed_fields[normalized_key] = raw_value;
  }
  return parsed_fields;
}

function NormalizeSingleLine(raw_text: string | undefined): string | null {
  if (raw_text === undefined) {
    return null;
  }
  const first_non_empty_line = raw_text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return first_non_empty_line ?? null;
}

function NormalizeOptionalText(raw_text: string | undefined): string | null {
  if (raw_text === undefined) {
    return null;
  }
  const normalized_text = raw_text.trim();
  return normalized_text.length > 0 ? normalized_text : null;
}

function NormalizeDistributionId(raw_value: string | undefined): string | null {
  const normalized = NormalizeOptionalText(raw_value);
  if (normalized === null) {
    return null;
  }
  return normalized.toLowerCase().replace(/\s+/g, "_");
}

function BuildDerivedDistributionPrettyName(params: {
  distribution_name: string | null;
  distribution_version: string | null;
}): string | null {
  if (params.distribution_name && params.distribution_version) {
    return `${params.distribution_name} ${params.distribution_version}`;
  }
  if (params.distribution_name) {
    return params.distribution_name;
  }
  if (params.distribution_version) {
    return params.distribution_version;
  }
  return null;
}

function HasMeaningfulText(raw_text: string | null): boolean {
  return raw_text !== null && raw_text.trim().length > 0;
}

function ShouldProbeLsbRelease(os_release_fields: Record<string, string>): boolean {
  return !HasMeaningfulText(NormalizeDistributionId(os_release_fields.ID))
    && !HasMeaningfulText(NormalizeOptionalText(os_release_fields.NAME))
    && !HasMeaningfulText(NormalizeOptionalText(os_release_fields.PRETTY_NAME));
}

interface proxmox_cron_probe_section_i {
  source_path: string;
  content: string;
}

function BuildSystemCronProbeShellCommand(): string {
  return [
    "# __PROXMOX_CRON_PROBE_SYSTEM__",
    "if [ -f /etc/crontab ]; then",
    "  if [ -r /etc/crontab ]; then",
    "    printf '__SRC__\\t%s\\n' '/etc/crontab'",
    "    cat /etc/crontab 2>/dev/null || printf '__ERR__\\t%s\\t%s\\n' '/etc/crontab' 'read_failed'",
    "  else",
    "    printf '__ERR__\\t%s\\t%s\\n' '/etc/crontab' 'permission_denied'",
    "  fi",
    "fi",
    "if [ -d /etc/cron.d ]; then",
    "  for cron_file in /etc/cron.d/*; do",
    "    [ -f \"$cron_file\" ] || continue",
    "    if [ -r \"$cron_file\" ]; then",
    "      printf '__SRC__\\t%s\\n' \"$cron_file\"",
    "      cat \"$cron_file\" 2>/dev/null || printf '__ERR__\\t%s\\t%s\\n' \"$cron_file\" 'read_failed'",
    "    else",
    "      printf '__ERR__\\t%s\\t%s\\n' \"$cron_file\" 'permission_denied'",
    "    fi",
    "  done",
    "fi",
  ].join("\n");
}

function BuildUserCronProbeShellCommand(): string {
  return [
    "# __PROXMOX_CRON_PROBE_USER__",
    "if [ -d /var/spool/cron/crontabs ]; then",
    "  for cron_file in /var/spool/cron/crontabs/*; do",
    "    [ -f \"$cron_file\" ] || continue",
    "    if [ -r \"$cron_file\" ]; then",
    "      printf '__SRC__\\t%s\\n' \"$cron_file\"",
    "      cat \"$cron_file\" 2>/dev/null || printf '__ERR__\\t%s\\t%s\\n' \"$cron_file\" 'read_failed'",
    "    else",
    "      printf '__ERR__\\t%s\\t%s\\n' \"$cron_file\" 'permission_denied'",
    "    fi",
    "  done",
    "fi",
    "if [ -d /var/spool/cron ]; then",
    "  for cron_file in /var/spool/cron/*; do",
    "    [ -f \"$cron_file\" ] || continue",
    "    if [ -r \"$cron_file\" ]; then",
    "      printf '__SRC__\\t%s\\n' \"$cron_file\"",
    "      cat \"$cron_file\" 2>/dev/null || printf '__ERR__\\t%s\\t%s\\n' \"$cron_file\" 'read_failed'",
    "    else",
    "      printf '__ERR__\\t%s\\t%s\\n' \"$cron_file\" 'permission_denied'",
    "    fi",
    "  done",
    "fi",
  ].join("\n");
}

function ParseCronProbeSections(params: {
  probe_output: string;
}): {
  sections: proxmox_cron_probe_section_i[];
  scan_errors: proxmox_lxc_cron_scan_error_t[];
} {
  const sections: proxmox_cron_probe_section_i[] = [];
  const scan_errors: proxmox_lxc_cron_scan_error_t[] = [];
  let active_source_path: string | undefined;
  let active_lines: string[] = [];

  const finalize_active_section = (): void => {
    if (active_source_path === undefined) {
      return;
    }
    sections.push({
      source_path: active_source_path,
      content: active_lines.join("\n"),
    });
    active_source_path = undefined;
    active_lines = [];
  };

  const output_lines = params.probe_output.split(/\r?\n/g);
  for (const output_line of output_lines) {
    if (output_line.startsWith("__SRC__\t")) {
      finalize_active_section();
      active_source_path = output_line.slice("__SRC__\t".length).trim();
      continue;
    }
    if (output_line.startsWith("__ERR__\t")) {
      finalize_active_section();
      const parts = output_line.split("\t");
      const source_path = (parts[1] ?? "__unknown__").trim();
      const reason = (parts[2] ?? "unknown").trim();
      scan_errors.push({
        source_path,
        source_kind: ResolveCronSourceKind(source_path),
        reason,
      });
      continue;
    }
    if (active_source_path !== undefined) {
      active_lines.push(output_line);
    }
  }
  finalize_active_section();

  return {
    sections,
    scan_errors,
  };
}

function ResolveCronSourceKind(source_path: string): proxmox_lxc_cron_source_kind_t {
  if (source_path.startsWith("/etc/cron.d/")) {
    return "cron_d";
  }
  if (source_path.startsWith("/var/spool/cron")) {
    return "user_spool";
  }
  return "system";
}

function ParseCronSourceContent(params: {
  source_path: string;
  source_kind: proxmox_lxc_cron_source_kind_t;
  content: string;
}): {
  jobs: proxmox_lxc_cron_job_t[];
  parse_warnings: proxmox_lxc_cron_parse_warning_t[];
} {
  const jobs: proxmox_lxc_cron_job_t[] = [];
  const parse_warnings: proxmox_lxc_cron_parse_warning_t[] = [];
  const raw_lines = params.content.split(/\r?\n/g);
  const default_user = ResolveCronUserFromSourcePath(params.source_path);

  for (let index = 0; index < raw_lines.length; index += 1) {
    const raw_line = raw_lines[index];
    const line_number = index + 1;
    const parsed_line_result = ParseCronJobLine({
      source_path: params.source_path,
      source_kind: params.source_kind,
      line_number,
      raw_line,
      default_user,
    });
    if (parsed_line_result.job) {
      jobs.push(parsed_line_result.job);
    }
    if (parsed_line_result.parse_warning) {
      parse_warnings.push(parsed_line_result.parse_warning);
    }
  }

  return {
    jobs,
    parse_warnings,
  };
}

function ResolveCronUserFromSourcePath(source_path: string): string | null {
  const path_segments = source_path.split("/").filter((segment) => segment.length > 0);
  if (path_segments.length === 0) {
    return null;
  }
  const user_segment = path_segments[path_segments.length - 1];
  if (!user_segment || user_segment === "crontab") {
    return null;
  }
  return user_segment;
}

function ParseCronJobLine(params: {
  source_path: string;
  source_kind: proxmox_lxc_cron_source_kind_t;
  line_number: number;
  raw_line: string;
  default_user: string | null;
}): {
  job?: proxmox_lxc_cron_job_t;
  parse_warning?: proxmox_lxc_cron_parse_warning_t;
} {
  const trimmed_line = params.raw_line.trim();
  if (trimmed_line.length === 0) {
    return {};
  }
  if (params.raw_line.trimStart().startsWith("#")) {
    return {};
  }
  const parse_candidate = trimmed_line;
  const is_disabled = false;

  if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(parse_candidate)) {
    return {};
  }

  const special_match = parse_candidate.match(/^(@[A-Za-z]+)\s+(.+)$/);
  if (special_match) {
    const special_token = special_match[1].toLowerCase();
    if (!IsSupportedSpecialSchedule(special_token)) {
      return {
        parse_warning: BuildCronParseWarning({
          source_path: params.source_path,
          source_kind: params.source_kind,
          line_number: params.line_number,
          raw_line: params.raw_line,
          reason: "unsupported_special_schedule",
        }),
      };
    }
    const special_schedule = special_token as proxmox_lxc_cron_special_schedule_t;
    if (params.source_kind === "system" || params.source_kind === "cron_d") {
      const system_special_match = parse_candidate.match(
        /^(@[A-Za-z]+)\s+([^\s]+)\s+(.+)$/,
      );
      if (!system_special_match) {
        return {
          parse_warning: BuildCronParseWarning({
            source_path: params.source_path,
            source_kind: params.source_kind,
            line_number: params.line_number,
            raw_line: params.raw_line,
            reason: "invalid_system_special_cron_format",
          }),
        };
      }
      const normalized_command = NormalizeCronCommand(system_special_match[3]);
      if (!normalized_command) {
        return {
          parse_warning: BuildCronParseWarning({
            source_path: params.source_path,
            source_kind: params.source_kind,
            line_number: params.line_number,
            raw_line: params.raw_line,
            reason: "missing_special_cron_command",
          }),
        };
      }
      return {
        job: {
          schedule_expression: special_schedule,
          special_schedule,
          run_as_user: system_special_match[2].trim(),
          command: normalized_command,
          is_disabled,
          source_path: params.source_path,
          source_kind: params.source_kind,
          line_number: params.line_number,
          raw_line: params.raw_line,
        },
      };
    }

    const user_special_command = NormalizeCronCommand(special_match[2]);
    if (!user_special_command) {
      return {
        parse_warning: BuildCronParseWarning({
          source_path: params.source_path,
          source_kind: params.source_kind,
          line_number: params.line_number,
          raw_line: params.raw_line,
          reason: "missing_special_cron_command",
        }),
      };
    }
    return {
      job: {
        schedule_expression: special_schedule,
        special_schedule,
        run_as_user: params.default_user,
        command: user_special_command,
        is_disabled,
        source_path: params.source_path,
        source_kind: params.source_kind,
        line_number: params.line_number,
        raw_line: params.raw_line,
      },
    };
  }

  if (params.source_kind === "system" || params.source_kind === "cron_d") {
    const system_match = parse_candidate.match(
      /^([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)$/,
    );
    if (!system_match) {
      return {
        parse_warning: BuildCronParseWarning({
          source_path: params.source_path,
          source_kind: params.source_kind,
          line_number: params.line_number,
          raw_line: params.raw_line,
          reason: "invalid_system_cron_format",
        }),
      };
    }
    if (!IsCronScheduleValid({
      minute: system_match[1],
      hour: system_match[2],
      day_of_month: system_match[3],
      month: system_match[4],
      day_of_week: system_match[5],
    })) {
      return {
        parse_warning: BuildCronParseWarning({
          source_path: params.source_path,
          source_kind: params.source_kind,
          line_number: params.line_number,
          raw_line: params.raw_line,
          reason: "invalid_system_cron_schedule",
        }),
      };
    }
    const normalized_command = NormalizeCronCommand(system_match[7]);
    if (!normalized_command) {
      return {
        parse_warning: BuildCronParseWarning({
          source_path: params.source_path,
          source_kind: params.source_kind,
          line_number: params.line_number,
          raw_line: params.raw_line,
          reason: "missing_system_cron_command",
        }),
      };
    }
    return {
      job: {
        schedule_expression: [
          system_match[1],
          system_match[2],
          system_match[3],
          system_match[4],
          system_match[5],
        ].join(" "),
        schedule_fields: {
          minute: system_match[1],
          hour: system_match[2],
          day_of_month: system_match[3],
          month: system_match[4],
          day_of_week: system_match[5],
        },
        run_as_user: system_match[6].trim(),
        command: normalized_command,
        is_disabled,
        source_path: params.source_path,
        source_kind: params.source_kind,
        line_number: params.line_number,
        raw_line: params.raw_line,
      },
    };
  }

  const user_match = parse_candidate.match(
    /^([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(.+)$/,
  );
  if (!user_match) {
    return {
      parse_warning: BuildCronParseWarning({
        source_path: params.source_path,
        source_kind: params.source_kind,
        line_number: params.line_number,
        raw_line: params.raw_line,
        reason: "invalid_user_cron_format",
      }),
    };
  }
  if (!IsCronScheduleValid({
    minute: user_match[1],
    hour: user_match[2],
    day_of_month: user_match[3],
      month: user_match[4],
      day_of_week: user_match[5],
    })) {
    return {
      parse_warning: BuildCronParseWarning({
        source_path: params.source_path,
        source_kind: params.source_kind,
        line_number: params.line_number,
        raw_line: params.raw_line,
        reason: "invalid_user_cron_schedule",
      }),
    };
  }
  const normalized_command = NormalizeCronCommand(user_match[6]);
  if (!normalized_command) {
    return {
      parse_warning: BuildCronParseWarning({
        source_path: params.source_path,
        source_kind: params.source_kind,
        line_number: params.line_number,
        raw_line: params.raw_line,
        reason: "missing_user_cron_command",
      }),
    };
  }

  return {
    job: {
      schedule_expression: [
        user_match[1],
        user_match[2],
        user_match[3],
        user_match[4],
        user_match[5],
      ].join(" "),
      schedule_fields: {
        minute: user_match[1],
        hour: user_match[2],
        day_of_month: user_match[3],
        month: user_match[4],
        day_of_week: user_match[5],
      },
      run_as_user: params.default_user,
      command: normalized_command,
      is_disabled,
      source_path: params.source_path,
      source_kind: params.source_kind,
      line_number: params.line_number,
      raw_line: params.raw_line,
    },
  };
}

function NormalizeCronCommand(raw_command: string): string {
  return StripCronInlineComment(raw_command).trim();
}

function StripCronInlineComment(raw_command: string): string {
  let in_single_quote = false;
  let in_double_quote = false;
  let is_escaped = false;
  for (let index = 0; index < raw_command.length; index += 1) {
    const current_character = raw_command[index];
    if (is_escaped) {
      is_escaped = false;
      continue;
    }
    if (current_character === "\\") {
      is_escaped = true;
      continue;
    }
    if (current_character === "'" && !in_double_quote) {
      in_single_quote = !in_single_quote;
      continue;
    }
    if (current_character === "\"" && !in_single_quote) {
      in_double_quote = !in_double_quote;
      continue;
    }
    if (current_character !== "#" || in_single_quote || in_double_quote) {
      continue;
    }
    const previous_character = index > 0 ? raw_command[index - 1] : " ";
    if (index === 0 || /\s/.test(previous_character)) {
      return raw_command.slice(0, index);
    }
  }
  return raw_command;
}

function IsCronScheduleValid(params: {
  minute: string;
  hour: string;
  day_of_month: string;
  month: string;
  day_of_week: string;
}): boolean {
  return IsCronScheduleFieldValid({
    value: params.minute,
    field_kind: "minute",
  })
    && IsCronScheduleFieldValid({
      value: params.hour,
      field_kind: "hour",
    })
    && IsCronScheduleFieldValid({
      value: params.day_of_month,
      field_kind: "day_of_month",
    })
    && IsCronScheduleFieldValid({
      value: params.month,
      field_kind: "month",
    })
    && IsCronScheduleFieldValid({
      value: params.day_of_week,
      field_kind: "day_of_week",
    });
}

function IsCronScheduleFieldValid(params: {
  value: string;
  field_kind: "minute" | "hour" | "day_of_month" | "month" | "day_of_week";
}): boolean {
  const value = params.value.trim();
  if (!value) {
    return false;
  }
  const segments = value.split(",");
  if (segments.length === 0) {
    return false;
  }
  for (const segment of segments) {
    if (!IsCronScheduleSegmentValid({
      segment: segment.trim(),
      field_kind: params.field_kind,
    })) {
      return false;
    }
  }
  return true;
}

function IsCronScheduleSegmentValid(params: {
  segment: string;
  field_kind: "minute" | "hour" | "day_of_month" | "month" | "day_of_week";
}): boolean {
  if (!params.segment) {
    return false;
  }
  const step_parts = params.segment.split("/");
  if (step_parts.length > 2) {
    return false;
  }
  const base_part = step_parts[0];
  const step_part = step_parts[1];
  if (step_part !== undefined) {
    const parsed_step = Number.parseInt(step_part, 10);
    if (!Number.isInteger(parsed_step) || parsed_step <= 0) {
      return false;
    }
  }
  return IsCronScheduleBaseValid({
    base_part,
    field_kind: params.field_kind,
  });
}

function IsCronScheduleBaseValid(params: {
  base_part: string;
  field_kind: "minute" | "hour" | "day_of_month" | "month" | "day_of_week";
}): boolean {
  if (params.base_part === "*") {
    return true;
  }
  const range_parts = params.base_part.split("-");
  if (range_parts.length === 2) {
    const range_start = ResolveCronTokenNumber({
      token: range_parts[0].trim(),
      field_kind: params.field_kind,
    });
    const range_end = ResolveCronTokenNumber({
      token: range_parts[1].trim(),
      field_kind: params.field_kind,
    });
    if (range_start === undefined || range_end === undefined) {
      return false;
    }
    return range_start <= range_end;
  }
  return ResolveCronTokenNumber({
    token: params.base_part,
    field_kind: params.field_kind,
  }) !== undefined;
}

function ResolveCronTokenNumber(params: {
  token: string;
  field_kind: "minute" | "hour" | "day_of_month" | "month" | "day_of_week";
}): number | undefined {
  const token = params.token.trim();
  if (!token) {
    return undefined;
  }
  const parsed_numeric_token = Number.parseInt(token, 10);
  if (Number.isInteger(parsed_numeric_token)) {
    if (params.field_kind === "minute" && parsed_numeric_token >= 0 && parsed_numeric_token <= 59) {
      return parsed_numeric_token;
    }
    if (params.field_kind === "hour" && parsed_numeric_token >= 0 && parsed_numeric_token <= 23) {
      return parsed_numeric_token;
    }
    if (params.field_kind === "day_of_month" && parsed_numeric_token >= 1 && parsed_numeric_token <= 31) {
      return parsed_numeric_token;
    }
    if (params.field_kind === "month" && parsed_numeric_token >= 1 && parsed_numeric_token <= 12) {
      return parsed_numeric_token;
    }
    if (params.field_kind === "day_of_week" && parsed_numeric_token >= 0 && parsed_numeric_token <= 7) {
      return parsed_numeric_token;
    }
    return undefined;
  }
  const normalized_token = token.toUpperCase();
  if (params.field_kind === "month") {
    const month_token_map: Record<string, number> = {
      JAN: 1,
      FEB: 2,
      MAR: 3,
      APR: 4,
      MAY: 5,
      JUN: 6,
      JUL: 7,
      AUG: 8,
      SEP: 9,
      OCT: 10,
      NOV: 11,
      DEC: 12,
    };
    return month_token_map[normalized_token];
  }
  if (params.field_kind === "day_of_week") {
    const day_of_week_token_map: Record<string, number> = {
      SUN: 0,
      MON: 1,
      TUE: 2,
      WED: 3,
      THU: 4,
      FRI: 5,
      SAT: 6,
    };
    return day_of_week_token_map[normalized_token];
  }
  return undefined;
}

function IsSupportedSpecialSchedule(raw_schedule: string): boolean {
  const supported_schedules: proxmox_lxc_cron_special_schedule_t[] = [
    "@annually",
    "@yearly",
    "@monthly",
    "@weekly",
    "@daily",
    "@midnight",
    "@hourly",
    "@reboot",
  ];
  return supported_schedules.includes(raw_schedule as proxmox_lxc_cron_special_schedule_t);
}

function BuildCronParseWarning(params: {
  source_path: string;
  source_kind: proxmox_lxc_cron_source_kind_t;
  line_number: number;
  raw_line: string;
  reason: string;
}): proxmox_lxc_cron_parse_warning_t {
  return {
    source_path: params.source_path,
    source_kind: params.source_kind,
    line_number: params.line_number,
    raw_line: params.raw_line,
    reason: params.reason,
  };
}

function NormalizeTcpPortFilter(raw_port_filter: Array<number | string> | undefined): Set<number> | undefined {
  if (!raw_port_filter || raw_port_filter.length === 0) {
    return undefined;
  }
  const normalized = new Set<number>();
  for (const raw_port of raw_port_filter) {
    const parsed_port = Number.parseInt(String(raw_port).trim(), 10);
    if (!Number.isInteger(parsed_port) || parsed_port < 1 || parsed_port > 65535) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "port_filter entries must be valid TCP port numbers.",
        details: {
          field: "port_filter",
          value: String(raw_port),
        },
      });
    }
    normalized.add(parsed_port);
  }
  return normalized;
}

function NormalizeAddressFamilyFilter(
  raw_filter: proxmox_lxc_address_family_t[] | undefined,
): Set<proxmox_lxc_address_family_t> | undefined {
  if (!raw_filter || raw_filter.length === 0) {
    return undefined;
  }
  const normalized = new Set<proxmox_lxc_address_family_t>();
  for (const family of raw_filter) {
    if (family !== "ipv4" && family !== "ipv6") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "address_family_filter entries must be ipv4 or ipv6.",
        details: {
          field: "address_family_filter",
          value: String(family),
        },
      });
    }
    normalized.add(family);
  }
  return normalized;
}

function BuildTcpSsProbeShellCommand(): string {
  return [
    "# __PROXMOX_TCP_SS__",
    "if command -v ss >/dev/null 2>&1; then",
    "  ss -ltnpH 2>/dev/null || ss -ltnp 2>/dev/null",
    "else",
    "  printf '__ERR__\\t%s\\n' 'ss_unavailable'",
    "fi",
  ].join("\n");
}

function BuildTcpNetstatProbeShellCommand(): string {
  return [
    "# __PROXMOX_TCP_NETSTAT__",
    "if command -v netstat >/dev/null 2>&1; then",
    "  netstat -ltnp 2>/dev/null",
    "else",
    "  printf '__ERR__\\t%s\\n' 'netstat_unavailable'",
    "fi",
  ].join("\n");
}

function BuildTcpProcProbeShellCommand(): string {
  return [
    "# __PROXMOX_TCP_PROC__",
    "for net_file in /proc/net/tcp /proc/net/tcp6; do",
    "  [ -r \"$net_file\" ] || continue",
    "  tail -n +2 \"$net_file\" 2>/dev/null | while read -r sl local_addr rem_addr state txq rxq tr tm_when retrnsmt uid timeout inode rest; do",
    "    [ \"$state\" = \"0A\" ] || continue",
    "    printf '__TCP__\\t%s\\t%s\\t%s\\t%s\\n' \"$net_file\" \"$local_addr\" \"$state\" \"$inode\"",
    "  done",
    "done",
    "for fd_link in /proc/[0-9]*/fd/*; do",
    "  target_path=\"$(readlink \"$fd_link\" 2>/dev/null || true)\"",
    "  case \"$target_path\" in",
    "    socket:\\[*\\])",
    "      inode_value=\"${target_path#socket:[}\"",
    "      inode_value=\"${inode_value%]}\"",
    "      proc_pid=\"$(echo \"$fd_link\" | awk -F'/' '{print $3}')\"",
    "      proc_fd=\"$(echo \"$fd_link\" | awk -F'/' '{print $5}')\"",
    "      printf '__MAP__\\t%s\\t%s\\t%s\\n' \"$inode_value\" \"$proc_pid\" \"$proc_fd\"",
    "      ;;",
    "  esac",
    "done",
  ].join("\n");
}

function BuildUdpSsProbeShellCommand(): string {
  return [
    "# __PROXMOX_UDP_SS__",
    "if command -v ss >/dev/null 2>&1; then",
    "  ss -lunpH 2>/dev/null || ss -lunp 2>/dev/null",
    "else",
    "  printf '__ERR__\\t%s\\n' 'ss_unavailable'",
    "fi",
  ].join("\n");
}

function BuildUdpNetstatProbeShellCommand(): string {
  return [
    "# __PROXMOX_UDP_NETSTAT__",
    "if command -v netstat >/dev/null 2>&1; then",
    "  netstat -lunp 2>/dev/null",
    "else",
    "  printf '__ERR__\\t%s\\n' 'netstat_unavailable'",
    "fi",
  ].join("\n");
}

function BuildUdpProcProbeShellCommand(): string {
  return [
    "# __PROXMOX_UDP_PROC__",
    "for net_file in /proc/net/udp /proc/net/udp6; do",
    "  [ -r \"$net_file\" ] || continue",
    "  tail -n +2 \"$net_file\" 2>/dev/null | while read -r sl local_addr rem_addr state txq rxq tr tm_when retrnsmt uid timeout inode ref pointer drops; do",
    "    printf '__UDP__\\t%s\\t%s\\t%s\\t%s\\n' \"$net_file\" \"$local_addr\" \"$state\" \"$inode\"",
    "  done",
    "done",
    "for fd_link in /proc/[0-9]*/fd/*; do",
    "  target_path=\"$(readlink \"$fd_link\" 2>/dev/null || true)\"",
    "  case \"$target_path\" in",
    "    socket:\\[*\\])",
    "      inode_value=\"${target_path#socket:[}\"",
    "      inode_value=\"${inode_value%]}\"",
    "      proc_pid=\"$(echo \"$fd_link\" | awk -F'/' '{print $3}')\"",
    "      proc_fd=\"$(echo \"$fd_link\" | awk -F'/' '{print $5}')\"",
    "      printf '__MAP__\\t%s\\t%s\\t%s\\n' \"$inode_value\" \"$proc_pid\" \"$proc_fd\"",
    "      ;;",
    "  esac",
    "done",
  ].join("\n");
}

function BuildSystemdServicesProbeShellCommand(params: {
  detail_level: proxmox_lxc_service_detail_level_t;
  service_limit: number;
}): string {
  const show_fields = params.detail_level === "full"
    ? "Id,MainPID,ControlPID,Restart,TasksCurrent,MemoryCurrent,CPUUsageNSec,FragmentPath,UnitFilePreset,ExecStart,ExecReload"
    : "Id,MainPID,ControlPID,Restart,TasksCurrent,MemoryCurrent,CPUUsageNSec,FragmentPath,UnitFilePreset";
  const include_show_block = params.detail_level !== "summary_only";
  return [
    "# __PROXMOX_SERVICE_SYSTEMD__",
    "if command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service --all --no-legend --no-pager >/dev/null 2>&1; then",
    `  if [ \"$(systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null | wc -l)\" -gt ${params.service_limit} ]; then`,
    "    printf '__ERR__\\t%s\\n' 'service_limit_applied'",
    "  fi",
    `  systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null | head -n ${params.service_limit} | awk 'NF>=4{unit=$1;active=$3;substate=$4;$1=$2=$3=$4=\"\";sub(/^ +/,\"\",$0);printf \"__UNIT__\\t%s\\t%s\\t%s\\t%s\\n\",unit,active,substate,$0}'`,
    `  systemctl list-unit-files --type=service --no-legend --no-pager 2>/dev/null | head -n ${params.service_limit} | awk 'NF>=2 && $1 ~ /\\.service$/{printf \"__UNITFILE__\\t%s\\t%s\\n\",$1,$2}'`,
    ...(include_show_block
      ? [
        `  systemctl show --type=service --all --no-pager --property=${show_fields} 2>/dev/null | sed 's/^/__SHOWLINE__\\t/' | head -n $(( ${params.service_limit} * 16 ))`,
      ]
      : []),
    "else",
    "  printf '__ERR__\\t%s\\n' 'systemd_unavailable'",
    "fi",
  ].join("\n");
}

function BuildOpenrcServicesProbeShellCommand(params: {
  service_limit: number;
}): string {
  return [
    "# __PROXMOX_SERVICE_OPENRC__",
    "if command -v rc-service >/dev/null 2>&1; then",
    "  rc_service_list=\"$(rc-service -l 2>/dev/null || true)\"",
    "  enabled_services=''",
    "  if command -v rc-update >/dev/null 2>&1; then",
    "    enabled_services=\"$(rc-update show 2>/dev/null | awk 'NF>0{print $1}' | sort -u)\"",
    "  fi",
    "  if [ -n \"$rc_service_list\" ]; then",
    "    service_count=0",
    "    for service_name in $rc_service_list; do",
    "      [ -n \"$service_name\" ] || continue",
    "      service_count=$((service_count+1))",
    `      if [ \"$service_count\" -gt ${params.service_limit} ]; then`,
    "        printf '__ERR__\\t%s\\n' 'openrc_service_limit_applied'",
    "        break",
    "      fi",
    "      rc-service \"$service_name\" status >/dev/null 2>&1",
    "      status_code=\"$?\"",
    "      service_state='unknown'",
    "      if [ \"$status_code\" = '0' ]; then",
    "        service_state='started'",
    "      elif [ \"$status_code\" = '3' ]; then",
    "        service_state='stopped'",
    "      fi",
    "      enabled_state='unknown'",
    "      if [ -n \"$enabled_services\" ]; then",
    "        if printf '%s\\n' \"$enabled_services\" | grep -Fx \"$service_name\" >/dev/null 2>&1; then",
    "          enabled_state='enabled'",
    "        else",
    "          enabled_state='disabled'",
    "        fi",
    "      fi",
    "      printf '__OPENRC__\\t%s\\t%s\\t%s\\n' \"$service_name\" \"$service_state\" \"$enabled_state\"",
    "    done",
    "  else",
    "    printf '__ERR__\\t%s\\n' 'openrc_service_list_empty'",
    "  fi",
    "else",
    "  printf '__ERR__\\t%s\\n' 'openrc_unavailable'",
    "fi",
  ].join("\n");
}

function BuildSysvServicesProbeShellCommand(params: {
  service_limit: number;
}): string {
  return [
    "# __PROXMOX_SERVICE_SYSV__",
    "if command -v service >/dev/null 2>&1; then",
    `  service --status-all 2>/dev/null | head -n ${params.service_limit} | sed -n 's/^ \\[ \\([+\\-?]\\) \\] \\(.*\\)$/__SYSV__\\t\\2\\t\\1/p'`,
    "else",
    "  printf '__ERR__\\t%s\\n' 'sysv_service_unavailable'",
    "fi",
    "if [ -d /etc/init.d ]; then",
    "  init_count=0",
    "  for init_script in /etc/init.d/*; do",
    "    [ -f \"$init_script\" ] || continue",
    "    init_count=$((init_count+1))",
    `    if [ \"$init_count\" -gt ${params.service_limit} ]; then`,
    "      printf '__ERR__\\t%s\\n' 'sysv_initd_limit_applied'",
    "      break",
    "    fi",
    "    init_name=\"$(basename \"$init_script\")\"",
    "    printf '__INITD__\\t%s\\n' \"$init_name\"",
    "  done",
    "fi",
  ].join("\n");
}

function BuildStaticServicesProbeShellCommand(params: {
  service_limit: number;
}): string {
  return [
    "# __PROXMOX_SERVICE_STATIC__",
    "for unit_dir in /etc/systemd/system /lib/systemd/system /usr/lib/systemd/system; do",
    "  [ -d \"$unit_dir\" ] || continue",
    "  static_count=0",
    "  for unit_file in \"$unit_dir\"/*.service; do",
    "    [ -f \"$unit_file\" ] || continue",
    "    static_count=$((static_count+1))",
    `    if [ \"$static_count\" -gt ${params.service_limit} ]; then`,
    "      printf '__ERR__\\t%s\\n' 'static_service_limit_applied'",
    "      break",
    "    fi",
    "    unit_name=\"$(basename \"$unit_file\")\"",
    "    printf '__STATIC__\\t%s\\t%s\\n' \"$unit_name\" \"$unit_file\"",
    "  done",
    "done",
    "if [ -d /etc/init.d ]; then",
    "  initd_count=0",
    "  for init_script in /etc/init.d/*; do",
    "    [ -f \"$init_script\" ] || continue",
    "    initd_count=$((initd_count+1))",
    `    if [ \"$initd_count\" -gt ${params.service_limit} ]; then`,
    "      printf '__ERR__\\t%s\\n' 'static_initd_limit_applied'",
    "      break",
    "    fi",
    "    init_name=\"$(basename \"$init_script\")\"",
    "    printf '__STATIC__\\t%s\\t%s\\n' \"$init_name\" \"$init_script\"",
    "  done",
    "fi",
  ].join("\n");
}

function BuildHardwareInventoryProbeShellCommand(params: {
  include_network: boolean;
  include_storage: boolean;
  include_pci: boolean;
  include_usb: boolean;
  include_graphics: boolean;
}): string {
  return [
    "# __PROXMOX_HARDWARE_PROBE__",
    ...(params.include_network
      ? [
        "if [ -d /sys/class/net ]; then",
        "  for net_path in /sys/class/net/*; do",
        "    [ -e \"$net_path\" ] || continue",
        "    interface_name=\"$(basename \"$net_path\")\"",
        "    mac_address=\"$(cat \"$net_path/address\" 2>/dev/null | tr -d '\\r\\n')\"",
        "    link_state=\"$(cat \"$net_path/operstate\" 2>/dev/null | tr -d '\\r\\n')\"",
        "    speed_value=\"$(cat \"$net_path/speed\" 2>/dev/null | tr -d '\\r\\n')\"",
        "    driver_name=\"$(basename \"$(readlink \"$net_path/device/driver\" 2>/dev/null || true)\")\"",
        "    printf '__NET__\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$interface_name\" \"$mac_address\" \"$link_state\" \"$speed_value\" \"$driver_name\" \"$net_path\"",
        "  done",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'sysfs_net' 'hardware_probe_unavailable'",
        "fi",
      ]
      : []),
    ...(params.include_storage
      ? [
        "if [ -d /sys/block ]; then",
        "  for block_path in /sys/block/*; do",
        "    [ -e \"$block_path\" ] || continue",
        "    block_name=\"$(basename \"$block_path\")\"",
        "    size_sectors=\"$(cat \"$block_path/size\" 2>/dev/null | tr -d '\\r\\n')\"",
        "    rotational_value=\"$(cat \"$block_path/queue/rotational\" 2>/dev/null | tr -d '\\r\\n')\"",
        "    model_value=\"$(cat \"$block_path/device/model\" 2>/dev/null | tr -d '\\r\\n')\"",
        "    vendor_value=\"$(cat \"$block_path/device/vendor\" 2>/dev/null | tr -d '\\r\\n')\"",
        "    if echo \"$size_sectors\" | grep -Eq '^[0-9]+$'; then size_bytes=$((size_sectors * 512)); else size_bytes=''; fi",
        "    printf '__BLK__\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$block_name\" \"$size_bytes\" \"$rotational_value\" \"$model_value\" \"$vendor_value\" \"$block_path\"",
        "  done",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'sysfs_block' 'hardware_probe_unavailable'",
        "fi",
        "if [ -r /proc/mounts ]; then",
        "  awk '{printf \"__MNT__\\t%s\\t%s\\t%s\\n\",$1,$2,$3}' /proc/mounts",
        "fi",
      ]
      : []),
    ...(params.include_pci
      ? [
        "if command -v lspci >/dev/null 2>&1; then",
        "  lspci -Dnn 2>/dev/null | sed 's/^/__PCI_RAW__\\t/'",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'lspci' 'hardware_probe_unavailable'",
        "  if [ -d /sys/bus/pci/devices ]; then",
        "    for pci_path in /sys/bus/pci/devices/*; do",
        "      [ -e \"$pci_path\" ] || continue",
        "      pci_addr=\"$(basename \"$pci_path\")\"",
        "      vendor_id=\"$(cat \"$pci_path/vendor\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      product_id=\"$(cat \"$pci_path/device\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      class_id=\"$(cat \"$pci_path/class\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      device_label=\"$(cat \"$pci_path/label\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      printf '__PCI__\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$pci_addr\" \"$vendor_id\" \"$product_id\" \"$class_id\" \"$device_label\" \"$pci_path\"",
        "    done",
        "  fi",
        "fi",
      ]
      : []),
    ...(params.include_usb
      ? [
        "if command -v lsusb >/dev/null 2>&1; then",
        "  lsusb 2>/dev/null | sed 's/^/__USB_RAW__\\t/'",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'lsusb' 'hardware_probe_unavailable'",
        "  if [ -d /sys/bus/usb/devices ]; then",
        "    for usb_path in /sys/bus/usb/devices/*; do",
        "      [ -e \"$usb_path/idVendor\" ] || continue",
        "      vendor_id=\"$(cat \"$usb_path/idVendor\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      product_id=\"$(cat \"$usb_path/idProduct\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      manufacturer=\"$(cat \"$usb_path/manufacturer\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      product_name=\"$(cat \"$usb_path/product\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      busnum=\"$(cat \"$usb_path/busnum\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      devnum=\"$(cat \"$usb_path/devnum\" 2>/dev/null | tr -d '\\r\\n')\"",
        "      printf '__USB__\\t%s:%s\\t%s\\t%s\\t%s %s\\t%s\\n' \"$busnum\" \"$devnum\" \"$vendor_id\" \"$product_id\" \"$manufacturer\" \"$product_name\" \"$usb_path\"",
        "    done",
        "  fi",
        "fi",
      ]
      : []),
    ...(params.include_graphics
      ? [
        "if [ -d /dev/dri ]; then",
        "  for dri_node in /dev/dri/*; do",
        "    [ -e \"$dri_node\" ] || continue",
        "    printf '__DRI__\\t%s\\n' \"$(basename \"$dri_node\")\"",
        "  done",
        "fi",
      ]
      : []),
    "if [ -r /proc/cpuinfo ]; then",
    "  cpu_model=\"$(awk -F: '/model name/{gsub(/^ /,\"\",$2); print $2; exit}' /proc/cpuinfo 2>/dev/null)\"",
    "  cpu_count=\"$(awk '/^processor/{count+=1} END{print count+0}' /proc/cpuinfo 2>/dev/null)\"",
    "  printf '__CPU__\\t%s\\t%s\\n' \"$cpu_model\" \"$cpu_count\"",
    "fi",
    "if [ -r /proc/meminfo ]; then",
    "  mem_total_kb=\"$(awk '/^MemTotal:/{print $2; exit}' /proc/meminfo 2>/dev/null)\"",
    "  printf '__MEM__\\t%s\\n' \"$mem_total_kb\"",
    "fi",
  ].join("\n");
}

function ParseHardwareProbeOutput(probe_output: string): {
  devices: proxmox_lxc_hardware_device_t[];
  scan_errors: proxmox_lxc_hardware_scan_error_t[];
  parse_warnings: proxmox_lxc_hardware_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_hardware_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_hardware_parse_warning_t[] = [];
  const devices: proxmox_lxc_hardware_device_t[] = [];
  const mount_map = new Map<string, { mountpoints: string[]; filesystem?: string }>();

  for (const raw_line of probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = normalized_line.split("\t");
      const source_kind = NormalizeHardwareSourceKind(fields[1]);
      scan_errors.push({
        source_kind,
        reason: fields[2] ?? "hardware_partial_data:probe_error",
      });
      continue;
    }
    if (normalized_line.startsWith("__MNT__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 4) {
        parse_warnings.push({
          source_kind: "proc_mounts",
          reason: "hardware_parse_failed:invalid_mount_record",
          raw_line,
        });
        continue;
      }
      const block_name = NormalizeOptionalText(fields[1]) ?? "";
      const mountpoint = NormalizeOptionalText(fields[2]) ?? "";
      const filesystem = NormalizeOptionalText(fields[3]) ?? undefined;
      const normalized_block_name = block_name.replace(/^\/dev\//, "").trim();
      if (!normalized_block_name || !mountpoint) {
        continue;
      }
      const existing_entry = mount_map.get(normalized_block_name) ?? { mountpoints: [] };
      existing_entry.mountpoints = [...new Set([...existing_entry.mountpoints, mountpoint])];
      if (filesystem) {
        existing_entry.filesystem = filesystem;
      }
      mount_map.set(normalized_block_name, existing_entry);
      continue;
    }
    if (normalized_line.startsWith("__NET__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 7) {
        parse_warnings.push({
          source_kind: "sysfs_net",
          reason: "hardware_parse_failed:invalid_net_record",
          raw_line,
        });
        continue;
      }
      const interface_name = NormalizeOptionalText(fields[1]);
      if (!interface_name) {
        continue;
      }
      const speed_mbps = ParseOptionalInteger(fields[4]);
      const path = NormalizeOptionalText(fields[6]) ?? undefined;
      const driver = NormalizeOptionalText(fields[5]) ?? undefined;
      const virtual_by_path = path?.includes("/virtual/") === true;
      const virtual_by_driver = /virtio|veth|tun|tap|vmxnet/i.test(driver ?? "");
      devices.push({
        device_id: `net:${interface_name}`,
        name: interface_name,
        class: "network",
        subclass: "interface",
        bus_type: "net",
        path,
        interface_name,
        mac_address: NormalizeOptionalText(fields[2]) ?? undefined,
        driver,
        link_state: NormalizeOptionalText(fields[3]) ?? undefined,
        speed_mbps: speed_mbps !== undefined && speed_mbps >= 0 ? speed_mbps : undefined,
        is_graphics: false,
        is_virtual_device: virtual_by_path || virtual_by_driver,
        source_kind: "sysfs_net",
      });
      continue;
    }
    if (normalized_line.startsWith("__BLK__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 7) {
        parse_warnings.push({
          source_kind: "sysfs_block",
          reason: "hardware_parse_failed:invalid_block_record",
          raw_line,
        });
        continue;
      }
      const block_name = NormalizeOptionalText(fields[1]);
      if (!block_name) {
        continue;
      }
      const mount_entry = mount_map.get(block_name);
      const path = NormalizeOptionalText(fields[6]) ?? undefined;
      const model = NormalizeOptionalText(fields[4]) ?? undefined;
      const vendor_name = NormalizeOptionalText(fields[5]) ?? undefined;
      devices.push({
        device_id: `block:${block_name}`,
        name: model ?? block_name,
        class: "storage",
        subclass: "block_device",
        bus_type: "block",
        path,
        vendor_name,
        model,
        block_name,
        size_bytes: ParseOptionalInteger(fields[2]),
        rotational: NormalizeOptionalText(fields[3]) === "1" ? true : NormalizeOptionalText(fields[3]) === "0" ? false : undefined,
        mountpoints: mount_entry?.mountpoints,
        filesystem: mount_entry?.filesystem,
        is_graphics: false,
        is_virtual_device: path?.includes("/virtual/") === true,
        source_kind: "sysfs_block",
      });
      continue;
    }
    if (normalized_line.startsWith("__PCI__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 7) {
        parse_warnings.push({
          source_kind: "sysfs_pci",
          reason: "hardware_parse_failed:invalid_pci_record",
          raw_line,
        });
        continue;
      }
      const pci_address = NormalizeOptionalText(fields[1]) ?? undefined;
      if (!pci_address) {
        continue;
      }
      const class_id = NormalizeOptionalText(fields[4]) ?? undefined;
      const parsed_class = ClassFromPciClassCode(class_id);
      devices.push({
        device_id: `pci:${pci_address}`,
        name: NormalizeOptionalText(fields[5]) ?? pci_address,
        class: parsed_class.class_name,
        subclass: parsed_class.subclass_name,
        bus_type: "pci",
        path: NormalizeOptionalText(fields[6]) ?? undefined,
        pci_address,
        vendor_id: NormalizeHardwareId(fields[2]),
        product_id: NormalizeHardwareId(fields[3]),
        model: NormalizeOptionalText(fields[5]) ?? undefined,
        is_graphics: parsed_class.is_graphics,
        is_virtual_device: LooksLikeVirtualDevice({
          source_text: fields[5],
          path: fields[6],
        }),
        is_passthrough_candidate: parsed_class.class_name !== "network" && !parsed_class.is_graphics,
        source_kind: "sysfs_pci",
      });
      continue;
    }
    if (normalized_line.startsWith("__PCI_RAW__\t")) {
      const raw_value = raw_line.slice("__PCI_RAW__\t".length);
      const parsed_pci = ParseLspciRawRecord(raw_value);
      if (!parsed_pci) {
        parse_warnings.push({
          source_kind: "lspci",
          reason: "hardware_parse_failed:invalid_lspci_record",
          raw_line,
        });
        continue;
      }
      devices.push(parsed_pci);
      continue;
    }
    if (normalized_line.startsWith("__USB__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 6) {
        parse_warnings.push({
          source_kind: "sysfs_usb",
          reason: "hardware_parse_failed:invalid_usb_record",
          raw_line,
        });
        continue;
      }
      const usb_bus_device = NormalizeOptionalText(fields[1]) ?? undefined;
      if (!usb_bus_device) {
        continue;
      }
      devices.push({
        device_id: `usb:${usb_bus_device}:${NormalizeHardwareId(fields[2]) ?? "unknown"}:${NormalizeHardwareId(fields[3]) ?? "unknown"}`,
        name: NormalizeOptionalText(fields[4]) ?? usb_bus_device,
        class: "usb",
        subclass: "device",
        bus_type: "usb",
        path: NormalizeOptionalText(fields[5]) ?? undefined,
        usb_bus_device,
        vendor_id: NormalizeHardwareId(fields[2]),
        product_id: NormalizeHardwareId(fields[3]),
        model: NormalizeOptionalText(fields[4]) ?? undefined,
        is_graphics: false,
        is_virtual_device: LooksLikeVirtualDevice({
          source_text: fields[4],
          path: fields[5],
        }),
        source_kind: "sysfs_usb",
      });
      continue;
    }
    if (normalized_line.startsWith("__USB_RAW__\t")) {
      const raw_value = raw_line.slice("__USB_RAW__\t".length);
      const parsed_usb = ParseLsusbRawRecord(raw_value);
      if (!parsed_usb) {
        parse_warnings.push({
          source_kind: "lsusb",
          reason: "hardware_parse_failed:invalid_lsusb_record",
          raw_line,
        });
        continue;
      }
      devices.push(parsed_usb);
      continue;
    }
    if (normalized_line.startsWith("__DRI__\t")) {
      const dri_node = NormalizeOptionalText(raw_line.slice("__DRI__\t".length));
      if (!dri_node) {
        continue;
      }
      devices.push({
        device_id: `dri:${dri_node}`,
        name: dri_node,
        class: "graphics",
        subclass: "dri_node",
        bus_type: "virtual",
        path: `/dev/dri/${dri_node}`,
        is_graphics: true,
        render_nodes: [dri_node],
        is_virtual_device: true,
        source_kind: "dri",
      });
      continue;
    }
    if (normalized_line.startsWith("__CPU__\t")) {
      const fields = raw_line.split("\t");
      const cpu_model = NormalizeOptionalText(fields[1]) ?? "cpu";
      const cpu_count = ParseOptionalInteger(fields[2]);
      devices.push({
        device_id: "cpu:summary",
        name: cpu_model,
        class: "cpu",
        bus_type: "other",
        model: cpu_model,
        product_name: cpu_count !== undefined ? `${cpu_count}` : undefined,
        is_graphics: false,
        is_virtual_device: true,
        source_kind: "proc_cpuinfo",
      });
      continue;
    }
    if (normalized_line.startsWith("__MEM__\t")) {
      const fields = raw_line.split("\t");
      const mem_total_kb = ParseOptionalInteger(fields[1]);
      devices.push({
        device_id: "memory:summary",
        name: "memory",
        class: "memory",
        bus_type: "other",
        size_bytes: mem_total_kb !== undefined ? mem_total_kb * 1024 : undefined,
        is_graphics: false,
        is_virtual_device: true,
        source_kind: "proc_meminfo",
      });
      continue;
    }
  }

  for (const device_record of devices) {
    if (device_record.block_name && (!device_record.mountpoints || device_record.mountpoints.length === 0)) {
      const mount_entry = mount_map.get(device_record.block_name);
      if (mount_entry) {
        device_record.mountpoints = mount_entry.mountpoints;
        device_record.filesystem = mount_entry.filesystem;
      }
    }
  }

  return {
    devices,
    scan_errors,
    parse_warnings,
  };
}

function BuildHardwareSummary(devices: proxmox_lxc_hardware_device_t[]): {
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
} {
  const bus_type_counts: Record<string, number> = {};
  const class_counts: Record<string, number> = {};
  const vendor_counts: Record<string, number> = {};
  const model_counts: Record<string, number> = {};
  let network_device_count = 0;
  let storage_device_count = 0;
  let graphics_device_count = 0;
  let unknown_or_partial_count = 0;

  for (const device_record of devices) {
    bus_type_counts[device_record.bus_type] = (bus_type_counts[device_record.bus_type] ?? 0) + 1;
    class_counts[device_record.class] = (class_counts[device_record.class] ?? 0) + 1;
    const vendor_key = device_record.vendor_name ?? device_record.vendor_id ?? "unknown";
    vendor_counts[vendor_key] = (vendor_counts[vendor_key] ?? 0) + 1;
    const model_key = device_record.model ?? device_record.product_name ?? device_record.name ?? "unknown";
    model_counts[model_key] = (model_counts[model_key] ?? 0) + 1;
    if (device_record.bus_type === "net") {
      network_device_count += 1;
    }
    if (device_record.bus_type === "block") {
      storage_device_count += 1;
    }
    if (device_record.is_graphics) {
      graphics_device_count += 1;
    }
    if (!device_record.vendor_id && !device_record.vendor_name && !device_record.model) {
      unknown_or_partial_count += 1;
    }
  }
  const top_vendors = Object.keys(vendor_counts)
    .sort((left_key, right_key) => (vendor_counts[right_key] ?? 0) - (vendor_counts[left_key] ?? 0))
    .slice(0, 10);
  const top_models = Object.keys(model_counts)
    .sort((left_key, right_key) => (model_counts[right_key] ?? 0) - (model_counts[left_key] ?? 0))
    .slice(0, 10);
  return {
    total_devices: devices.length,
    network_device_count,
    storage_device_count,
    graphics_device_count,
    unknown_or_partial_count,
    bus_type_counts,
    class_counts,
    vendor_counts,
    model_counts,
    top_vendors,
    top_models,
  };
}

function BuildDiskInventoryProbeShellCommand(params: {
  include_usage: boolean;
}): string {
  return [
    "# __PROXMOX_DISK_PROBE__",
    "if command -v lsblk >/dev/null 2>&1; then",
    "  printf '__LSBLK_JSON_BEGIN__\\n'",
    "  lsblk -J -b -O -o NAME,KNAME,PATH,TYPE,SIZE,RO,RM,MODEL,VENDOR,SERIAL,WWN,TRAN,PKNAME,FSTYPE,UUID,LABEL,MOUNTPOINTS,PARTTYPE,PARTUUID,START,LOG-SEC,PHY-SEC 2>/dev/null",
    "  printf '\\n__LSBLK_JSON_END__\\n'",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'lsblk' 'disk_probe_unavailable'",
    "fi",
    "if command -v findmnt >/dev/null 2>&1; then",
    "  printf '__FINDMNT_JSON_BEGIN__\\n'",
    "  findmnt -J -b -o SOURCE,TARGET,FSTYPE,OPTIONS,SIZE,USED,AVAIL,USE% 2>/dev/null",
    "  printf '\\n__FINDMNT_JSON_END__\\n'",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'findmnt' 'disk_probe_unavailable'",
    "fi",
    "if command -v blkid >/dev/null 2>&1; then",
    "  blkid -o full 2>/dev/null | sed 's/^/__BLKID__\\t/'",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'blkid' 'disk_probe_unavailable'",
    "fi",
    "if [ -r /proc/partitions ]; then",
    "  awk 'NR>2 && NF>=4 {printf \"__PROC_PART__\\t%s\\t%s\\t%s\\t%s\\n\",$1,$2,$3,$4}' /proc/partitions",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'proc_partitions' 'disk_probe_unavailable'",
    "fi",
    "if [ -r /proc/mounts ]; then",
    "  awk '{printf \"__PROC_MNT__\\t%s\\t%s\\t%s\\t%s\\n\",$1,$2,$3,$4}' /proc/mounts",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'proc_mounts' 'disk_probe_unavailable'",
    "fi",
    "if [ -r /proc/self/mountinfo ]; then",
    "  awk '{printf \"__MOUNTINFO__\\t%s\\n\",$0}' /proc/self/mountinfo",
    "fi",
    "if [ -d /sys/block ]; then",
    "  for blk in /sys/block/*; do",
    "    [ -e \"$blk\" ] || continue",
    "    blk_name=\"$(basename \"$blk\")\"",
    "    blk_size=\"$(cat \"$blk/size\" 2>/dev/null | tr -d '\\r\\n')\"",
    "    blk_ro=\"$(cat \"$blk/ro\" 2>/dev/null | tr -d '\\r\\n')\"",
    "    blk_rm=\"$(cat \"$blk/removable\" 2>/dev/null | tr -d '\\r\\n')\"",
    "    blk_model=\"$(cat \"$blk/device/model\" 2>/dev/null | tr -d '\\r\\n')\"",
    "    blk_vendor=\"$(cat \"$blk/device/vendor\" 2>/dev/null | tr -d '\\r\\n')\"",
    "    blk_rot=\"$(cat \"$blk/queue/rotational\" 2>/dev/null | tr -d '\\r\\n')\"",
    "    if echo \"$blk_size\" | grep -Eq '^[0-9]+$'; then blk_bytes=$((blk_size * 512)); else blk_bytes=''; fi",
    "    printf '__SYSBLK__\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$blk_name\" \"$blk_bytes\" \"$blk_ro\" \"$blk_rm\" \"$blk_model\" \"$blk_vendor\" \"$blk\" \"$blk_rot\"",
    "  done",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'sysfs_block' 'disk_probe_unavailable'",
    "fi",
    ...(params.include_usage
      ? [
        "if command -v df >/dev/null 2>&1; then",
        "  df -PT 2>/dev/null | awk 'NR>1 {printf \"__DF__\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n\",$1,$2,$3,$4,$5,$6,$7}'",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'df' 'disk_usage_unavailable'",
        "fi",
      ]
      : []),
  ].join("\n");
}

function ParseDiskProbeOutput(params: {
  probe_output: string;
}): {
  primary_source: proxmox_lxc_disk_source_kind_t;
  block_devices: proxmox_lxc_block_device_t[];
  partitions: proxmox_lxc_block_partition_t[];
  filesystems: proxmox_lxc_filesystem_t[];
  mounts: proxmox_lxc_mount_t[];
  scan_errors: proxmox_lxc_disk_scan_error_t[];
  parse_warnings: proxmox_lxc_disk_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_disk_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_disk_parse_warning_t[] = [];
  const block_device_map = new Map<string, proxmox_lxc_block_device_t>();
  const partition_map = new Map<string, proxmox_lxc_block_partition_t>();
  const filesystem_map = new Map<string, proxmox_lxc_filesystem_t>();
  const mount_map = new Map<string, proxmox_lxc_mount_t>();
  let primary_source: proxmox_lxc_disk_source_kind_t = "probe";
  let collecting_lsblk_json = false;
  let collecting_findmnt_json = false;
  const lsblk_json_lines: string[] = [];
  const findmnt_json_lines: string[] = [];

  const upsert_mount = (mount_record: proxmox_lxc_mount_t): void => {
    const mount_id = mount_record.mount_id;
    const existing_mount = mount_map.get(mount_id);
    mount_map.set(mount_id, {
      ...(existing_mount ?? {}),
      ...mount_record,
      warnings: [...new Set([...(existing_mount?.warnings ?? []), ...(mount_record.warnings ?? [])])],
    });
  };

  const upsert_filesystem = (filesystem_record: proxmox_lxc_filesystem_t): void => {
    const filesystem_id = filesystem_record.filesystem_id;
    const existing_record = filesystem_map.get(filesystem_id);
    filesystem_map.set(filesystem_id, {
      ...(existing_record ?? {}),
      ...filesystem_record,
      warnings: [...new Set([...(existing_record?.warnings ?? []), ...(filesystem_record.warnings ?? [])])],
    });
  };

  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    if (raw_line === "__LSBLK_JSON_BEGIN__") {
      collecting_lsblk_json = true;
      continue;
    }
    if (raw_line === "__LSBLK_JSON_END__") {
      collecting_lsblk_json = false;
      continue;
    }
    if (raw_line === "__FINDMNT_JSON_BEGIN__") {
      collecting_findmnt_json = true;
      continue;
    }
    if (raw_line === "__FINDMNT_JSON_END__") {
      collecting_findmnt_json = false;
      continue;
    }
    if (collecting_lsblk_json) {
      lsblk_json_lines.push(raw_line);
      continue;
    }
    if (collecting_findmnt_json) {
      findmnt_json_lines.push(raw_line);
      continue;
    }

    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      scan_errors.push({
        source_kind: NormalizeDiskSourceKind(fields[1]),
        reason: fields[2] ?? "disk_partial_data:probe_error",
      });
      continue;
    }
    if (normalized_line.startsWith("__SYSBLK__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 9) {
        parse_warnings.push({
          source_kind: "sysfs_block",
          reason: "disk_parse_failed:invalid_sysfs_block_record",
          raw_line,
        });
        continue;
      }
      const block_name = NormalizeOptionalText(fields[1]);
      if (!block_name) {
        continue;
      }
      const device_path = `/dev/${block_name}`;
      block_device_map.set(device_path, {
        device_id: `disk:${device_path}`,
        name: block_name,
        path: device_path,
        device_type: InferDiskDeviceType({
          raw_type: "disk",
          name: block_name,
        }),
        size_bytes: ParseOptionalInteger(fields[2]),
        read_only: ParseOptionalBooleanUnknown(fields[3]),
        removable: ParseOptionalBooleanUnknown(fields[4]),
        model: NormalizeOptionalText(fields[5]) ?? undefined,
        vendor: NormalizeOptionalText(fields[6]) ?? undefined,
        rotational: ParseOptionalBooleanUnknown(fields[8]),
        is_virtual_device: LooksLikeVirtualDevice({
          source_text: `${fields[5] ?? ""} ${fields[6] ?? ""}`,
          path: fields[7],
        }),
        source_kind: "sysfs_block",
      });
      if (primary_source === "probe") {
        primary_source = "sysfs_block";
      }
      continue;
    }
    if (normalized_line.startsWith("__PROC_PART__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 5) {
        parse_warnings.push({
          source_kind: "proc_partitions",
          reason: "disk_parse_failed:invalid_proc_partitions_record",
          raw_line,
        });
        continue;
      }
      const partition_name = NormalizeOptionalText(fields[4]);
      if (!partition_name) {
        continue;
      }
      const path = `/dev/${partition_name}`;
      const size_blocks = ParseOptionalInteger(fields[3]);
      const size_bytes = size_blocks !== undefined ? size_blocks * 1024 : undefined;
      const partition_like = /\d+$/.test(partition_name);
      if (partition_like) {
        const parent_name = partition_name.replace(/p?\d+$/, "");
        const parent_path = parent_name ? `/dev/${parent_name}` : undefined;
        partition_map.set(path, {
          partition_id: `partition:${path}`,
          parent_device_id: parent_path ? `disk:${parent_path}` : undefined,
          partition_name,
          partition_number: ParseOptionalInteger(partition_name.match(/(\d+)$/)?.[1]),
          path,
          size_bytes,
          is_mounted: false,
          source_kind: "proc_partitions",
        });
      } else if (!block_device_map.has(path)) {
        block_device_map.set(path, {
          device_id: `disk:${path}`,
          name: partition_name,
          path,
          device_type: InferDiskDeviceType({
            raw_type: "disk",
            name: partition_name,
          }),
          size_bytes,
          source_kind: "proc_partitions",
        });
      }
      if (primary_source === "probe") {
        primary_source = "proc_partitions";
      }
      continue;
    }
    if (normalized_line.startsWith("__PROC_MNT__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 5) {
        parse_warnings.push({
          source_kind: "proc_mounts",
          reason: "disk_parse_failed:invalid_proc_mount_record",
          raw_line,
        });
        continue;
      }
      const source = DecodeProcMountField(fields[1]);
      const target = DecodeProcMountField(fields[2]);
      const filesystem_type = DecodeProcMountField(fields[3]);
      const mount_options = DecodeProcMountField(fields[4]);
      if (!source || !target || !filesystem_type) {
        continue;
      }
      upsert_mount({
        mount_id: `${source}->${target}`,
        source,
        target,
        filesystem_type,
        mount_options,
        is_read_only: mount_options.split(",").includes("ro"),
        source_kind: "proc_mounts",
      });
      upsert_filesystem({
        filesystem_id: `${source}@${target}`,
        source,
        device_path: source.startsWith("/dev/") ? source : undefined,
        mountpoint: target,
        filesystem_type,
        mount_options,
        is_read_only: mount_options.split(",").includes("ro"),
        source_kind: "proc_mounts",
      });
      if (source.startsWith("/dev/")) {
        const partition_record = partition_map.get(source);
        if (partition_record) {
          partition_record.is_mounted = true;
          partition_record.mountpoints = [...new Set([...(partition_record.mountpoints ?? []), target])];
          partition_map.set(source, partition_record);
        }
      }
      if (primary_source === "probe") {
        primary_source = "proc_mounts";
      }
      continue;
    }
    if (normalized_line.startsWith("__BLKID__\t")) {
      const payload = raw_line.slice("__BLKID__\t".length);
      const split_index = payload.indexOf(":");
      if (split_index <= 0) {
        parse_warnings.push({
          source_kind: "blkid",
          reason: "disk_parse_failed:invalid_blkid_record",
          raw_line,
        });
        continue;
      }
      const device_path = payload.slice(0, split_index).trim();
      const rest = payload.slice(split_index + 1);
      const key_values: Record<string, string> = {};
      for (const match of rest.matchAll(/([A-Z0-9_]+)=\"([^\"]*)\"/g)) {
        key_values[match[1]] = match[2];
      }
      const filesystem_type = NormalizeOptionalText(key_values.TYPE);
      const uuid = NormalizeOptionalText(key_values.UUID);
      const label = NormalizeOptionalText(key_values.LABEL);
      if (partition_map.has(device_path)) {
        const partition_record = partition_map.get(device_path) as proxmox_lxc_block_partition_t;
        partition_record.filesystem_type = filesystem_type ?? partition_record.filesystem_type;
        partition_record.uuid = uuid ?? partition_record.uuid;
        partition_record.label = label ?? partition_record.label;
        partition_map.set(device_path, partition_record);
      }
      if (filesystem_type) {
        upsert_filesystem({
          filesystem_id: `${device_path}@${filesystem_type}`,
          source: device_path,
          device_path,
          mountpoint: partition_map.get(device_path)?.mountpoints?.[0] ?? "unknown",
          filesystem_type,
          source_kind: "blkid",
          warnings: ["filesystem_not_mounted"] ,
        });
      }
      continue;
    }
    if (normalized_line.startsWith("__DF__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 8) {
        parse_warnings.push({
          source_kind: "df",
          reason: "disk_parse_failed:invalid_df_record",
          raw_line,
        });
        continue;
      }
      const source = NormalizeOptionalText(fields[1]) ?? "unknown";
      const filesystem_type = NormalizeOptionalText(fields[2]) ?? "unknown";
      const mountpoint = NormalizeOptionalText(fields[7]) ?? "unknown";
      const total_bytes = ParseOptionalInteger(fields[3]);
      const used_bytes = ParseOptionalInteger(fields[4]);
      const available_bytes = ParseOptionalInteger(fields[5]);
      const used_percent = ParseOptionalPercent(fields[6]);
      upsert_filesystem({
        filesystem_id: `${source}@${mountpoint}`,
        source,
        device_path: source.startsWith("/dev/") ? source : undefined,
        mountpoint,
        filesystem_type,
        total_bytes: total_bytes !== undefined ? total_bytes * 1024 : undefined,
        used_bytes: used_bytes !== undefined ? used_bytes * 1024 : undefined,
        available_bytes: available_bytes !== undefined ? available_bytes * 1024 : undefined,
        used_percent,
        source_kind: "df",
      });
      continue;
    }
  }

  if (lsblk_json_lines.length > 0) {
    try {
      const lsblk_json_text = lsblk_json_lines.join("\n").trim();
      const parsed_lsblk = JSON.parse(lsblk_json_text) as { blockdevices?: unknown[] };
      const blockdevices = Array.isArray(parsed_lsblk.blockdevices) ? parsed_lsblk.blockdevices : [];
      const append_lsblk_record = (params_record: {
        raw_record: unknown;
        parent_path?: string;
      }): void => {
        if (!params_record.raw_record || typeof params_record.raw_record !== "object") {
          return;
        }
        const raw_record = params_record.raw_record as Record<string, unknown>;
        const name = NormalizeTextFromUnknown(raw_record.name) ?? "unknown";
        const path = NormalizeTextFromUnknown(raw_record.path) ?? `/dev/${name}`;
        const raw_type = NormalizeTextFromUnknown(raw_record.type) ?? "other";
        const device_type = InferDiskDeviceType({
          raw_type,
          name,
        });
        const mountpoints = NormalizeMountpoints(raw_record.mountpoints, raw_record.mountpoint);
        const filesystem_type = NormalizeTextFromUnknown(raw_record.fstype) ?? undefined;
        const partition_number = ParseOptionalInteger(String(name.match(/(\d+)$/)?.[1] ?? ""));
        if (device_type === "partition") {
          partition_map.set(path, {
            partition_id: `partition:${path}`,
            parent_device_id: params_record.parent_path ? `disk:${params_record.parent_path}` : undefined,
            partition_name: name,
            partition_number,
            path,
            start_bytes: ParseOptionalIntegerFromUnknown(raw_record.start),
            size_bytes: ParseOptionalIntegerFromUnknown(raw_record.size),
            filesystem_type,
            uuid: NormalizeTextFromUnknown(raw_record.uuid) ?? undefined,
            label: NormalizeTextFromUnknown(raw_record.label) ?? undefined,
            mountpoints: mountpoints.length > 0 ? mountpoints : undefined,
            is_mounted: mountpoints.length > 0,
            source_kind: "lsblk",
          });
        } else {
          const existing_device = block_device_map.get(path);
          block_device_map.set(path, {
            ...(existing_device ?? {}),
            device_id: `disk:${path}`,
            name,
            kname: NormalizeTextFromUnknown(raw_record.kname) ?? undefined,
            path,
            device_type,
            size_bytes: ParseOptionalIntegerFromUnknown(raw_record.size),
            logical_sector_size: ParseOptionalIntegerFromUnknown(raw_record["log-sec"]),
            physical_sector_size: ParseOptionalIntegerFromUnknown(raw_record["phy-sec"]),
            read_only: ParseOptionalBooleanUnknown(raw_record.ro),
            removable: ParseOptionalBooleanUnknown(raw_record.rm),
            model: NormalizeTextFromUnknown(raw_record.model) ?? undefined,
            vendor: NormalizeTextFromUnknown(raw_record.vendor) ?? undefined,
            serial: NormalizeTextFromUnknown(raw_record.serial) ?? undefined,
            wwn: NormalizeTextFromUnknown(raw_record.wwn) ?? undefined,
            transport: NormalizeTextFromUnknown(raw_record.tran) ?? undefined,
            parent_device_id: params_record.parent_path ? `disk:${params_record.parent_path}` : undefined,
            children_device_ids: existing_device?.children_device_ids ?? [],
            is_virtual_device: LooksLikeVirtualDevice({
              source_text: `${String(raw_record.model ?? "")} ${String(raw_record.vendor ?? "")}`,
              path,
            }),
            source_kind: "lsblk",
          });
        }
        if (filesystem_type) {
          for (const mountpoint of mountpoints.length > 0 ? mountpoints : ["unknown"]) {
            upsert_filesystem({
              filesystem_id: `${path}@${mountpoint}`,
              source: path,
              device_path: path,
              mountpoint,
              filesystem_type,
              source_kind: "lsblk",
            });
          }
        }
        for (const mountpoint of mountpoints) {
          upsert_mount({
            mount_id: `${path}->${mountpoint}`,
            source: path,
            target: mountpoint,
            filesystem_type: filesystem_type ?? "unknown",
            source_kind: "lsblk",
          });
        }
        const children = Array.isArray(raw_record.children) ? raw_record.children : [];
        const child_ids: string[] = [];
        for (const child of children) {
          if (child && typeof child === "object") {
            const child_record = child as Record<string, unknown>;
            const child_name = NormalizeTextFromUnknown(child_record.name) ?? "unknown";
            const child_path = NormalizeTextFromUnknown(child_record.path) ?? `/dev/${child_name}`;
            child_ids.push(`disk:${child_path}`);
            append_lsblk_record({
              raw_record: child_record,
              parent_path: path,
            });
          }
        }
        if (device_type !== "partition" && child_ids.length > 0) {
          const existing_device = block_device_map.get(path);
          if (existing_device) {
            existing_device.children_device_ids = [...new Set([...(existing_device.children_device_ids ?? []), ...child_ids])];
            block_device_map.set(path, existing_device);
          }
        }
      };
      for (const blockdevice of blockdevices) {
        append_lsblk_record({
          raw_record: blockdevice,
        });
      }
      primary_source = "lsblk";
    } catch {
      parse_warnings.push({
        source_kind: "lsblk",
        reason: "disk_parse_failed:invalid_lsblk_json",
      });
    }
  }

  if (findmnt_json_lines.length > 0) {
    try {
      const findmnt_json_text = findmnt_json_lines.join("\n").trim();
      const parsed_findmnt = JSON.parse(findmnt_json_text) as { filesystems?: unknown[] };
      const filesystems = Array.isArray(parsed_findmnt.filesystems) ? parsed_findmnt.filesystems : [];
      for (const raw_entry of filesystems) {
        if (!raw_entry || typeof raw_entry !== "object") {
          continue;
        }
        const entry = raw_entry as Record<string, unknown>;
        const source = NormalizeTextFromUnknown(entry.source) ?? "unknown";
        const mountpoint = NormalizeTextFromUnknown(entry.target) ?? "unknown";
        const filesystem_type = NormalizeTextFromUnknown(entry.fstype) ?? "unknown";
        const options = NormalizeTextFromUnknown(entry.options) ?? undefined;
        upsert_mount({
          mount_id: `${source}->${mountpoint}`,
          source,
          target: mountpoint,
          filesystem_type,
          mount_options: options,
          is_read_only: options?.split(",").includes("ro") === true,
          source_kind: "findmnt",
        });
        upsert_filesystem({
          filesystem_id: `${source}@${mountpoint}`,
          source,
          device_path: source.startsWith("/dev/") ? source : undefined,
          mountpoint,
          filesystem_type,
          mount_options: options,
          is_read_only: options?.split(",").includes("ro") === true,
          total_bytes: ParseOptionalIntegerFromUnknown(entry.size),
          used_bytes: ParseOptionalIntegerFromUnknown(entry.used),
          available_bytes: ParseOptionalIntegerFromUnknown(entry.avail),
          used_percent: ParseOptionalPercent(entry["use%"]),
          source_kind: "findmnt",
        });
      }
    } catch {
      parse_warnings.push({
        source_kind: "findmnt",
        reason: "disk_parse_failed:invalid_findmnt_json",
      });
    }
  }

  return {
    primary_source,
    block_devices: Array.from(block_device_map.values()),
    partitions: Array.from(partition_map.values()),
    filesystems: Array.from(filesystem_map.values()),
    mounts: Array.from(mount_map.values()),
    scan_errors,
    parse_warnings,
  };
}

function BuildDiskSummary(params: {
  block_devices: proxmox_lxc_block_device_t[];
  partitions: proxmox_lxc_block_partition_t[];
  filesystems: proxmox_lxc_filesystem_t[];
  mounts: proxmox_lxc_mount_t[];
}): {
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
} {
  const filesystem_type_counts: Record<string, number> = {};
  const mountpoint_counts: Record<string, number> = {};
  const device_type_counts: Record<string, number> = {};
  let total_physical_like_disks = 0;
  let mounted_filesystem_count = 0;
  let unknown_or_partial_count = 0;
  let total_bytes = 0;
  let used_bytes = 0;
  let available_bytes = 0;

  for (const block_device of params.block_devices) {
    device_type_counts[block_device.device_type] = (device_type_counts[block_device.device_type] ?? 0) + 1;
    if (block_device.device_type === "disk" || block_device.device_type === "dm" || block_device.device_type === "md") {
      total_physical_like_disks += 1;
    }
    if (!block_device.model && !block_device.vendor && !block_device.serial && !block_device.size_bytes) {
      unknown_or_partial_count += 1;
    }
  }
  for (const filesystem_record of params.filesystems) {
    filesystem_type_counts[filesystem_record.filesystem_type] = (filesystem_type_counts[filesystem_record.filesystem_type] ?? 0) + 1;
    mountpoint_counts[filesystem_record.mountpoint] = (mountpoint_counts[filesystem_record.mountpoint] ?? 0) + 1;
    if (filesystem_record.mountpoint !== "unknown") {
      mounted_filesystem_count += 1;
    }
    if (filesystem_record.total_bytes !== undefined) {
      total_bytes += filesystem_record.total_bytes;
    }
    if (filesystem_record.used_bytes !== undefined) {
      used_bytes += filesystem_record.used_bytes;
    }
    if (filesystem_record.available_bytes !== undefined) {
      available_bytes += filesystem_record.available_bytes;
    }
  }

  return {
    total_block_devices: params.block_devices.length,
    total_physical_like_disks,
    total_partitions: params.partitions.length,
    total_filesystems: params.filesystems.length,
    total_mounts: params.mounts.length,
    mounted_filesystem_count,
    filesystem_type_counts,
    mountpoint_counts,
    device_type_counts,
    total_bytes: total_bytes > 0 ? total_bytes : undefined,
    used_bytes: used_bytes > 0 ? used_bytes : undefined,
    available_bytes: available_bytes > 0 ? available_bytes : undefined,
    unknown_or_partial_count,
  };
}

function InferDiskDeviceType(params: {
  raw_type: string;
  name: string;
}): "disk" | "partition" | "loop" | "rom" | "lvm" | "dm" | "md" | "other" {
  const raw_type = params.raw_type.trim().toLowerCase();
  if (raw_type === "disk") {
    return "disk";
  }
  if (raw_type === "part" || raw_type === "partition") {
    return "partition";
  }
  if (raw_type === "loop") {
    return "loop";
  }
  if (raw_type === "rom") {
    return "rom";
  }
  if (raw_type === "lvm") {
    return "lvm";
  }
  if (raw_type === "dm") {
    return "dm";
  }
  if (raw_type === "md") {
    return "md";
  }
  if (/^loop/.test(params.name)) {
    return "loop";
  }
  if (/^dm-/.test(params.name)) {
    return "dm";
  }
  if (/^md/.test(params.name)) {
    return "md";
  }
  return "other";
}

function NormalizeDiskSourceKind(raw_source_kind: string | undefined): proxmox_lxc_disk_source_kind_t {
  const normalized_source_kind = (raw_source_kind ?? "").trim().toLowerCase();
  if (normalized_source_kind === "lsblk") {
    return "lsblk";
  }
  if (normalized_source_kind === "findmnt") {
    return "findmnt";
  }
  if (normalized_source_kind === "blkid") {
    return "blkid";
  }
  if (normalized_source_kind === "proc_partitions") {
    return "proc_partitions";
  }
  if (normalized_source_kind === "proc_mounts") {
    return "proc_mounts";
  }
  if (normalized_source_kind === "proc_mountinfo") {
    return "proc_mountinfo";
  }
  if (normalized_source_kind === "sysfs_block") {
    return "sysfs_block";
  }
  if (normalized_source_kind === "df") {
    return "df";
  }
  return "probe";
}

function NormalizeMountpoints(
  raw_mountpoints: unknown,
  raw_mountpoint: unknown,
): string[] {
  if (Array.isArray(raw_mountpoints)) {
    return raw_mountpoints
      .map((mountpoint) => NormalizeTextFromUnknown(mountpoint))
      .filter((mountpoint): mountpoint is string => Boolean(mountpoint));
  }
  const single_mountpoint = NormalizeTextFromUnknown(raw_mountpoint);
  return single_mountpoint ? [single_mountpoint] : [];
}

function DecodeProcMountField(raw_value: string): string {
  return raw_value
    .replace(/\\040/g, " ")
    .replace(/\\011/g, "\t")
    .replace(/\\012/g, "\n")
    .replace(/\\134/g, "\\");
}

function ParseOptionalPercent(raw_value: unknown): number | undefined {
  const normalized_value = NormalizeTextFromUnknown(raw_value);
  if (!normalized_value) {
    return undefined;
  }
  const stripped_value = normalized_value.replace("%", "");
  const parsed_value = Number.parseInt(stripped_value, 10);
  if (!Number.isFinite(parsed_value) || Number.isNaN(parsed_value)) {
    return undefined;
  }
  if (parsed_value < 0 || parsed_value > 100) {
    return undefined;
  }
  return parsed_value;
}

function ResolveFilesystemScope(raw_scope: proxmox_lxc_filesystem_scope_t | undefined): proxmox_lxc_filesystem_scope_t {
  if (raw_scope === undefined) {
    return "all";
  }
  if (raw_scope === "all" || raw_scope === "device_backed_only" || raw_scope === "persistent_only") {
    return raw_scope;
  }
  throw new ProxmoxValidationError({
    code: "proxmox.validation.invalid_input",
    message: "filesystem_scope must be one of: all, device_backed_only, persistent_only.",
    details: {
      field: "filesystem_scope",
      value: String(raw_scope),
    },
  });
}

function FilterFilesystemRecordsByScope(params: {
  filesystems: proxmox_lxc_filesystem_t[];
  mounts: proxmox_lxc_mount_t[];
  filesystem_scope: proxmox_lxc_filesystem_scope_t;
}): {
  filesystems: proxmox_lxc_filesystem_t[];
  mounts: proxmox_lxc_mount_t[];
} {
  if (params.filesystem_scope === "all") {
    return {
      filesystems: params.filesystems,
      mounts: params.mounts,
    };
  }
  const filesystem_predicate = (filesystem_record: proxmox_lxc_filesystem_t): boolean => {
    const is_device_backed = filesystem_record.source.startsWith("/dev/")
      || filesystem_record.device_path?.startsWith("/dev/") === true;
    if (!is_device_backed) {
      return false;
    }
    if (params.filesystem_scope === "device_backed_only") {
      return true;
    }
    return !IsPseudoFilesystemType(filesystem_record.filesystem_type);
  };
  const mount_predicate = (mount_record: proxmox_lxc_mount_t): boolean => {
    const is_device_backed = mount_record.source.startsWith("/dev/");
    if (!is_device_backed) {
      return false;
    }
    if (params.filesystem_scope === "device_backed_only") {
      return true;
    }
    return !IsPseudoFilesystemType(mount_record.filesystem_type);
  };
  return {
    filesystems: params.filesystems.filter(filesystem_predicate),
    mounts: params.mounts.filter(mount_predicate),
  };
}

function IsPseudoFilesystemType(filesystem_type: string): boolean {
  const normalized_type = filesystem_type.trim().toLowerCase();
  if (!normalized_type) {
    return true;
  }
  if (normalized_type.startsWith("cgroup")) {
    return true;
  }
  return [
    "proc",
    "sysfs",
    "tmpfs",
    "devtmpfs",
    "devpts",
    "mqueue",
    "overlay",
    "squashfs",
    "ramfs",
    "autofs",
    "rpc_pipefs",
    "nsfs",
    "configfs",
    "fusectl",
    "fuse.lxcfs",
    "pstore",
    "debugfs",
    "tracefs",
    "securityfs",
    "binfmt_misc",
    "efivarfs",
    "hugetlbfs",
  ].includes(normalized_type);
}

function NormalizeTextFromUnknown(raw_value: unknown): string | undefined {
  if (raw_value === undefined || raw_value === null) {
    return undefined;
  }
  if (typeof raw_value === "string") {
    return NormalizeOptionalText(raw_value) ?? undefined;
  }
  return NormalizeOptionalText(String(raw_value)) ?? undefined;
}

function ParseOptionalIntegerFromUnknown(raw_value: unknown): number | undefined {
  if (raw_value === undefined || raw_value === null) {
    return undefined;
  }
  if (typeof raw_value === "number" && Number.isFinite(raw_value)) {
    return Math.trunc(raw_value);
  }
  if (typeof raw_value === "string") {
    return ParseOptionalInteger(raw_value);
  }
  return ParseOptionalInteger(String(raw_value));
}

function ParseOptionalBooleanUnknown(raw_value: unknown): boolean | undefined {
  const normalized_value = NormalizeTextFromUnknown(raw_value);
  if (!normalized_value) {
    return undefined;
  }
  const lowered_value = normalized_value.toLowerCase();
  if (lowered_value === "1" || lowered_value === "true" || lowered_value === "yes" || lowered_value === "on") {
    return true;
  }
  if (lowered_value === "0" || lowered_value === "false" || lowered_value === "no" || lowered_value === "off") {
    return false;
  }
  return undefined;
}

function BuildMemoryProbeShellCommand(params: {
  include_cgroup_limits: boolean;
}): string {
  return [
    "# __PROXMOX_MEMORY_PROBE__",
    "if [ -r /proc/meminfo ]; then",
    "  awk 'NF>=2 {gsub(\":\",\"\",$1); printf \"__MEMINFO__\\t%s\\t%s\\n\",$1,$2}' /proc/meminfo",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'meminfo' 'memory_probe_unavailable'",
    "fi",
    "if [ -r /proc/swaps ]; then",
    "  awk 'NR>1 && NF>=5 {printf \"__SWAPDEV__\\t%s\\t%s\\t%s\\t%s\\t%s\\n\",$1,$2,$3,$4,$5}' /proc/swaps",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'swaps' 'memory_probe_unavailable'",
    "fi",
    "if [ -r /proc/pressure/memory ]; then",
    "  awk '/^some/ {printf \"__PSI__\\tsome\\t%s\\n\",$0} /^full/ {printf \"__PSI__\\tfull\\t%s\\n\",$0}' /proc/pressure/memory",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'memory_pressure' 'memory_pressure_unavailable'",
    "fi",
    ...(params.include_cgroup_limits
      ? [
        "if [ -r /sys/fs/cgroup/memory.max ]; then printf '__CGROUP__\\tmemory.max\\t%s\\n' \"$(cat /sys/fs/cgroup/memory.max 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/memory.current ]; then printf '__CGROUP__\\tmemory.current\\t%s\\n' \"$(cat /sys/fs/cgroup/memory.current 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/memory.swap.max ]; then printf '__CGROUP__\\tmemory.swap.max\\t%s\\n' \"$(cat /sys/fs/cgroup/memory.swap.max 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/memory.swap.current ]; then printf '__CGROUP__\\tmemory.swap.current\\t%s\\n' \"$(cat /sys/fs/cgroup/memory.swap.current 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then printf '__CGROUP__\\tmemory.limit_in_bytes\\t%s\\n' \"$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/memory/memory.usage_in_bytes ]; then printf '__CGROUP__\\tmemory.usage_in_bytes\\t%s\\n' \"$(cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/memory/memory.memsw.limit_in_bytes ]; then printf '__CGROUP__\\tmemory.memsw.limit_in_bytes\\t%s\\n' \"$(cat /sys/fs/cgroup/memory/memory.memsw.limit_in_bytes 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/memory/memory.memsw.usage_in_bytes ]; then printf '__CGROUP__\\tmemory.memsw.usage_in_bytes\\t%s\\n' \"$(cat /sys/fs/cgroup/memory/memory.memsw.usage_in_bytes 2>/dev/null | tr -d '\\r\\n')\"; fi",
      ]
      : []),
  ].join("\n");
}

function ParseMemoryProbeOutput(params: {
  probe_output: string;
}): {
  primary_source: string;
  fallback_used: boolean;
  memory: {
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
  };
  swap: {
    swap_total_kb?: number;
    swap_free_kb?: number;
    swap_used_kb?: number;
    swap_used_percent?: number;
    devices: Array<{
      source: string;
      type?: string;
      size_kb?: number;
      used_kb?: number;
      priority?: number;
    }>;
  };
  kernel: {
    kernel_stack_kb?: number;
    page_tables_kb?: number;
    slab_kb?: number;
    s_unreclaim_kb?: number;
    kernel_memory_estimate_kb?: number;
  };
  psi_some_avg10?: number;
  psi_full_avg10?: number;
  cgroup_limit_kb?: number;
  cgroup_current_kb?: number;
  cgroup_swap_limit_kb?: number;
  cgroup_swap_current_kb?: number;
  scan_errors: proxmox_lxc_memory_scan_error_t[];
  parse_warnings: proxmox_lxc_memory_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_memory_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_memory_parse_warning_t[] = [];
  const meminfo_map = new Map<string, number>();
  const swap_devices: Array<{
    source: string;
    type?: string;
    size_kb?: number;
    used_kb?: number;
    priority?: number;
  }> = [];
  let psi_some_avg10: number | undefined;
  let psi_full_avg10: number | undefined;
  let cgroup_limit_kb: number | undefined;
  let cgroup_current_kb: number | undefined;
  let cgroup_swap_limit_kb: number | undefined;
  let cgroup_swap_current_kb: number | undefined;
  let meminfo_seen = false;
  let swaps_seen = false;
  let fallback_used = false;

  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      scan_errors.push({
        source_kind: fields[1] ?? "probe",
        reason: fields[2] ?? "memory_partial_data:probe_error",
      });
      if ((fields[2] ?? "").includes("unavailable")) {
        fallback_used = true;
      }
      continue;
    }
    if (normalized_line.startsWith("__MEMINFO__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 3) {
        parse_warnings.push({
          source_kind: "meminfo",
          reason: "memory_parse_failed:invalid_meminfo_record",
          raw_line,
        });
        continue;
      }
      const field_name = NormalizeOptionalText(fields[1]) ?? "";
      const field_value = ParseOptionalInteger(fields[2]);
      if (!field_name || field_value === undefined) {
        continue;
      }
      meminfo_map.set(field_name, field_value);
      meminfo_seen = true;
      continue;
    }
    if (normalized_line.startsWith("__SWAPDEV__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 6) {
        parse_warnings.push({
          source_kind: "swaps",
          reason: "memory_parse_failed:invalid_swap_record",
          raw_line,
        });
        continue;
      }
      const source = NormalizeOptionalText(fields[1]);
      if (!source) {
        continue;
      }
      swap_devices.push({
        source,
        type: NormalizeOptionalText(fields[2]) ?? undefined,
        size_kb: ParseOptionalInteger(fields[3]),
        used_kb: ParseOptionalInteger(fields[4]),
        priority: ParseOptionalInteger(fields[5]),
      });
      swaps_seen = true;
      continue;
    }
    if (normalized_line.startsWith("__PSI__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 3) {
        parse_warnings.push({
          source_kind: "memory_pressure",
          reason: "memory_parse_failed:invalid_psi_record",
          raw_line,
        });
        continue;
      }
      const psi_kind = NormalizeOptionalText(fields[1]) ?? "";
      const psi_payload = fields.slice(2).join("\t");
      const avg10_match = psi_payload.match(/avg10=([0-9]+(?:\.[0-9]+)?)/);
      const avg10_value = avg10_match ? Number.parseFloat(avg10_match[1]) : undefined;
      if (avg10_value === undefined || Number.isNaN(avg10_value)) {
        continue;
      }
      if (psi_kind === "some") {
        psi_some_avg10 = avg10_value;
      } else if (psi_kind === "full") {
        psi_full_avg10 = avg10_value;
      }
      continue;
    }
    if (normalized_line.startsWith("__CGROUP__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 3) {
        parse_warnings.push({
          source_kind: "cgroup",
          reason: "memory_parse_failed:invalid_cgroup_record",
          raw_line,
        });
        continue;
      }
      const cgroup_key = NormalizeOptionalText(fields[1]) ?? "";
      const cgroup_value = ParseOptionalCgroupBytesToKb(fields[2]);
      if (!cgroup_key || cgroup_value === undefined) {
        continue;
      }
      if (cgroup_key === "memory.max" || cgroup_key === "memory.limit_in_bytes") {
        cgroup_limit_kb = cgroup_value;
      } else if (cgroup_key === "memory.current" || cgroup_key === "memory.usage_in_bytes") {
        cgroup_current_kb = cgroup_value;
      } else if (cgroup_key === "memory.swap.max" || cgroup_key === "memory.memsw.limit_in_bytes") {
        cgroup_swap_limit_kb = cgroup_value;
      } else if (cgroup_key === "memory.swap.current" || cgroup_key === "memory.memsw.usage_in_bytes") {
        cgroup_swap_current_kb = cgroup_value;
      }
      continue;
    }
  }

  const mem_total_kb = meminfo_map.get("MemTotal");
  const mem_available_kb = meminfo_map.get("MemAvailable");
  const mem_free_kb = meminfo_map.get("MemFree");
  const mem_used_kb = mem_total_kb !== undefined
    ? Math.max(0, mem_total_kb - (mem_available_kb ?? mem_free_kb ?? 0))
    : undefined;
  const used_percent = mem_total_kb && mem_used_kb !== undefined
    ? RoundFloat((mem_used_kb / mem_total_kb) * 100, 2)
    : undefined;

  const swap_total_kb_meminfo = meminfo_map.get("SwapTotal");
  const swap_free_kb_meminfo = meminfo_map.get("SwapFree");
  const swap_total_kb = swap_total_kb_meminfo ?? swap_devices.reduce((total, entry) => total + (entry.size_kb ?? 0), 0);
  const swap_used_kb = swap_total_kb_meminfo !== undefined
    ? Math.max(0, swap_total_kb_meminfo - (swap_free_kb_meminfo ?? 0))
    : swap_devices.reduce((total, entry) => total + (entry.used_kb ?? 0), 0);
  const swap_free_kb = swap_free_kb_meminfo ?? (swap_total_kb > 0 ? Math.max(0, swap_total_kb - swap_used_kb) : undefined);
  const swap_used_percent = swap_total_kb > 0
    ? RoundFloat((swap_used_kb / swap_total_kb) * 100, 2)
    : undefined;

  const kernel_stack_kb = meminfo_map.get("KernelStack");
  const page_tables_kb = meminfo_map.get("PageTables");
  const slab_kb = meminfo_map.get("Slab");
  const s_unreclaim_kb = meminfo_map.get("SUnreclaim");
  const kernel_memory_estimate_kb = [kernel_stack_kb, page_tables_kb, slab_kb, s_unreclaim_kb]
    .filter((value): value is number => value !== undefined)
    .reduce((total, value) => total + value, 0);

  return {
    primary_source: meminfo_seen ? "meminfo" : (swaps_seen ? "swaps" : "probe"),
    fallback_used,
    memory: {
      mem_total_kb,
      mem_available_kb,
      mem_free_kb,
      mem_used_kb,
      used_percent,
      buffers_kb: meminfo_map.get("Buffers"),
      cached_kb: meminfo_map.get("Cached"),
      sreclaimable_kb: meminfo_map.get("SReclaimable"),
      shmem_kb: meminfo_map.get("Shmem"),
      active_kb: meminfo_map.get("Active"),
      inactive_kb: meminfo_map.get("Inactive"),
    },
    swap: {
      swap_total_kb: swap_total_kb > 0 ? swap_total_kb : swap_total_kb_meminfo,
      swap_free_kb,
      swap_used_kb: swap_total_kb > 0 ? swap_used_kb : undefined,
      swap_used_percent,
      devices: swap_devices,
    },
    kernel: {
      kernel_stack_kb,
      page_tables_kb,
      slab_kb,
      s_unreclaim_kb,
      kernel_memory_estimate_kb: kernel_memory_estimate_kb > 0 ? kernel_memory_estimate_kb : undefined,
    },
    psi_some_avg10,
    psi_full_avg10,
    cgroup_limit_kb,
    cgroup_current_kb,
    cgroup_swap_limit_kb,
    cgroup_swap_current_kb,
    scan_errors,
    parse_warnings,
  };
}

function ParseOptionalCgroupBytesToKb(raw_value: string | undefined): number | undefined {
  const normalized_value = NormalizeOptionalText(raw_value);
  if (!normalized_value) {
    return undefined;
  }
  if (normalized_value.toLowerCase() === "max") {
    return undefined;
  }
  const parsed_bytes = Number.parseInt(normalized_value, 10);
  if (!Number.isFinite(parsed_bytes) || Number.isNaN(parsed_bytes) || parsed_bytes < 0) {
    return undefined;
  }
  return Math.trunc(parsed_bytes / 1024);
}

function BuildMemoryProcessRssProbeShellCommand(params: {
  pid_list: number[];
}): string {
  return [
    "# __PROXMOX_MEMORY_PROCESS_RSS_PROBE__",
    `for pid in ${params.pid_list.join(" ")}; do`,
    "  if [ -r \"/proc/$pid/status\" ]; then",
    "    printf '__RSSPID__\\t%s\\n' \"$pid\"",
    "    awk '/^(VmRSS|RssAnon|RssFile|RssShmem):/ {gsub(\":\",\"\",$1); printf \"__RSSVAL__\\t%s\\t%s\\n\", $1, $2}' \"/proc/$pid/status\" 2>/dev/null",
    "  else",
    "    printf '__ERR__\\t%s\\t%s\\t%s\\n' 'process_rss' 'memory_partial_data:proc_status_unreadable' \"$pid\"",
    "  fi",
    "done",
  ].join("\n");
}

function ParseMemoryProcessRssProbeOutput(params: {
  probe_output: string;
}): {
  rss_components_by_pid: Map<number, {
    vm_rss_kb?: number;
    rss_anon_kb?: number;
    rss_file_kb?: number;
    rss_shmem_kb?: number;
  }>;
  scan_errors: proxmox_lxc_memory_scan_error_t[];
  parse_warnings: proxmox_lxc_memory_parse_warning_t[];
} {
  const rss_components_by_pid = new Map<number, {
    vm_rss_kb?: number;
    rss_anon_kb?: number;
    rss_file_kb?: number;
    rss_shmem_kb?: number;
  }>();
  const scan_errors: proxmox_lxc_memory_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_memory_parse_warning_t[] = [];
  let active_pid: number | undefined;
  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      scan_errors.push({
        source_kind: fields[1] ?? "process_rss",
        pid: ParseOptionalInteger(fields[3]),
        reason: fields[2] ?? "memory_partial_data:process_rss_probe_error",
      });
      continue;
    }
    if (normalized_line.startsWith("__RSSPID__\t")) {
      const fields = raw_line.split("\t");
      const pid_value = ParseOptionalInteger(fields[1]);
      if (pid_value === undefined || pid_value <= 0) {
        active_pid = undefined;
        parse_warnings.push({
          source_kind: "process_rss",
          reason: "memory_parse_failed:invalid_process_rss_pid",
          raw_line,
        });
        continue;
      }
      active_pid = pid_value;
      if (!rss_components_by_pid.has(active_pid)) {
        rss_components_by_pid.set(active_pid, {});
      }
      continue;
    }
    if (normalized_line.startsWith("__RSSVAL__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 3 || active_pid === undefined) {
        parse_warnings.push({
          source_kind: "process_rss",
          reason: "memory_parse_failed:invalid_process_rss_value",
          raw_line,
        });
        continue;
      }
      const rss_key = NormalizeOptionalText(fields[1]);
      const rss_value = ParseOptionalInteger(fields[2]);
      if (!rss_key || rss_value === undefined) {
        continue;
      }
      const current_record = rss_components_by_pid.get(active_pid) ?? {};
      if (rss_key === "VmRSS") {
        current_record.vm_rss_kb = rss_value;
      } else if (rss_key === "RssAnon") {
        current_record.rss_anon_kb = rss_value;
      } else if (rss_key === "RssFile") {
        current_record.rss_file_kb = rss_value;
      } else if (rss_key === "RssShmem") {
        current_record.rss_shmem_kb = rss_value;
      }
      rss_components_by_pid.set(active_pid, current_record);
      continue;
    }
  }
  return {
    rss_components_by_pid,
    scan_errors,
    parse_warnings,
  };
}

function BuildIdentityProbeShellCommand(params: {
  include_shadow_status: boolean;
  include_last_login: boolean;
  include_sudo_privilege_signals: boolean;
  privilege_detail_mode: proxmox_lxc_identity_privilege_detail_mode_t;
}): string {
  return [
    "# __PROXMOX_IDENTITY_PROBE__",
    `# __PROXMOX_IDENTITY_PRIVILEGE_DETAIL_MODE__\t${params.privilege_detail_mode}`,
    "identity_used_getent=0",
    "if command -v getent >/dev/null 2>&1; then",
    "  identity_used_getent=1",
    "  getent passwd 2>/dev/null | awk '{printf \"__PASSWD__\\tgetent\\t%s\\n\",$0}'",
    "  getent group 2>/dev/null | awk '{printf \"__GROUP__\\tgetent\\t%s\\n\",$0}'",
    "fi",
    "if [ \"$identity_used_getent\" -eq 0 ]; then",
    "  if [ -r /etc/passwd ]; then awk '{printf \"__PASSWD__\\tfile_fallback\\t%s\\n\",$0}' /etc/passwd; else printf '__ERR__\\t%s\\t%s\\n' 'file_fallback' 'identity_probe_unavailable:passwd'; fi",
    "  if [ -r /etc/group ]; then awk '{printf \"__GROUP__\\tfile_fallback\\t%s\\n\",$0}' /etc/group; else printf '__ERR__\\t%s\\t%s\\n' 'file_fallback' 'identity_probe_unavailable:group'; fi",
    "fi",
    ...(params.include_shadow_status
      ? [
        "if command -v passwd >/dev/null 2>&1; then",
        "  if [ \"$identity_used_getent\" -eq 1 ]; then",
        "    getent passwd 2>/dev/null | cut -d: -f1 | while IFS= read -r identity_user; do [ -n \"$identity_user\" ] || continue; identity_status=\"$(passwd -S \"$identity_user\" 2>/dev/null || true)\"; [ -n \"$identity_status\" ] && printf '__PWS__\\t%s\\t%s\\n' \"$identity_user\" \"$identity_status\"; done",
        "  elif [ -r /etc/passwd ]; then",
        "    awk -F: '{print $1}' /etc/passwd 2>/dev/null | while IFS= read -r identity_user; do [ -n \"$identity_user\" ] || continue; identity_status=\"$(passwd -S \"$identity_user\" 2>/dev/null || true)\"; [ -n \"$identity_status\" ] && printf '__PWS__\\t%s\\t%s\\n' \"$identity_user\" \"$identity_status\"; done",
        "  fi",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'shadow_status' 'identity_partial_data:passwd_status_unavailable'",
        "fi",
        "if command -v chage >/dev/null 2>&1; then",
        "  if [ \"$identity_used_getent\" -eq 1 ]; then",
        "    getent passwd 2>/dev/null | cut -d: -f1 | while IFS= read -r identity_user; do [ -n \"$identity_user\" ] || continue; identity_chage=\"$(chage -l \"$identity_user\" 2>/dev/null | tr '\\n' ';' | sed 's/;*$//' || true)\"; [ -n \"$identity_chage\" ] && printf '__CHAGE__\\t%s\\t%s\\n' \"$identity_user\" \"$identity_chage\"; done",
        "  elif [ -r /etc/passwd ]; then",
        "    awk -F: '{print $1}' /etc/passwd 2>/dev/null | while IFS= read -r identity_user; do [ -n \"$identity_user\" ] || continue; identity_chage=\"$(chage -l \"$identity_user\" 2>/dev/null | tr '\\n' ';' | sed 's/;*$//' || true)\"; [ -n \"$identity_chage\" ] && printf '__CHAGE__\\t%s\\t%s\\n' \"$identity_user\" \"$identity_chage\"; done",
        "  fi",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'shadow_status' 'identity_partial_data:chage_unavailable'",
        "fi",
      ]
      : []),
    ...(params.include_last_login
      ? [
        "if command -v lastlog >/dev/null 2>&1; then",
        "  lastlog 2>/dev/null | awk 'NR>1 {printf \"__LASTLOG__\\t%s\\n\",$0}'",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'last_login' 'identity_partial_data:lastlog_unavailable'",
        "fi",
      ]
      : []),
    ...(params.include_sudo_privilege_signals && params.privilege_detail_mode === "sudoers_expanded"
      ? [
        "identity_sudoers_file_limit=128",
        "identity_sudoers_lines_per_file_limit=400",
        "if [ -r /etc/sudoers ]; then",
        "  awk -v identity_source='/etc/sudoers' -v identity_line_limit=\"$identity_sudoers_lines_per_file_limit\" '!/^[[:space:]]*#/ && NF>0 && NR<=identity_line_limit {printf \"__SUDOER__\\t%s\\t%s\\n\",identity_source,$0} NR==identity_line_limit+1 {printf \"__SUDOERS_LIMIT__\\t%s\\t%s\\n\",identity_source,\"line_limit_reached\"}' /etc/sudoers",
        "  awk '/^[[:space:]]*#includedir[[:space:]]+/ {print $2}' /etc/sudoers 2>/dev/null | head -n 8 | while IFS= read -r identity_include_dir; do",
        "    [ -n \"$identity_include_dir\" ] || continue",
        "    printf '__SUDOINCLUDE__\\t%s\\t%s\\n' '/etc/sudoers' \"$identity_include_dir\"",
        "    [ -d \"$identity_include_dir\" ] || continue",
        "    find \"$identity_include_dir\" -maxdepth 1 -type f 2>/dev/null | LC_ALL=C sort | head -n \"$identity_sudoers_file_limit\" | while IFS= read -r identity_sudo_file; do",
        "      [ -r \"$identity_sudo_file\" ] || continue",
        "      awk -v identity_source=\"$identity_sudo_file\" -v identity_line_limit=\"$identity_sudoers_lines_per_file_limit\" '!/^[[:space:]]*#/ && NF>0 && NR<=identity_line_limit {printf \"__SUDOER__\\t%s\\t%s\\n\",identity_source,$0} NR==identity_line_limit+1 {printf \"__SUDOERS_LIMIT__\\t%s\\t%s\\n\",identity_source,\"line_limit_reached\"}' \"$identity_sudo_file\"",
        "    done",
        "  done",
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'sudoers' 'identity_partial_data:sudoers_unreadable'",
        "fi",
        "if [ -d /etc/sudoers.d ]; then",
        "  find /etc/sudoers.d -maxdepth 1 -type f 2>/dev/null | LC_ALL=C sort | head -n \"$identity_sudoers_file_limit\" | while IFS= read -r identity_sudo_file; do",
        "    [ -r \"$identity_sudo_file\" ] || continue",
        "    awk -v identity_source=\"$identity_sudo_file\" -v identity_line_limit=\"$identity_sudoers_lines_per_file_limit\" '!/^[[:space:]]*#/ && NF>0 && NR<=identity_line_limit {printf \"__SUDOER__\\t%s\\t%s\\n\",identity_source,$0} NR==identity_line_limit+1 {printf \"__SUDOERS_LIMIT__\\t%s\\t%s\\n\",identity_source,\"line_limit_reached\"}' \"$identity_sudo_file\"",
        "  done",
        "fi",
      ]
      : []),
  ].join("\n");
}

function ParseIdentityProbeOutput(params: {
  probe_output: string;
}): {
  primary_source: proxmox_lxc_identity_source_kind_t | "unknown";
  fallback_used: boolean;
  users: proxmox_lxc_identity_user_t[];
  groups: proxmox_lxc_identity_group_t[];
  sudo_users: Set<string>;
  sudo_groups: Set<string>;
  sudo_user_sources: Map<string, string[]>;
  sudo_group_sources: Map<string, string[]>;
  scan_errors: proxmox_lxc_identity_scan_error_t[];
  parse_warnings: proxmox_lxc_identity_parse_warning_t[];
} {
  const users_by_name = new Map<string, proxmox_lxc_identity_user_t>();
  const groups_by_name = new Map<string, proxmox_lxc_identity_group_t>();
  const sudo_users = new Set<string>();
  const sudo_groups = new Set<string>();
  const sudo_user_sources = new Map<string, string[]>();
  const sudo_group_sources = new Map<string, string[]>();
  const scan_errors: proxmox_lxc_identity_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_identity_parse_warning_t[] = [];
  let primary_source: proxmox_lxc_identity_source_kind_t | "unknown" = "unknown";
  let fallback_used = false;

  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      scan_errors.push({
        source_kind: ResolveIdentitySourceKind(fields[1]) ?? "probe",
        reason: fields[2] ?? "identity_partial_data:probe_error",
      });
      continue;
    }
    if (normalized_line.startsWith("__PASSWD__\t")) {
      const fields = raw_line.split("\t");
      const source_kind = ResolveIdentitySourceKind(fields[1]);
      const payload = fields.slice(2).join("\t");
      if (!source_kind) {
        parse_warnings.push({
          source_kind: "probe",
          reason: "identity_parse_failed:unknown_passwd_source",
          raw_line,
        });
        continue;
      }
      if (primary_source === "unknown") {
        primary_source = source_kind;
      }
      if (source_kind === "file_fallback") {
        fallback_used = true;
      }
      const passwd_fields = payload.split(":");
      if (passwd_fields.length < 7) {
        parse_warnings.push({
          source_kind,
          reason: "identity_parse_failed:invalid_passwd_record",
          raw_line: payload,
        });
        continue;
      }
      const username = NormalizeOptionalText(passwd_fields[0]);
      const uid = ParseOptionalInteger(passwd_fields[2]);
      const gid = ParseOptionalInteger(passwd_fields[3]);
      if (!username || uid === undefined || gid === undefined) {
        parse_warnings.push({
          source_kind,
          reason: "identity_parse_failed:invalid_passwd_fields",
          raw_line: payload,
        });
        continue;
      }
      const password_field = NormalizeOptionalText(passwd_fields[1]) ?? "";
      const is_locked_from_password = password_field.startsWith("!") || password_field.startsWith("*");
      const is_disabled_from_password = password_field === "*" || password_field === "!" || password_field === "!!";
      const existing_user = users_by_name.get(username.toLowerCase());
      users_by_name.set(username.toLowerCase(), {
        username,
        uid,
        gid,
        gecos: NormalizeOptionalText(passwd_fields[4]) ?? undefined,
        home_directory: NormalizeOptionalText(passwd_fields[5]) ?? undefined,
        login_shell: NormalizeOptionalText(passwd_fields[6]) ?? undefined,
        is_system_account: uid < 1000,
        is_login_shell: IsIdentityLoginShell(passwd_fields[6]),
        is_locked: existing_user?.is_locked ?? is_locked_from_password,
        is_disabled: existing_user?.is_disabled ?? is_disabled_from_password,
        is_expired: existing_user?.is_expired,
        password_status: existing_user?.password_status ?? ParseIdentityPasswordStatus(password_field),
        primary_group_name: existing_user?.primary_group_name,
        supplementary_groups: existing_user?.supplementary_groups,
        has_sudo_signal: existing_user?.has_sudo_signal ?? false,
        sudo_signal_sources: existing_user?.sudo_signal_sources ?? [],
        status_source_confidence: existing_user?.status_source_confidence ?? {
          account_status: "unknown",
          expiry_status: "unknown",
          privilege_signal: "unknown",
          last_login: "unknown",
        },
        last_login_at_iso: existing_user?.last_login_at_iso,
        source_kind,
        warnings: existing_user?.warnings,
      });
      continue;
    }
    if (normalized_line.startsWith("__GROUP__\t")) {
      const fields = raw_line.split("\t");
      const source_kind = ResolveIdentitySourceKind(fields[1]);
      const payload = fields.slice(2).join("\t");
      if (!source_kind) {
        parse_warnings.push({
          source_kind: "probe",
          reason: "identity_parse_failed:unknown_group_source",
          raw_line,
        });
        continue;
      }
      if (primary_source === "unknown") {
        primary_source = source_kind;
      }
      if (source_kind === "file_fallback") {
        fallback_used = true;
      }
      const group_fields = payload.split(":");
      if (group_fields.length < 4) {
        parse_warnings.push({
          source_kind,
          reason: "identity_parse_failed:invalid_group_record",
          raw_line: payload,
        });
        continue;
      }
      const group_name = NormalizeOptionalText(group_fields[0]);
      const gid = ParseOptionalInteger(group_fields[2]);
      if (!group_name || gid === undefined) {
        parse_warnings.push({
          source_kind,
          reason: "identity_parse_failed:invalid_group_fields",
          raw_line: payload,
        });
        continue;
      }
      const members = NormalizeOptionalText(group_fields[3])
        ?.split(",")
        .map((member_name) => member_name.trim())
        .filter((member_name) => member_name.length > 0) ?? [];
      const existing_group = groups_by_name.get(group_name.toLowerCase());
      groups_by_name.set(group_name.toLowerCase(), {
        group_name,
        gid,
        members: [...new Set([...(existing_group?.members ?? []), ...members])],
        is_system_group: gid < 1000,
        is_admin_group_signal: existing_group?.is_admin_group_signal ?? false,
        source_kind,
        warnings: existing_group?.warnings,
      });
      continue;
    }
    if (normalized_line.startsWith("__PWS__\t")) {
      const fields = raw_line.split("\t");
      const username = NormalizeOptionalText(fields[1]);
      const payload = fields.slice(2).join("\t");
      if (!username) {
        parse_warnings.push({
          source_kind: "shadow_status",
          reason: "identity_parse_failed:invalid_passwd_status_record",
          raw_line,
        });
        continue;
      }
      const existing_user = users_by_name.get(username.toLowerCase());
      if (!existing_user) {
        continue;
      }
      const status_tokens = payload.trim().split(/\s+/g);
      const status_token = status_tokens.length > 1
        && status_tokens[0].toLowerCase() === username.toLowerCase()
        ? status_tokens[1]
        : (status_tokens[0] ?? "");
      const password_status = ParseIdentityPasswordStatus(status_token);
      users_by_name.set(username.toLowerCase(), {
        ...existing_user,
        is_locked: password_status === "locked" ? true : existing_user.is_locked,
        is_disabled: password_status === "no_password" ? true : existing_user.is_disabled,
        password_status,
      });
      continue;
    }
    if (normalized_line.startsWith("__CHAGE__\t")) {
      const fields = raw_line.split("\t");
      const username = NormalizeOptionalText(fields[1]);
      const payload = fields.slice(2).join("\t");
      if (!username) {
        parse_warnings.push({
          source_kind: "shadow_status",
          reason: "identity_parse_failed:invalid_chage_record",
          raw_line,
        });
        continue;
      }
      const existing_user = users_by_name.get(username.toLowerCase());
      if (!existing_user) {
        continue;
      }
      const account_expires_match = payload.match(/Account expires\s*:\s*([^;]+)/i);
      if (account_expires_match) {
        const expires_value = account_expires_match[1].trim();
        if (expires_value.length > 0) {
          if (expires_value.toLowerCase() === "never") {
            users_by_name.set(username.toLowerCase(), {
              ...existing_user,
              is_expired: false,
            });
          } else {
            const parsed_expiry_ms = Date.parse(expires_value);
            if (!Number.isNaN(parsed_expiry_ms)) {
              users_by_name.set(username.toLowerCase(), {
                ...existing_user,
                is_expired: parsed_expiry_ms < Date.now(),
              });
            } else {
              parse_warnings.push({
                source_kind: "shadow_status",
                reason: "identity_parse_failed:invalid_account_expiry",
                raw_line,
              });
            }
          }
        }
      }
      continue;
    }
    if (normalized_line.startsWith("__LASTLOG__\t")) {
      const payload = raw_line.slice("__LASTLOG__\t".length).trim();
      const username_match = payload.match(/^([^\s]+)\s+(.+)$/);
      if (!username_match) {
        continue;
      }
      const username = NormalizeOptionalText(username_match[1]);
      if (!username) {
        continue;
      }
      const existing_user = users_by_name.get(username.toLowerCase());
      if (!existing_user) {
        continue;
      }
      if (payload.includes("**Never logged in**")) {
        continue;
      }
      const parsed_last_login_iso = ParseIdentityLastLoginIso(username_match[2]);
      if (parsed_last_login_iso) {
        users_by_name.set(username.toLowerCase(), {
          ...existing_user,
          last_login_at_iso: parsed_last_login_iso,
        });
      }
      continue;
    }
    if (normalized_line.startsWith("__SUDOER__\t")) {
      const fields = raw_line.split("\t");
      let source_path = NormalizeOptionalText(fields[1]) ?? "unknown";
      let payload = fields.slice(2).join("\t").trim();
      if (payload.length === 0 && fields.length === 2) {
        source_path = "unknown";
        payload = (fields[1] ?? "").trim();
      }
      if (!payload || payload.startsWith("#")) {
        continue;
      }
      const first_token = payload.split(/\s+/g)[0]?.trim();
      if (!first_token || first_token.toLowerCase() === "defaults" || first_token.toLowerCase().endsWith("_alias")) {
        continue;
      }
      if (first_token.startsWith("%")) {
        const group_name = first_token.slice(1).toLowerCase();
        sudo_groups.add(group_name);
        const current_sources = sudo_group_sources.get(group_name) ?? [];
        current_sources.push(source_path);
        sudo_group_sources.set(group_name, current_sources);
      } else {
        const username = first_token.toLowerCase();
        sudo_users.add(username);
        const current_sources = sudo_user_sources.get(username) ?? [];
        current_sources.push(source_path);
        sudo_user_sources.set(username, current_sources);
      }
      continue;
    }
    if (normalized_line.startsWith("__SUDOINCLUDE__\t")) {
      continue;
    }
    if (normalized_line.startsWith("__SUDOERS_LIMIT__\t")) {
      const fields = raw_line.split("\t");
      parse_warnings.push({
        source_kind: "sudoers",
        reason: `identity_partial_data:sudoers_limit:${NormalizeOptionalText(fields[2]) ?? "unknown"}`,
        raw_line: NormalizeOptionalText(fields[1]) ?? undefined,
      });
      continue;
    }
  }

  return {
    primary_source,
    fallback_used,
    users: [...users_by_name.values()],
    groups: [...groups_by_name.values()],
    sudo_users,
    sudo_groups,
    sudo_user_sources: NormalizeIdentitySourceMap(sudo_user_sources),
    sudo_group_sources: NormalizeIdentitySourceMap(sudo_group_sources),
    scan_errors,
    parse_warnings,
  };
}

function BuildIdentitySummary(params: {
  users: proxmox_lxc_identity_user_t[];
  groups: proxmox_lxc_identity_group_t[];
}): {
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
} {
  const enabled_users = params.users.filter((user_record) => user_record.is_locked !== true && user_record.is_disabled !== true).length;
  const disabled_or_locked_users = params.users.filter((user_record) => user_record.is_locked === true || user_record.is_disabled === true).length;
  const expired_users = params.users.filter((user_record) => user_record.is_expired === true).length;
  const system_users = params.users.filter((user_record) => user_record.is_system_account).length;
  const human_users_estimate = params.users.filter((user_record) => !user_record.is_system_account && user_record.is_login_shell).length;
  const sudo_signal_user_count = params.users.filter((user_record) => user_record.has_sudo_signal).length;
  const top_privileged_groups = [...params.groups]
    .filter((group_record) => group_record.is_admin_group_signal)
    .sort((left_group, right_group) => {
      if (left_group.members.length !== right_group.members.length) {
        return right_group.members.length - left_group.members.length;
      }
      return left_group.group_name.localeCompare(right_group.group_name);
    })
    .slice(0, 10)
    .map((group_record) => group_record.group_name);

  let unknown_or_partial_count = 0;
  for (const user_record of params.users) {
    if (!user_record.primary_group_name) {
      unknown_or_partial_count += 1;
    }
    if (user_record.password_status === "unknown") {
      unknown_or_partial_count += 1;
    }
  }
  return {
    total_users: params.users.length,
    total_groups: params.groups.length,
    enabled_users,
    disabled_or_locked_users,
    expired_users,
    system_users,
    human_users_estimate,
    sudo_signal_user_count,
    top_privileged_groups,
    unknown_or_partial_count,
  };
}

function ResolveIdentitySourceKind(raw_value: string | undefined): proxmox_lxc_identity_source_kind_t | undefined {
  if (!raw_value) {
    return undefined;
  }
  const normalized_value = raw_value.trim().toLowerCase();
  if (
    normalized_value === "getent"
    || normalized_value === "file_fallback"
    || normalized_value === "shadow_status"
    || normalized_value === "last_login"
    || normalized_value === "sudoers"
  ) {
    return normalized_value;
  }
  return undefined;
}

function ParseIdentityPasswordStatus(raw_value: string): "locked" | "set" | "no_password" | "unknown" {
  const normalized_value = raw_value.trim().toUpperCase();
  if (!normalized_value) {
    return "unknown";
  }
  if (normalized_value === "L" || normalized_value === "LK" || normalized_value === "LOCKED") {
    return "locked";
  }
  if (normalized_value === "NP" || normalized_value === "NPASSWD" || normalized_value === "NO_PASSWORD") {
    return "no_password";
  }
  if (normalized_value === "P" || normalized_value === "PS" || normalized_value === "SET") {
    return "set";
  }
  if (normalized_value.startsWith("!")) {
    return "locked";
  }
  return "unknown";
}

function ParseIdentityLastLoginIso(raw_value: string): string | undefined {
  if (/never logged in/i.test(raw_value)) {
    return undefined;
  }
  const parsed_timestamp = Date.parse(raw_value.trim());
  if (Number.isNaN(parsed_timestamp)) {
    return undefined;
  }
  return new Date(parsed_timestamp).toISOString();
}

function IsIdentityLoginShell(raw_value: string | undefined): boolean {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (!normalized_value) {
    return false;
  }
  if (normalized_value.includes("nologin") || normalized_value.endsWith("/false") || normalized_value === "false") {
    return false;
  }
  return true;
}

function ResolveIdentityPrivilegeDetailMode(params: {
  raw_value: string | undefined;
  include_sudo_privilege_signals: boolean;
}): proxmox_lxc_identity_privilege_detail_mode_t {
  if (!params.include_sudo_privilege_signals) {
    return "signals_only";
  }
  const normalized_value = NormalizeOptionalText(params.raw_value)?.toLowerCase();
  if (!normalized_value) {
    return "sudoers_expanded";
  }
  if (normalized_value === "signals_only" || normalized_value === "sudoers_expanded") {
    return normalized_value;
  }
  throw new ProxmoxValidationError({
    code: "proxmox.validation.invalid_input",
    message: "privilege_detail_mode must be one of: signals_only, sudoers_expanded.",
    details: {
      field: "privilege_detail_mode",
      value: params.raw_value,
    },
  });
}

function BuildIdentityStatusSourceConfidence(params: {
  include_shadow_status: boolean;
  include_last_login: boolean;
  include_sudo_privilege_signals: boolean;
  privilege_detail_mode: proxmox_lxc_identity_privilege_detail_mode_t;
  password_status: "locked" | "set" | "no_password" | "unknown";
  is_expired: boolean | undefined;
  has_sudo_signal: boolean;
  has_last_login: boolean;
}): {
  account_status: "high" | "medium" | "low" | "unknown";
  expiry_status: "high" | "medium" | "low" | "unknown";
  privilege_signal: "high" | "medium" | "low" | "unknown";
  last_login: "high" | "medium" | "low" | "unknown";
} {
  const account_status = params.password_status !== "unknown"
    ? (params.include_shadow_status ? "high" : "medium")
    : "low";
  const expiry_status = params.is_expired === undefined
    ? (params.include_shadow_status ? "low" : "unknown")
    : (params.include_shadow_status ? "high" : "medium");
  const privilege_signal = !params.include_sudo_privilege_signals
    ? "unknown"
    : params.privilege_detail_mode === "sudoers_expanded"
      ? (params.has_sudo_signal ? "high" : "medium")
      : (params.has_sudo_signal ? "medium" : "low");
  const last_login = !params.include_last_login
    ? "unknown"
    : (params.has_last_login ? "high" : "low");
  return {
    account_status,
    expiry_status,
    privilege_signal,
    last_login,
  };
}

function NormalizeIdentitySourceMap(source_map: Map<string, string[]>): Map<string, string[]> {
  const normalized_map = new Map<string, string[]>();
  for (const [map_key, map_values] of source_map.entries()) {
    normalized_map.set(
      map_key,
      [...new Set(map_values.map((source_value) => source_value.trim()).filter((source_value) => source_value.length > 0))]
        .sort((left_source, right_source) => left_source.localeCompare(right_source)),
    );
  }
  return normalized_map;
}

function BuildFirewallProbeShellCommand(params: {
  include_nat: boolean;
  include_counters: boolean;
  include_ipv6: boolean;
}): string {
  return [
    "# __PROXMOX_FIREWALL_PROBE__",
    "if command -v nft >/dev/null 2>&1; then",
    "  nft list ruleset 2>/dev/null | awk '{printf \"__NFT__\\t%s\\n\",$0}'",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'nft' 'firewall_probe_unavailable:nft'",
    "fi",
    "if command -v iptables >/dev/null 2>&1; then",
    "  iptables -S 2>/dev/null | awk '{printf \"__IPT4S__\\t%s\\n\",$0}'",
    ...(params.include_nat
      ? [
        "  iptables -t nat -S 2>/dev/null | awk '{printf \"__IPT4NAT__\\t%s\\n\",$0}'",
      ]
      : []),
    ...(params.include_counters
      ? [
        "  iptables -L -n -v 2>/dev/null | awk '{printf \"__IPT4C__\\t%s\\n\",$0}'",
      ]
      : []),
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'iptables' 'firewall_probe_unavailable:iptables'",
    "fi",
    ...(params.include_ipv6
      ? [
        "if command -v ip6tables >/dev/null 2>&1; then",
        "  ip6tables -S 2>/dev/null | awk '{printf \"__IPT6S__\\t%s\\n\",$0}'",
        ...(params.include_nat
          ? [
            "  ip6tables -t nat -S 2>/dev/null | awk '{printf \"__IPT6NAT__\\t%s\\n\",$0}'",
          ]
          : []),
        ...(params.include_counters
          ? [
            "  ip6tables -L -n -v 2>/dev/null | awk '{printf \"__IPT6C__\\t%s\\n\",$0}'",
          ]
          : []),
        "else",
        "  printf '__ERR__\\t%s\\t%s\\n' 'ip6tables' 'firewall_partial_data:ip6tables_unavailable'",
        "fi",
      ]
      : []),
    "if command -v ufw >/dev/null 2>&1; then",
    "  ufw status verbose 2>/dev/null | awk '{printf \"__UFW__\\t%s\\n\",$0}'",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'ufw' 'firewall_partial_data:ufw_unavailable'",
    "fi",
    "if command -v firewall-cmd >/dev/null 2>&1; then",
    "  firewall_state=\"$(firewall-cmd --state 2>/dev/null || true)\"",
    "  [ -n \"$firewall_state\" ] && printf '__FWSTATE__\\t%s\\n' \"$firewall_state\"",
    "  firewall_zone=\"$(firewall-cmd --get-default-zone 2>/dev/null || true)\"",
    "  [ -n \"$firewall_zone\" ] && printf '__FWZONE__\\t%s\\n' \"$firewall_zone\"",
    "  if [ -n \"$firewall_zone\" ]; then",
    "    firewall-cmd --zone=\"$firewall_zone\" --list-all 2>/dev/null | awk '{printf \"__FWRULE__\\t%s\\n\",$0}'",
    "  fi",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'firewalld' 'firewall_partial_data:firewalld_unavailable'",
    "fi",
    "if [ -r /proc/sys/net/ipv4/icmp_echo_ignore_all ]; then printf '__SYSCTL__\\t%s\\t%s\\n' 'icmp_echo_ignore_all' \"$(cat /proc/sys/net/ipv4/icmp_echo_ignore_all 2>/dev/null | tr -d '\\r\\n')\"; fi",
    "if [ -r /proc/sys/net/ipv4/icmp_echo_ignore_broadcasts ]; then printf '__SYSCTL__\\t%s\\t%s\\n' 'icmp_echo_ignore_broadcasts' \"$(cat /proc/sys/net/ipv4/icmp_echo_ignore_broadcasts 2>/dev/null | tr -d '\\r\\n')\"; fi",
  ].join("\n");
}

function ResolveFirewallSourceKind(raw_value: string | undefined): proxmox_lxc_firewall_source_kind_t | undefined {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (
    normalized_value === "nft"
    || normalized_value === "iptables"
    || normalized_value === "ip6tables"
    || normalized_value === "ufw"
    || normalized_value === "firewalld"
    || normalized_value === "sysctl"
    || normalized_value === "probe"
  ) {
    return normalized_value;
  }
  return undefined;
}

function ResolveFirewallBackendFromSource(source_kind: proxmox_lxc_firewall_source_kind_t): proxmox_lxc_firewall_backend_t {
  if (source_kind === "nft") {
    return "nftables";
  }
  if (source_kind === "iptables" || source_kind === "ip6tables") {
    return "iptables";
  }
  if (source_kind === "ufw") {
    return "ufw";
  }
  if (source_kind === "firewalld") {
    return "firewalld";
  }
  return "unknown";
}

function NormalizeFirewallFamily(raw_value: string | undefined): proxmox_lxc_firewall_family_t {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (normalized_value === "ip" || normalized_value === "ipv4") {
    return "ipv4";
  }
  if (normalized_value === "ip6" || normalized_value === "ipv6") {
    return "ipv6";
  }
  if (normalized_value === "inet") {
    return "inet";
  }
  return "unknown";
}

function NormalizeFirewallAction(raw_value: string | undefined): proxmox_lxc_firewall_action_t {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (normalized_value === "accept") {
    return "accept";
  }
  if (normalized_value === "drop") {
    return "drop";
  }
  if (normalized_value === "reject") {
    return "reject";
  }
  if (normalized_value === "jump") {
    return "jump";
  }
  if (normalized_value === "return") {
    return "return";
  }
  if (normalized_value === "dnat") {
    return "dnat";
  }
  if (normalized_value === "snat") {
    return "snat";
  }
  if (normalized_value === "masquerade") {
    return "masquerade";
  }
  return "unknown";
}

function NormalizeFirewallPolicy(raw_value: string | undefined): string | undefined {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (!normalized_value) {
    return undefined;
  }
  if (normalized_value === "accept" || normalized_value === "drop" || normalized_value === "reject") {
    return normalized_value;
  }
  return normalized_value;
}

function ExtractFirewallToken(input: string, token: string): string | undefined {
  const token_regex = new RegExp(`(?:^|\\s)${token}\\s+([^\\s]+)`);
  const match = input.match(token_regex);
  return NormalizeOptionalText(match?.[1]) ?? undefined;
}

function ResolveFirewallBackendPrimary(backends_detected: proxmox_lxc_firewall_backend_t[]): proxmox_lxc_firewall_backend_t {
  if (backends_detected.includes("nftables")) {
    return "nftables";
  }
  if (backends_detected.includes("iptables")) {
    return "iptables";
  }
  if (backends_detected.includes("ufw")) {
    return "ufw";
  }
  if (backends_detected.includes("firewalld")) {
    return "firewalld";
  }
  return "unknown";
}

function ParseFirewallProbeOutput(params: {
  probe_output: string;
  include_raw_rules: boolean;
}): {
  firewall: {
    backend_primary: proxmox_lxc_firewall_backend_t;
    backends_detected: proxmox_lxc_firewall_backend_t[];
    is_firewall_active?: boolean;
    default_policy_input?: string;
    default_policy_output?: string;
    default_policy_forward?: string;
    supports_ipv6?: boolean;
  };
  rules: proxmox_lxc_firewall_rule_t[];
  primary_source: proxmox_lxc_firewall_source_kind_t | "unknown";
  fallback_used: boolean;
  sysctl_values: Map<string, string>;
  scan_errors: proxmox_lxc_firewall_scan_error_t[];
  parse_warnings: proxmox_lxc_firewall_parse_warning_t[];
} {
  const rules: proxmox_lxc_firewall_rule_t[] = [];
  const scan_errors: proxmox_lxc_firewall_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_firewall_parse_warning_t[] = [];
  const backends_detected = new Set<proxmox_lxc_firewall_backend_t>();
  const sysctl_values = new Map<string, string>();
  const nft_lines: string[] = [];
  const firewall_policy_by_family_chain = new Map<string, string>();
  let primary_source: proxmox_lxc_firewall_source_kind_t | "unknown" = "unknown";
  let fallback_used = false;
  let ufw_status_active: boolean | undefined;
  let firewalld_state: string | undefined;
  let next_rule_index = 1;

  const RegisterSource = (source_kind: proxmox_lxc_firewall_source_kind_t): void => {
    if (primary_source === "unknown") {
      primary_source = source_kind;
      return;
    }
    if (primary_source !== source_kind) {
      fallback_used = true;
    }
  };

  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      scan_errors.push({
        source_kind: ResolveFirewallSourceKind(fields[1]) ?? "probe",
        reason: fields[2] ?? "firewall_partial_data:probe_error",
      });
      continue;
    }
    if (normalized_line.startsWith("__SYSCTL__\t")) {
      const fields = raw_line.split("\t");
      const key_name = NormalizeOptionalText(fields[1]) ?? undefined;
      const key_value = NormalizeOptionalText(fields[2]) ?? undefined;
      if (key_name && key_value) {
        sysctl_values.set(key_name, key_value);
      }
      continue;
    }
    if (normalized_line.startsWith("__NFT__\t")) {
      const payload = raw_line.slice("__NFT__\t".length).trim();
      backends_detected.add("nftables");
      RegisterSource("nft");
      nft_lines.push(payload);
      continue;
    }
    if (
      normalized_line.startsWith("__IPT4S__\t")
      || normalized_line.startsWith("__IPT4NAT__\t")
      || normalized_line.startsWith("__IPT6S__\t")
      || normalized_line.startsWith("__IPT6NAT__\t")
    ) {
      const is_ipv6 = normalized_line.startsWith("__IPT6");
      const source_kind: proxmox_lxc_firewall_source_kind_t = is_ipv6 ? "ip6tables" : "iptables";
      const family: proxmox_lxc_firewall_family_t = is_ipv6 ? "ipv6" : "ipv4";
      const table = normalized_line.startsWith("__IPT4NAT__\t") || normalized_line.startsWith("__IPT6NAT__\t")
        ? "nat"
        : "filter";
      const payload = raw_line.slice(raw_line.indexOf("\t") + 1).trim();
      backends_detected.add("iptables");
      RegisterSource(source_kind);

      if (!payload.startsWith("-A ")) {
        if (payload.startsWith("-P ")) {
          const policy_match = payload.match(/^-P\s+(\S+)\s+(\S+)/);
          const chain_name = NormalizeOptionalText(policy_match?.[1])?.toLowerCase();
          const policy_value = NormalizeFirewallPolicy(policy_match?.[2]);
          if (
            (chain_name === "input" || chain_name === "output" || chain_name === "forward")
            && policy_value
          ) {
            firewall_policy_by_family_chain.set(`${family}:${chain_name}`, policy_value);
          }
        }
        continue;
      }

      const chain = ExtractFirewallToken(payload, "-A");
      const protocol = NormalizeOptionalText(ExtractFirewallToken(payload, "-p"))?.toLowerCase() ?? undefined;
      const source = ExtractFirewallToken(payload, "-s");
      const destination = ExtractFirewallToken(payload, "-d");
      const interface_in = ExtractFirewallToken(payload, "-i");
      const interface_out = ExtractFirewallToken(payload, "-o");
      const dport = ExtractFirewallToken(payload, "--dport") ?? ExtractFirewallToken(payload, "--dports");
      const sport = ExtractFirewallToken(payload, "--sport") ?? ExtractFirewallToken(payload, "--sports");
      const icmp_type = ExtractFirewallToken(payload, "--icmp-type");
      const state_match = ExtractFirewallToken(payload, "--state") ?? ExtractFirewallToken(payload, "--ctstate");
      const action = NormalizeFirewallAction(ExtractFirewallToken(payload, "-j"));
      rules.push({
        rule_index: next_rule_index,
        family,
        backend: "iptables",
        table,
        chain,
        action,
        protocol,
        src: source,
        dst: destination,
        sport,
        dport,
        icmp_type,
        state_match,
        interface_in,
        interface_out,
        is_established_related_rule: /established|related/i.test(state_match ?? ""),
        is_loopback_rule: (interface_in?.toLowerCase() === "lo")
          || (interface_out?.toLowerCase() === "lo")
          || (source === "127.0.0.1/32")
          || (destination === "127.0.0.1/32")
          || (source === "::1/128")
          || (destination === "::1/128"),
        raw_rule: params.include_raw_rules ? payload.slice(0, 4096) : undefined,
        source_kind,
      });
      next_rule_index += 1;
      continue;
    }
    if (normalized_line.startsWith("__UFW__\t")) {
      const payload = raw_line.slice("__UFW__\t".length).trim();
      backends_detected.add("ufw");
      RegisterSource("ufw");
      if (/^status:/i.test(payload)) {
        if (/inactive/i.test(payload)) {
          ufw_status_active = false;
        } else if (/active/i.test(payload)) {
          ufw_status_active = true;
        }
      }
      if (/^default:/i.test(payload)) {
        const default_policy_match = payload.match(/default:\s*(allow|deny|reject)\s+\(incoming\)/i);
        const incoming_policy = NormalizeFirewallPolicy(default_policy_match?.[1]);
        if (incoming_policy) {
          firewall_policy_by_family_chain.set("ipv4:input", incoming_policy);
        }
      }
      const ufw_rule_match = payload.match(/^([0-9]+)(?:\/(tcp|udp))?\s+ALLOW/i);
      if (ufw_rule_match) {
        rules.push({
          rule_index: next_rule_index,
          family: "ipv4",
          backend: "ufw",
          action: "accept",
          protocol: (NormalizeOptionalText(ufw_rule_match[2]) ?? "tcp"),
          dport: NormalizeOptionalText(ufw_rule_match[1]) ?? undefined,
          is_established_related_rule: false,
          is_loopback_rule: false,
          raw_rule: params.include_raw_rules ? payload.slice(0, 4096) : undefined,
          source_kind: "ufw",
        });
        next_rule_index += 1;
      }
      continue;
    }
    if (normalized_line.startsWith("__FWSTATE__\t")) {
      const payload = raw_line.slice("__FWSTATE__\t".length).trim();
      backends_detected.add("firewalld");
      RegisterSource("firewalld");
      firewalld_state = payload.toLowerCase();
      continue;
    }
    if (normalized_line.startsWith("__FWZONE__\t")) {
      backends_detected.add("firewalld");
      continue;
    }
    if (normalized_line.startsWith("__FWRULE__\t")) {
      const payload = raw_line.slice("__FWRULE__\t".length).trim();
      if (/^services:/i.test(payload)) {
        const services = NormalizeOptionalText(payload.slice("services:".length))
          ?.split(/\s+/g)
          .filter((service_name) => service_name.length > 0) ?? [];
        for (const service_name of services) {
          rules.push({
            rule_index: next_rule_index,
            family: "ipv4",
            backend: "firewalld",
            action: "accept",
            protocol: "tcp",
            dport: service_name,
            is_established_related_rule: false,
            is_loopback_rule: false,
            raw_rule: params.include_raw_rules ? payload.slice(0, 4096) : undefined,
            source_kind: "firewalld",
          });
          next_rule_index += 1;
        }
      }
      if (/^ports:/i.test(payload)) {
        const ports = NormalizeOptionalText(payload.slice("ports:".length))
          ?.split(/\s+/g)
          .filter((port_value) => port_value.length > 0) ?? [];
        for (const port_value of ports) {
          const port_match = port_value.match(/^(\d+)(?:-(\d+))?\/(tcp|udp)$/i);
          if (!port_match) {
            continue;
          }
          const protocol_name = NormalizeOptionalText(port_match[3])?.toLowerCase() ?? "tcp";
          const normalized_port_value = port_match[2]
            ? `${port_match[1]}-${port_match[2]}`
            : port_match[1];
          rules.push({
            rule_index: next_rule_index,
            family: "ipv4",
            backend: "firewalld",
            action: "accept",
            protocol: protocol_name,
            dport: normalized_port_value,
            is_established_related_rule: false,
            is_loopback_rule: false,
            raw_rule: params.include_raw_rules ? payload.slice(0, 4096) : undefined,
            source_kind: "firewalld",
          });
          next_rule_index += 1;
        }
      }
      continue;
    }
  }

  if (nft_lines.length > 0) {
    const nft_parse_result = ParseNftRulesetLines({
      nft_lines,
      include_raw_rules: params.include_raw_rules,
      starting_rule_index: next_rule_index,
    });
    rules.push(...nft_parse_result.rules);
    parse_warnings.push(...nft_parse_result.parse_warnings);
    for (const [policy_key, policy_value] of nft_parse_result.policy_by_family_chain.entries()) {
      firewall_policy_by_family_chain.set(policy_key, policy_value);
    }
    next_rule_index = nft_parse_result.next_rule_index;
  }

  const backends = [...backends_detected];
  const backend_primary = ResolveFirewallBackendPrimary(backends);
  const default_policy_input = firewall_policy_by_family_chain.get("ipv4:input")
    ?? firewall_policy_by_family_chain.get("inet:input")
    ?? firewall_policy_by_family_chain.get("ipv6:input");
  const default_policy_output = firewall_policy_by_family_chain.get("ipv4:output")
    ?? firewall_policy_by_family_chain.get("inet:output")
    ?? firewall_policy_by_family_chain.get("ipv6:output");
  const default_policy_forward = firewall_policy_by_family_chain.get("ipv4:forward")
    ?? firewall_policy_by_family_chain.get("inet:forward")
    ?? firewall_policy_by_family_chain.get("ipv6:forward");
  const supports_ipv6 = rules.some((rule_record) => rule_record.family === "ipv6" || rule_record.family === "inet")
    || [...firewall_policy_by_family_chain.keys()].some((policy_key) => policy_key.startsWith("ipv6:") || policy_key.startsWith("inet:"))
    || backends.includes("nftables")
    || backends.includes("iptables");
  const is_firewall_active = backends.length > 0
    && (
      rules.length > 0
      || ufw_status_active === true
      || firewalld_state === "running"
      || typeof default_policy_input === "string"
    );

  rules.sort((left_rule, right_rule) => {
    const left_rule_index = left_rule.rule_index ?? Number.MAX_SAFE_INTEGER;
    const right_rule_index = right_rule.rule_index ?? Number.MAX_SAFE_INTEGER;
    if (left_rule_index !== right_rule_index) {
      return left_rule_index - right_rule_index;
    }
    if (left_rule.family !== right_rule.family) {
      return left_rule.family.localeCompare(right_rule.family);
    }
    if (left_rule.backend !== right_rule.backend) {
      return left_rule.backend.localeCompare(right_rule.backend);
    }
    const left_table = left_rule.table ?? "";
    const right_table = right_rule.table ?? "";
    if (left_table !== right_table) {
      return left_table.localeCompare(right_table);
    }
    const left_chain = left_rule.chain ?? "";
    const right_chain = right_rule.chain ?? "";
    if (left_chain !== right_chain) {
      return left_chain.localeCompare(right_chain);
    }
    const left_dport = left_rule.dport ?? "";
    const right_dport = right_rule.dport ?? "";
    if (left_dport !== right_dport) {
      return left_dport.localeCompare(right_dport);
    }
    const left_protocol = left_rule.protocol ?? "";
    const right_protocol = right_rule.protocol ?? "";
    return left_protocol.localeCompare(right_protocol);
  });

  return {
    firewall: {
      backend_primary,
      backends_detected: backends,
      is_firewall_active,
      default_policy_input,
      default_policy_output,
      default_policy_forward,
      supports_ipv6,
    },
    rules,
    primary_source,
    fallback_used,
    sysctl_values,
    scan_errors,
    parse_warnings,
  };
}

function ParseNftRulesetLines(params: {
  nft_lines: string[];
  include_raw_rules: boolean;
  starting_rule_index: number;
}): {
  rules: proxmox_lxc_firewall_rule_t[];
  parse_warnings: proxmox_lxc_firewall_parse_warning_t[];
  policy_by_family_chain: Map<string, string>;
  next_rule_index: number;
} {
  const rules: proxmox_lxc_firewall_rule_t[] = [];
  const parse_warnings: proxmox_lxc_firewall_parse_warning_t[] = [];
  const policy_by_family_chain = new Map<string, string>();
  const nft_text = params.nft_lines.join("\n");
  const set_elements_by_name = ParseNftSetElements({ nft_text });
  const map_elements_by_name = ParseNftMapElements({ nft_text });
  let rule_index = params.starting_rule_index;
  let current_family: proxmox_lxc_firewall_family_t = "unknown";
  let current_table: string | undefined;
  let current_chain: string | undefined;
  let current_hook: string | undefined;
  let current_priority: string | undefined;

  for (const raw_line of params.nft_lines) {
    const normalized_line = raw_line.trim().replace(/\s+#.*$/, "");
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("table ")) {
      const table_match = normalized_line.match(/^table\s+(\S+)\s+(\S+)/);
      current_family = NormalizeFirewallFamily(table_match?.[1]);
      current_table = NormalizeOptionalText(table_match?.[2]) ?? undefined;
      current_chain = undefined;
      current_hook = undefined;
      current_priority = undefined;
      continue;
    }
    if (normalized_line.startsWith("chain ")) {
      const chain_match = normalized_line.match(/^chain\s+(\S+)/);
      current_chain = NormalizeOptionalText(chain_match?.[1]) ?? undefined;
      current_hook = undefined;
      current_priority = undefined;
      continue;
    }
    if (normalized_line === "}" || normalized_line === "};") {
      if (current_chain) {
        current_chain = undefined;
        current_hook = undefined;
        current_priority = undefined;
      }
      continue;
    }
    if (!current_chain) {
      continue;
    }
    if (normalized_line.startsWith("type ")) {
      const hook_match = normalized_line.match(/\bhook\s+(\S+)/);
      const priority_match = normalized_line.match(/\bpriority\s+([^;]+)/);
      const policy_match = normalized_line.match(/\bpolicy\s+(\S+)\s*;/);
      current_hook = NormalizeOptionalText(hook_match?.[1]) ?? current_hook;
      current_priority = NormalizeOptionalText(priority_match?.[1]) ?? current_priority;
      const policy_value = NormalizeFirewallPolicy(policy_match?.[1]);
      const normalized_hook = NormalizeOptionalText(current_hook)?.toLowerCase();
      if (
        (normalized_hook === "input" || normalized_hook === "output" || normalized_hook === "forward")
        && policy_value
      ) {
        policy_by_family_chain.set(`${current_family}:${normalized_hook}`, policy_value);
      }
      continue;
    }
    if (normalized_line.startsWith("policy ")) {
      const policy_match = normalized_line.match(/^policy\s+(\S+)\s*;/);
      const policy_value = NormalizeFirewallPolicy(policy_match?.[1]);
      const normalized_hook = NormalizeOptionalText(current_hook)?.toLowerCase();
      if (
        (normalized_hook === "input" || normalized_hook === "output" || normalized_hook === "forward")
        && policy_value
      ) {
        policy_by_family_chain.set(`${current_family}:${normalized_hook}`, policy_value);
      }
      continue;
    }
    if (
      normalized_line.startsWith("set ")
      || normalized_line.startsWith("map ")
      || normalized_line.startsWith("counter")
      || normalized_line.startsWith("comment")
      || normalized_line.startsWith("elements")
    ) {
      continue;
    }

    const vmap_match = normalized_line.match(/\bdport\s+vmap\s+@([A-Za-z0-9_.-]+)/i);
    const rule_action_match = normalized_line.match(/\b(accept|drop|reject|dnat|snat|masquerade|return|jump)\b/i);
    if (!rule_action_match && !vmap_match) {
      continue;
    }
    let action = rule_action_match ? NormalizeFirewallAction(rule_action_match[1]) : "unknown";
    const protocol_name = NormalizeOptionalText(normalized_line.match(/\b(tcp|udp|icmp|icmpv6)\b/i)?.[1])?.toLowerCase() ?? undefined;
    const source_value = NormalizeOptionalText(
      normalized_line.match(/\b(?:ip|ip6)?\s*saddr\s+([^\s]+)/i)?.[1]
      ?? normalized_line.match(/\bsaddr\s+([^\s]+)/i)?.[1],
    ) ?? undefined;
    const destination_value = NormalizeOptionalText(
      normalized_line.match(/\b(?:ip|ip6)?\s*daddr\s+([^\s]+)/i)?.[1]
      ?? normalized_line.match(/\bdaddr\s+([^\s]+)/i)?.[1],
    ) ?? undefined;

    let dport_value: string | undefined;
    let sport_value: string | undefined;
    if (vmap_match) {
      const map_name = NormalizeOptionalText(vmap_match[1]);
      if (map_name) {
        const map_entries = map_elements_by_name.get(map_name);
        if (map_entries && map_entries.keys.length > 0) {
          dport_value = map_entries.keys.join(",");
          if (action === "unknown" && map_entries.verdicts.length > 0) {
            const unique_verdicts = [...new Set(map_entries.verdicts)];
            if (unique_verdicts.length === 1) {
              action = NormalizeFirewallAction(unique_verdicts[0]);
            }
          }
        } else {
          dport_value = `@${map_name}`;
          parse_warnings.push({
            source_kind: "nft",
            reason: "firewall_partial_data:nft_map_unresolved",
            raw_line: normalized_line,
          });
        }
      }
    } else {
      const set_dport_match = normalized_line.match(/\bdport\s+@([A-Za-z0-9_.-]+)/i);
      if (set_dport_match) {
        const set_name = NormalizeOptionalText(set_dport_match[1]);
        if (set_name) {
          const set_values = set_elements_by_name.get(set_name);
          if (set_values && set_values.length > 0) {
            dport_value = set_values.join(",");
          } else {
            dport_value = `@${set_name}`;
            parse_warnings.push({
              source_kind: "nft",
              reason: "firewall_partial_data:nft_set_unresolved",
              raw_line: normalized_line,
            });
          }
        }
      } else {
        const dport_set_literal_match = normalized_line.match(/\bdport\s+\{([^}]+)\}/i);
        if (dport_set_literal_match) {
          const dport_values = ParseNftElementList({ raw_elements: dport_set_literal_match[1] });
          if (dport_values.length > 0) {
            dport_value = dport_values.join(",");
          }
        } else {
          dport_value = NormalizeOptionalText(normalized_line.match(/\bdport\s+([^\s]+)/i)?.[1]) ?? undefined;
        }
      }
    }

    const sport_set_literal_match = normalized_line.match(/\bsport\s+\{([^}]+)\}/i);
    if (sport_set_literal_match) {
      const sport_values = ParseNftElementList({ raw_elements: sport_set_literal_match[1] });
      if (sport_values.length > 0) {
        sport_value = sport_values.join(",");
      }
    } else {
      sport_value = NormalizeOptionalText(normalized_line.match(/\bsport\s+([^\s]+)/i)?.[1]) ?? undefined;
    }

    const icmp_type_value = NormalizeOptionalText(normalized_line.match(/\bicmp(v6)?\s+type\s+([^\s]+)/i)?.[2]) ?? undefined;
    const state_value = NormalizeOptionalText(normalized_line.match(/\bct state\s+([^;]+)/i)?.[1]) ?? undefined;
    const interface_in_value = NormalizeOptionalText(
      normalized_line.match(/\biif(name)?\s+\"?([^\s\"]+)\"?/i)?.[2],
    ) ?? undefined;
    const interface_out_value = NormalizeOptionalText(
      normalized_line.match(/\boif(name)?\s+\"?([^\s\"]+)\"?/i)?.[2],
    ) ?? undefined;
    const normalized_chain = NormalizeOptionalText(current_chain) ?? undefined;
    const normalized_hook = NormalizeOptionalText(current_hook) ?? undefined;

    rules.push({
      rule_index,
      family: current_family,
      backend: "nftables",
      table: current_table,
      chain: normalized_chain,
      hook: normalized_hook,
      priority: current_priority,
      action,
      protocol: protocol_name,
      src: source_value,
      dst: destination_value,
      sport: sport_value,
      dport: dport_value,
      icmp_type: icmp_type_value,
      state_match: state_value,
      interface_in: interface_in_value,
      interface_out: interface_out_value,
      is_established_related_rule: /established|related/i.test(state_value ?? ""),
      is_loopback_rule: (interface_in_value?.toLowerCase() === "lo")
        || (interface_out_value?.toLowerCase() === "lo")
        || /(^|,|\s)127\.0\.0\.1($|,|\s)|(^|,|\s)::1($|,|\s)/.test(source_value ?? "")
        || /(^|,|\s)127\.0\.0\.1($|,|\s)|(^|,|\s)::1($|,|\s)/.test(destination_value ?? ""),
      raw_rule: params.include_raw_rules ? normalized_line.slice(0, 4096) : undefined,
      source_kind: "nft",
    });
    rule_index += 1;
  }

  return {
    rules,
    parse_warnings,
    policy_by_family_chain,
    next_rule_index: rule_index,
  };
}

function ParseNftElementList(params: {
  raw_elements: string;
}): string[] {
  return [...new Set(
    params.raw_elements
      .split(",")
      .map((entry_value) => entry_value.trim().replace(/;+$/g, "").replace(/^"+|"+$/g, ""))
      .filter((entry_value) => entry_value.length > 0),
  )];
}

function ParseNftSetElements(params: {
  nft_text: string;
}): Map<string, string[]> {
  const set_elements_by_name = new Map<string, string[]>();
  const set_regex = /\bset\s+([A-Za-z0-9_.-]+)\s*\{[\s\S]*?elements\s*=\s*\{([\s\S]*?)\}[\s\S]*?\}/g;
  for (const set_match of params.nft_text.matchAll(set_regex)) {
    const set_name = NormalizeOptionalText(set_match[1]);
    const raw_elements = NormalizeOptionalText(set_match[2]);
    if (!set_name || !raw_elements) {
      continue;
    }
    set_elements_by_name.set(set_name, ParseNftElementList({ raw_elements }));
  }
  return set_elements_by_name;
}

function ParseNftMapElements(params: {
  nft_text: string;
}): Map<string, { keys: string[]; verdicts: string[] }> {
  const map_elements_by_name = new Map<string, { keys: string[]; verdicts: string[] }>();
  const map_regex = /\bmap\s+([A-Za-z0-9_.-]+)\s*\{[\s\S]*?elements\s*=\s*\{([\s\S]*?)\}[\s\S]*?\}/g;
  for (const map_match of params.nft_text.matchAll(map_regex)) {
    const map_name = NormalizeOptionalText(map_match[1]);
    const raw_elements = NormalizeOptionalText(map_match[2]);
    if (!map_name || !raw_elements) {
      continue;
    }
    const keys: string[] = [];
    const verdicts: string[] = [];
    for (const entry_value of raw_elements.split(",")) {
      const normalized_entry = entry_value.trim().replace(/;+$/g, "");
      if (!normalized_entry) {
        continue;
      }
      const key_value_match = normalized_entry.match(/^([^:]+):\s*(.+)$/);
      if (!key_value_match) {
        continue;
      }
      const key_name = NormalizeOptionalText(key_value_match[1]) ?? undefined;
      const verdict_name = NormalizeOptionalText(key_value_match[2])?.toLowerCase() ?? undefined;
      if (!key_name) {
        continue;
      }
      keys.push(key_name);
      if (verdict_name) {
        verdicts.push(verdict_name);
      }
    }
    map_elements_by_name.set(map_name, {
      keys: [...new Set(keys)],
      verdicts: [...new Set(verdicts)],
    });
  }
  return map_elements_by_name;
}

function DetermineFirewallIngressPosture(params: {
  rules: proxmox_lxc_firewall_rule_t[];
  protocol: "tcp" | "udp";
  ingress_default_deny: boolean | "unknown";
}): "allow_any" | "allow_restricted" | "deny_default" | "unknown" {
  const ingress_rules = params.rules.filter((rule_record) => {
    const chain_name = NormalizeOptionalText(rule_record.chain)?.toLowerCase();
    if (chain_name && chain_name !== "input") {
      return false;
    }
    if (rule_record.action !== "accept") {
      return false;
    }
    if (rule_record.protocol && rule_record.protocol !== params.protocol) {
      return false;
    }
    return true;
  });
  if (ingress_rules.length === 0) {
    if (params.ingress_default_deny === true) {
      return "deny_default";
    }
    if (params.ingress_default_deny === false) {
      return "allow_any";
    }
    return "unknown";
  }
  const has_allow_any = ingress_rules.some((rule_record) => IsBroadIngressRule(rule_record));
  if (has_allow_any) {
    return "allow_any";
  }
  if (params.ingress_default_deny === false) {
    return "allow_any";
  }
  return "allow_restricted";
}

function IsBroadIngressRule(rule_record: proxmox_lxc_firewall_rule_t): boolean {
  const normalized_src = NormalizeOptionalText(rule_record.src)?.toLowerCase();
  const source_is_any = !normalized_src
    || normalized_src === "0.0.0.0/0"
    || normalized_src === "::/0"
    || normalized_src === "anywhere"
    || normalized_src === "0.0.0.0";
  const chain_name = NormalizeOptionalText(rule_record.chain)?.toLowerCase();
  const is_ingress = !chain_name || chain_name === "input";
  const has_port_restriction = typeof rule_record.dport === "string" || typeof rule_record.sport === "string";
  const has_icmp_specifics = typeof rule_record.icmp_type === "string";
  if (
    has_port_restriction
    || has_icmp_specifics
    || rule_record.is_established_related_rule
    || rule_record.is_loopback_rule
  ) {
    return false;
  }
  return source_is_any && is_ingress;
}

function BuildFirewallPosture(params: {
  firewall: {
    default_policy_input?: string;
  };
  rules: proxmox_lxc_firewall_rule_t[];
  sysctl_values: Map<string, string>;
}): {
  icmp_echo_request_allowed: true | false | "unknown";
  ingress_tcp_posture: "allow_any" | "allow_restricted" | "deny_default" | "unknown";
  ingress_udp_posture: "allow_any" | "allow_restricted" | "deny_default" | "unknown";
  ingress_default_deny: boolean | "unknown";
  notable_findings: proxmox_lxc_firewall_finding_t[];
} {
  const input_policy = NormalizeOptionalText(params.firewall.default_policy_input)?.toLowerCase();
  const ingress_default_deny: boolean | "unknown" = input_policy
    ? (input_policy === "drop" || input_policy === "reject")
    : "unknown";

  let icmp_echo_request_allowed: true | false | "unknown" = "unknown";
  const icmp_ignore_all = params.sysctl_values.get("icmp_echo_ignore_all");
  if (icmp_ignore_all === "1") {
    icmp_echo_request_allowed = false;
  }
  if (icmp_ignore_all === "0") {
    icmp_echo_request_allowed = true;
  }
  const has_icmp_allow_rule = params.rules.some((rule_record) => {
    if (rule_record.action !== "accept") {
      return false;
    }
    const protocol = NormalizeOptionalText(rule_record.protocol)?.toLowerCase();
    if (protocol !== "icmp" && protocol !== "icmpv6") {
      return false;
    }
    if (rule_record.icmp_type) {
      return /echo-request|8/.test(rule_record.icmp_type);
    }
    return true;
  });
  if (has_icmp_allow_rule) {
    icmp_echo_request_allowed = true;
  } else if (icmp_echo_request_allowed === "unknown" && ingress_default_deny === true) {
    icmp_echo_request_allowed = false;
  }

  const ingress_tcp_posture = DetermineFirewallIngressPosture({
    rules: params.rules,
    protocol: "tcp",
    ingress_default_deny,
  });
  const ingress_udp_posture = DetermineFirewallIngressPosture({
    rules: params.rules,
    protocol: "udp",
    ingress_default_deny,
  });

  return {
    icmp_echo_request_allowed,
    ingress_tcp_posture,
    ingress_udp_posture,
    ingress_default_deny,
    notable_findings: [],
  };
}

function IsSensitivePort(port_value: string | undefined): boolean {
  const normalized_value = NormalizeOptionalText(port_value);
  if (!normalized_value) {
    return false;
  }
  const numeric_part = normalized_value.split(/[,:-]/g)[0];
  const parsed_port = Number.parseInt(numeric_part, 10);
  if (!Number.isFinite(parsed_port) || Number.isNaN(parsed_port)) {
    return false;
  }
  return [22, 2375, 2376, 3306, 5432, 6379, 6443, 9200].includes(parsed_port);
}

function BuildFirewallFindings(params: {
  firewall: {
    backends_detected: proxmox_lxc_firewall_backend_t[];
    is_firewall_active?: boolean;
    default_policy_input?: string;
  };
  rules: proxmox_lxc_firewall_rule_t[];
  posture: {
    icmp_echo_request_allowed: true | false | "unknown";
    ingress_tcp_posture: "allow_any" | "allow_restricted" | "deny_default" | "unknown";
    ingress_udp_posture: "allow_any" | "allow_restricted" | "deny_default" | "unknown";
  };
}): proxmox_lxc_firewall_finding_t[] {
  const findings: proxmox_lxc_firewall_finding_t[] = [];
  if (params.firewall.backends_detected.length === 0) {
    findings.push({
      severity: "medium",
      reason_code: "firewall_probe_unavailable",
      summary: "No firewall backend tooling was detected inside the container.",
      remediation_hint: "Install or enable a supported firewall backend if policy enforcement is required.",
    });
  }
  if (params.firewall.is_firewall_active === false) {
    findings.push({
      severity: "high",
      reason_code: "firewall_inactive",
      summary: "Firewall tooling was detected but appears inactive.",
      remediation_hint: "Enable firewall policy enforcement for ingress filtering.",
    });
  }
  if (NormalizeOptionalText(params.firewall.default_policy_input)?.toLowerCase() === "accept") {
    findings.push({
      severity: "medium",
      reason_code: "firewall_default_input_accept",
      summary: "Default INPUT policy is ACCEPT.",
      remediation_hint: "Prefer default deny and explicit allow rules for required services.",
    });
  }
  if (params.posture.ingress_tcp_posture === "allow_any") {
    findings.push({
      severity: "high",
      reason_code: "firewall_tcp_allow_any",
      summary: "TCP ingress appears broadly allowed.",
      remediation_hint: "Restrict ingress to required source ranges and ports.",
    });
  }
  if (params.posture.ingress_udp_posture === "allow_any") {
    findings.push({
      severity: "high",
      reason_code: "firewall_udp_allow_any",
      summary: "UDP ingress appears broadly allowed.",
      remediation_hint: "Restrict UDP ingress to explicit service requirements.",
    });
  }
  if (params.posture.icmp_echo_request_allowed === true) {
    findings.push({
      severity: "info",
      reason_code: "firewall_icmp_echo_allowed",
      summary: "ICMP echo requests appear allowed.",
      remediation_hint: "Validate whether ping reachability aligns with your baseline.",
    });
  }
  if (!params.rules.some((rule_record) => rule_record.is_established_related_rule)) {
    findings.push({
      severity: "low",
      reason_code: "firewall_missing_established_related_rule",
      summary: "No explicit ESTABLISHED/RELATED rule detected.",
      remediation_hint: "Consider explicit return-path handling for stateful filtering.",
    });
  }
  if (!params.rules.some((rule_record) => rule_record.is_loopback_rule)) {
    findings.push({
      severity: "low",
      reason_code: "firewall_missing_loopback_rule",
      summary: "No explicit loopback accept rule detected.",
      remediation_hint: "Confirm local inter-process traffic is intentionally controlled.",
    });
  }
  for (const rule_record of params.rules) {
    if (
      rule_record.action === "accept"
      && IsBroadIngressRule(rule_record)
      && IsSensitivePort(rule_record.dport)
    ) {
      findings.push({
        severity: "high",
        reason_code: "firewall_sensitive_port_open_global",
        summary: `Broad ingress allow detected on sensitive port target (${rule_record.dport ?? "unknown"}).`,
        remediation_hint: "Limit source scope and enforce least-privilege ingress rules.",
      });
    }
  }
  const deduped_finding_map = new Map<string, proxmox_lxc_firewall_finding_t>();
  for (const finding_record of findings) {
    const finding_key = `${finding_record.severity}:${finding_record.reason_code}:${finding_record.summary}`;
    if (!deduped_finding_map.has(finding_key)) {
      deduped_finding_map.set(finding_key, finding_record);
    }
  }
  return [...deduped_finding_map.values()];
}

function BuildFirewallSummary(params: {
  rules: proxmox_lxc_firewall_rule_t[];
  findings: proxmox_lxc_firewall_finding_t[];
  parse_warning_count: number;
  scan_error_count: number;
}): {
  total_rules: number;
  backend_counts: Record<string, number>;
  family_counts: Record<string, number>;
  action_counts: Record<string, number>;
  protocol_counts: Record<string, number>;
  open_ingress_port_hints: string[];
  finding_counts_by_severity: Record<string, number>;
  unknown_or_partial_count: number;
} {
  const backend_counts: Record<string, number> = {};
  const family_counts: Record<string, number> = {};
  const action_counts: Record<string, number> = {};
  const protocol_counts: Record<string, number> = {};
  const open_ingress_port_hints = new Set<string>();
  for (const rule_record of params.rules) {
    backend_counts[rule_record.backend] = (backend_counts[rule_record.backend] ?? 0) + 1;
    family_counts[rule_record.family] = (family_counts[rule_record.family] ?? 0) + 1;
    action_counts[rule_record.action] = (action_counts[rule_record.action] ?? 0) + 1;
    const protocol_name = rule_record.protocol ?? "unknown";
    protocol_counts[protocol_name] = (protocol_counts[protocol_name] ?? 0) + 1;
    if (rule_record.action === "accept" && rule_record.dport) {
      open_ingress_port_hints.add(`${protocol_name}:${rule_record.dport}`);
    }
  }
  const finding_counts_by_severity: Record<string, number> = {};
  for (const finding_record of params.findings) {
    finding_counts_by_severity[finding_record.severity] = (finding_counts_by_severity[finding_record.severity] ?? 0) + 1;
  }
  return {
    total_rules: params.rules.length,
    backend_counts,
    family_counts,
    action_counts,
    protocol_counts,
    open_ingress_port_hints: [...open_ingress_port_hints].sort((left_value, right_value) => left_value.localeCompare(right_value)),
    finding_counts_by_severity,
    unknown_or_partial_count: params.parse_warning_count + params.scan_error_count,
  };
}

function BuildDevelopmentToolingProbeShellCommand(params: {
  include_c_cpp: boolean;
  include_nodejs: boolean;
  include_python: boolean;
  include_ruby: boolean;
  include_go: boolean;
  include_rust: boolean;
  include_package_inventory: boolean;
  include_compiler_search_paths: boolean;
  include_system_package_providers: boolean;
  module_limit_per_runtime: number;
  package_limit_per_runtime: number;
  include_transitive_metadata: boolean;
  include_distro_package_enrichment: boolean;
  distro_package_limit_total: number;
}): string {
  return [
    "# __PROXMOX_DEVTOOLS_PROBE__",
    `devtools_module_limit=${params.module_limit_per_runtime}`,
    `devtools_package_limit=${params.package_limit_per_runtime}`,
    `devtools_distro_limit_total=${params.distro_package_limit_total}`,
    ...(params.include_system_package_providers
      ? [
        "if command -v apt >/dev/null 2>&1; then apt_path=\"$(command -v apt 2>/dev/null || true)\"; apt_version=\"$(apt --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tsystem\\tapt\\t%s\\t%s\\n' \"$apt_path\" \"$apt_version\"; fi",
        "if command -v dpkg >/dev/null 2>&1; then dpkg_path=\"$(command -v dpkg 2>/dev/null || true)\"; dpkg_version=\"$(dpkg --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tsystem\\tdpkg\\t%s\\t%s\\n' \"$dpkg_path\" \"$dpkg_version\"; fi",
        "if command -v rpm >/dev/null 2>&1; then rpm_path=\"$(command -v rpm 2>/dev/null || true)\"; rpm_version=\"$(rpm --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tsystem\\trpm\\t%s\\t%s\\n' \"$rpm_path\" \"$rpm_version\"; fi",
        "if command -v apk >/dev/null 2>&1; then apk_path=\"$(command -v apk 2>/dev/null || true)\"; apk_version=\"$(apk --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tsystem\\tapk\\t%s\\t%s\\n' \"$apk_path\" \"$apk_version\"; fi",
        "if command -v pacman >/dev/null 2>&1; then pacman_path=\"$(command -v pacman 2>/dev/null || true)\"; pacman_version=\"$(pacman --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tsystem\\tpacman\\t%s\\t%s\\n' \"$pacman_path\" \"$pacman_version\"; fi",
      ]
      : []),
    ...(params.include_distro_package_enrichment
      ? [
        "devtools_distro_manager=''",
        "devtools_distro_id=''",
        "if [ -r /etc/os-release ]; then devtools_distro_id=\"$(awk -F= '/^ID=/{gsub(/\"/,\"\",$2); print tolower($2); exit}' /etc/os-release 2>/dev/null)\"; fi",
        "case \"$devtools_distro_id\" in",
        "  ubuntu|debian|linuxmint|kali|raspbian) command -v dpkg >/dev/null 2>&1 && devtools_distro_manager='dpkg' ;;",
        "  alpine) command -v apk >/dev/null 2>&1 && devtools_distro_manager='apk' ;;",
        "  fedora|rhel|centos|rocky|alma|ol|amzn) command -v rpm >/dev/null 2>&1 && devtools_distro_manager='rpm' ;;",
        "  arch|manjaro) command -v pacman >/dev/null 2>&1 && devtools_distro_manager='pacman' ;;",
        "esac",
        "if [ -z \"$devtools_distro_manager\" ]; then",
        "  if command -v dpkg >/dev/null 2>&1; then devtools_distro_manager='dpkg';",
        "  elif command -v apk >/dev/null 2>&1; then devtools_distro_manager='apk';",
        "  elif command -v rpm >/dev/null 2>&1; then devtools_distro_manager='rpm';",
        "  elif command -v pacman >/dev/null 2>&1; then devtools_distro_manager='pacman';",
        "  fi",
        "fi",
        "if [ -n \"$devtools_distro_manager\" ]; then printf '__DISTROPKG_MANAGER__\\t%s\\n' \"$devtools_distro_manager\"; else printf '__ERR__\\tdistro_package_inventory\\t%s\\n' 'devtool_distro_inventory_unavailable:no_supported_manager'; fi",
        "if [ \"$devtools_distro_manager\" = 'dpkg' ]; then",
        "  dpkg -l 2>/dev/null | awk 'NR>5 && (NF>=3) && ($1==\"ii\" || $1==\"hi\" || $1==\"rc\") {printf \"__DISTROPKG__\\tdpkg\\t%s\\t%s\\n\",$2,$3}' | head -n \"$devtools_distro_limit_total\"",
        "elif [ \"$devtools_distro_manager\" = 'apk' ]; then",
        "  apk info -vv 2>/dev/null | sed '/^$/d' | awk '{pkg=$1; ver=\"\"; if (match(pkg, /-[0-9][A-Za-z0-9._-]*$/)) {ver=substr(pkg, RSTART+1); pkg=substr(pkg, 1, RSTART-1)} printf \"__DISTROPKG__\\tapk\\t%s\\t%s\\n\",pkg,ver}' | head -n \"$devtools_distro_limit_total\"",
        "elif [ \"$devtools_distro_manager\" = 'rpm' ]; then",
        "  rpm -qa --qf '%{NAME}\\t%{VERSION}-%{RELEASE}\\n' 2>/dev/null | head -n \"$devtools_distro_limit_total\" | awk 'NF>=1 {printf \"__DISTROPKG__\\trpm\\t%s\\t%s\\n\",$1,$2}'",
        "elif [ \"$devtools_distro_manager\" = 'pacman' ]; then",
        "  pacman -Q 2>/dev/null | head -n \"$devtools_distro_limit_total\" | awk 'NF>=1 {printf \"__DISTROPKG__\\tpacman\\t%s\\t%s\\n\",$1,$2}'",
        "fi",
      ]
      : []),
    ...(params.include_c_cpp
      ? [
        "printf '__ECO__\\t%s\\n' 'c_cpp'",
        "if command -v gcc >/dev/null 2>&1; then gcc_path=\"$(command -v gcc 2>/dev/null || true)\"; gcc_version=\"$(gcc --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tc_cpp\\tgcc\\t%s\\t%s\\n' \"$gcc_path\" \"$gcc_version\"; fi",
        "if command -v g++ >/dev/null 2>&1; then gpp_path=\"$(command -v g++ 2>/dev/null || true)\"; gpp_version=\"$(g++ --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tc_cpp\\tg++\\t%s\\t%s\\n' \"$gpp_path\" \"$gpp_version\"; fi",
        "if command -v clang >/dev/null 2>&1; then clang_path=\"$(command -v clang 2>/dev/null || true)\"; clang_version=\"$(clang --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tc_cpp\\tclang\\t%s\\t%s\\n' \"$clang_path\" \"$clang_version\"; fi",
        "if command -v cc >/dev/null 2>&1; then cc_path=\"$(command -v cc 2>/dev/null || true)\"; cc_version=\"$(cc --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tc_cpp\\tcc\\t%s\\t%s\\n' \"$cc_path\" \"$cc_version\"; fi",
        "if command -v ld >/dev/null 2>&1; then ld_path=\"$(command -v ld 2>/dev/null || true)\"; ld_version=\"$(ld --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tc_cpp\\tld\\t%s\\t%s\\n' \"$ld_path\" \"$ld_version\"; fi",
        "if command -v pkg-config >/dev/null 2>&1; then pkgconfig_path=\"$(command -v pkg-config 2>/dev/null || true)\"; pkgconfig_version=\"$(pkg-config --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tc_cpp\\tpkg-config\\t%s\\t%s\\n' \"$pkgconfig_path\" \"$pkgconfig_version\"; fi",
        "if command -v cmake >/dev/null 2>&1; then cmake_path=\"$(command -v cmake 2>/dev/null || true)\"; cmake_version=\"$(cmake --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tc_cpp\\tcmake\\t%s\\t%s\\n' \"$cmake_path\" \"$cmake_version\"; fi",
        "if command -v make >/dev/null 2>&1; then make_path=\"$(command -v make 2>/dev/null || true)\"; make_version=\"$(make --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tc_cpp\\tmake\\t%s\\t%s\\n' \"$make_path\" \"$make_version\"; fi",
        ...(params.include_package_inventory
          ? [
            "if command -v pkg-config >/dev/null 2>&1; then pkg-config --list-all 2>/dev/null | awk '{printf \"__MODULE__\\tc_cpp\\t%s\\t%s\\t%s\\n\",$1,\"\",\"pkg-config\"}' | head -n \"$devtools_package_limit\"; fi",
          ]
          : []),
        ...(params.include_compiler_search_paths
          ? [
            "if command -v gcc >/dev/null 2>&1; then gcc_search_dirs=\"$(gcc -print-search-dirs 2>/dev/null | tr '\\n' ';' | cut -c1-2048)\"; printf '__PATH__\\tc_cpp\\tsearch_dirs\\t%s\\n' \"$gcc_search_dirs\"; fi",
          ]
          : []),
      ]
      : []),
    ...(params.include_nodejs
      ? [
        "printf '__ECO__\\t%s\\n' 'nodejs'",
        "if command -v node >/dev/null 2>&1; then node_path=\"$(command -v node 2>/dev/null || true)\"; node_version=\"$(node --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tnodejs\\tnode\\t%s\\t%s\\n' \"$node_path\" \"$node_version\"; fi",
        "if command -v npm >/dev/null 2>&1; then npm_path=\"$(command -v npm 2>/dev/null || true)\"; npm_version=\"$(npm --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tnodejs\\tnpm\\t%s\\t%s\\n' \"$npm_path\" \"$npm_version\"; fi",
        "if command -v pnpm >/dev/null 2>&1; then pnpm_path=\"$(command -v pnpm 2>/dev/null || true)\"; pnpm_version=\"$(pnpm --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tnodejs\\tpnpm\\t%s\\t%s\\n' \"$pnpm_path\" \"$pnpm_version\"; fi",
        "if command -v yarn >/dev/null 2>&1; then yarn_path=\"$(command -v yarn 2>/dev/null || true)\"; yarn_version=\"$(yarn --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tnodejs\\tyarn\\t%s\\t%s\\n' \"$yarn_path\" \"$yarn_version\"; fi",
        ...(params.include_package_inventory
          ? [
            "if command -v npm >/dev/null 2>&1; then node_global_root=\"$(npm root -g 2>/dev/null || true)\"; if [ -d \"$node_global_root\" ]; then find \"$node_global_root\" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | LC_ALL=C sort | head -n \"$devtools_module_limit\" | while IFS= read -r node_module_path; do [ -n \"$node_module_path\" ] || continue; node_module_name=\"$(basename \"$node_module_path\")\"; printf '__MODULE__\\tnodejs\\t%s\\t%s\\t%s\\n' \"$node_module_name\" \"\" \"npm_global\"; done; fi; fi",
          ]
          : []),
        ...(params.include_compiler_search_paths
          ? [
            "if command -v node >/dev/null 2>&1; then node_global_paths=\"$(node -p \"require('module').globalPaths.join(':')\" 2>/dev/null | tr -d '\\r' | cut -c1-2048)\"; printf '__PATH__\\tnodejs\\truntime_global_paths\\t%s\\n' \"$node_global_paths\"; fi",
          ]
          : []),
      ]
      : []),
    ...(params.include_python
      ? [
        "printf '__ECO__\\t%s\\n' 'python'",
        "if command -v python3 >/dev/null 2>&1; then python3_path=\"$(command -v python3 2>/dev/null || true)\"; python3_version=\"$(python3 --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tpython\\tpython3\\t%s\\t%s\\n' \"$python3_path\" \"$python3_version\"; fi",
        "if command -v python >/dev/null 2>&1; then python_path=\"$(command -v python 2>/dev/null || true)\"; python_version=\"$(python --version 2>&1 | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tpython\\tpython\\t%s\\t%s\\n' \"$python_path\" \"$python_version\"; fi",
        "if command -v pip3 >/dev/null 2>&1; then pip3_path=\"$(command -v pip3 2>/dev/null || true)\"; pip3_version=\"$(pip3 --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tpython\\tpip3\\t%s\\t%s\\n' \"$pip3_path\" \"$pip3_version\"; fi",
        "if command -v pip >/dev/null 2>&1; then pip_path=\"$(command -v pip 2>/dev/null || true)\"; pip_version=\"$(pip --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\tpython\\tpip\\t%s\\t%s\\n' \"$pip_path\" \"$pip_version\"; fi",
        ...(params.include_package_inventory
          ? [
            "if command -v python3 >/dev/null 2>&1; then python3 -m pip list --format=freeze 2>/dev/null | head -n \"$devtools_module_limit\" | awk -F'==' 'NF>=1 {printf \"__MODULE__\\tpython\\t%s\\t%s\\t%s\\n\",$1,$2,\"pip\"}'; elif command -v pip >/dev/null 2>&1; then pip list --format=freeze 2>/dev/null | head -n \"$devtools_module_limit\" | awk -F'==' 'NF>=1 {printf \"__MODULE__\\tpython\\t%s\\t%s\\t%s\\n\",$1,$2,\"pip\"}'; fi",
          ]
          : []),
        ...(params.include_compiler_search_paths
          ? [
            "if command -v python3 >/dev/null 2>&1; then python3_paths=\"$(python3 -c 'import sys; print(\":\".join(sys.path))' 2>/dev/null | tr -d '\\r' | cut -c1-2048)\"; printf '__PATH__\\tpython\\truntime_sys_path\\t%s\\n' \"$python3_paths\"; fi",
          ]
          : []),
      ]
      : []),
    ...(params.include_ruby
      ? [
        "printf '__ECO__\\t%s\\n' 'ruby'",
        "if command -v ruby >/dev/null 2>&1; then ruby_path=\"$(command -v ruby 2>/dev/null || true)\"; ruby_version=\"$(ruby --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\truby\\truby\\t%s\\t%s\\n' \"$ruby_path\" \"$ruby_version\"; fi",
        "if command -v gem >/dev/null 2>&1; then gem_path=\"$(command -v gem 2>/dev/null || true)\"; gem_version=\"$(gem --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\truby\\tgem\\t%s\\t%s\\n' \"$gem_path\" \"$gem_version\"; fi",
        "if command -v bundle >/dev/null 2>&1; then bundle_path=\"$(command -v bundle 2>/dev/null || true)\"; bundle_version=\"$(bundle --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\truby\\tbundler\\t%s\\t%s\\n' \"$bundle_path\" \"$bundle_version\"; fi",
        ...(params.include_package_inventory
          ? [
            "if command -v gem >/dev/null 2>&1; then gem list --no-versions 2>/dev/null | tr ' ' '\\n' | sed '/^$/d' | head -n \"$devtools_module_limit\" | awk '{printf \"__MODULE__\\truby\\t%s\\t%s\\t%s\\n\",$1,\"\",\"gem\"}'; fi",
          ]
          : []),
        ...(params.include_compiler_search_paths
          ? [
            "if command -v ruby >/dev/null 2>&1; then ruby_load_path=\"$(ruby -e 'print $LOAD_PATH.join(\":\")' 2>/dev/null | cut -c1-2048)\"; printf '__PATH__\\truby\\truntime_load_path\\t%s\\n' \"$ruby_load_path\"; fi",
          ]
          : []),
      ]
      : []),
    ...(params.include_go
      ? [
        "printf '__ECO__\\t%s\\n' 'go'",
        "if command -v go >/dev/null 2>&1; then go_path=\"$(command -v go 2>/dev/null || true)\"; go_version=\"$(go version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\tgo\\tgo\\t%s\\t%s\\n' \"$go_path\" \"$go_version\"; fi",
        "if command -v go >/dev/null 2>&1; then go_env_gopath=\"$(go env GOPATH 2>/dev/null | tr -d '\\r')\"; go_env_gomodcache=\"$(go env GOMODCACHE 2>/dev/null | tr -d '\\r')\"; [ -n \"$go_env_gopath\" ] && printf '__PATH__\\tgo\\truntime_gopath\\t%s\\n' \"$go_env_gopath\"; [ -n \"$go_env_gomodcache\" ] && printf '__PATH__\\tgo\\truntime_gomodcache\\t%s\\n' \"$go_env_gomodcache\"; fi",
        ...((params.include_package_inventory && params.include_transitive_metadata)
          ? [
            "if command -v go >/dev/null 2>&1; then go list -m all 2>/dev/null | head -n \"$devtools_module_limit\" | awk 'NF>=1 {printf \"__MODULE__\\tgo\\t%s\\t%s\\t%s\\n\",$1,$2,\"go_mod\"}'; fi",
          ]
          : []),
      ]
      : []),
    ...(params.include_rust
      ? [
        "printf '__ECO__\\t%s\\n' 'rust'",
        "if command -v rustc >/dev/null 2>&1; then rustc_path=\"$(command -v rustc 2>/dev/null || true)\"; rustc_version=\"$(rustc --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__TOOL__\\trust\\trustc\\t%s\\t%s\\n' \"$rustc_path\" \"$rustc_version\"; fi",
        "if command -v cargo >/dev/null 2>&1; then cargo_path=\"$(command -v cargo 2>/dev/null || true)\"; cargo_version=\"$(cargo --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\trust\\tcargo\\t%s\\t%s\\n' \"$cargo_path\" \"$cargo_version\"; fi",
        "if command -v rustup >/dev/null 2>&1; then rustup_path=\"$(command -v rustup 2>/dev/null || true)\"; rustup_version=\"$(rustup --version 2>/dev/null | head -n 1 | tr -d '\\r')\"; printf '__PKGMGR__\\trust\\trustup\\t%s\\t%s\\n' \"$rustup_path\" \"$rustup_version\"; fi",
        ...(params.include_package_inventory
          ? [
            "if command -v cargo >/dev/null 2>&1; then cargo install --list 2>/dev/null | awk '/:$/ {name=$1; sub(/:$/, \"\", name); printf \"__MODULE__\\trust\\t%s\\t%s\\t%s\\n\",name,\"\",\"cargo_install\"}' | head -n \"$devtools_module_limit\"; fi",
          ]
          : []),
        ...(params.include_compiler_search_paths
          ? [
            "if command -v rustc >/dev/null 2>&1; then rust_sysroot=\"$(rustc --print sysroot 2>/dev/null | tr -d '\\r')\"; [ -n \"$rust_sysroot\" ] && printf '__PATH__\\trust\\truntime_sysroot\\t%s\\n' \"$rust_sysroot\"; fi",
          ]
          : []),
      ]
      : []),
  ].join("\n");
}

function ParseDevelopmentToolingProbeOutput(params: {
  probe_output: string;
}): {
  primary_source: proxmox_lxc_devtool_source_kind_t | "unknown";
  fallback_used: boolean;
  distro_package_manager_used?: proxmox_lxc_devtool_distro_package_manager_t;
  distro_packages_scanned_count: number;
  distro_packages: proxmox_lxc_devtool_distro_package_t[];
  probed_ecosystems: Set<proxmox_lxc_devtool_ecosystem_kind_t>;
  toolchains: proxmox_lxc_devtool_toolchain_t[];
  system_package_providers: proxmox_lxc_devtool_package_manager_record_i[];
  scan_errors: proxmox_lxc_devtool_scan_error_t[];
  parse_warnings: proxmox_lxc_devtool_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_devtool_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_devtool_parse_warning_t[] = [];
  const probed_ecosystems = new Set<proxmox_lxc_devtool_ecosystem_kind_t>();
  const toolchain_map = new Map<proxmox_lxc_devtool_ecosystem_kind_t, proxmox_lxc_devtool_toolchain_t>();
  for (const ecosystem_kind of GetDevelopmentToolingEcosystemOrder()) {
    toolchain_map.set(ecosystem_kind, BuildEmptyDevelopmentToolchainRecord(ecosystem_kind));
  }
  const system_package_provider_map = new Map<string, proxmox_lxc_devtool_package_manager_record_i>();
  const distro_package_map = new Map<string, proxmox_lxc_devtool_distro_package_t>();
  let distro_packages_scanned_count = 0;
  let distro_package_manager_used: proxmox_lxc_devtool_distro_package_manager_t | undefined;
  let fallback_used = false;

  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      const reason = NormalizeOptionalText(fields[2]) ?? "devtool_partial_data:probe_error";
      scan_errors.push({
        source_kind: ResolveDevelopmentToolingSourceKind(fields[1]) ?? "probe",
        reason,
      });
      if (reason.includes("unavailable")) {
        fallback_used = true;
      }
      continue;
    }
    if (normalized_line.startsWith("__ECO__\t")) {
      const ecosystem_kind = ResolveDevelopmentToolingEcosystemKind(raw_line.split("\t")[1]);
      if (ecosystem_kind) {
        probed_ecosystems.add(ecosystem_kind);
      }
      continue;
    }
    if (normalized_line.startsWith("__DISTROPKG_MANAGER__\t")) {
      const manager_kind = ResolveDevelopmentToolingDistroPackageManager(raw_line.split("\t")[1]);
      if (manager_kind && manager_kind !== "unknown") {
        distro_package_manager_used = manager_kind;
      } else {
        parse_warnings.push({
          source_kind: "distro_package_inventory",
          reason: "devtool_distro_inventory_parse_failed:invalid_manager",
          raw_line,
        });
      }
      continue;
    }
    if (normalized_line.startsWith("__DISTROPKG__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 4) {
        parse_warnings.push({
          source_kind: "distro_package_inventory",
          reason: "devtool_distro_inventory_parse_failed:invalid_record",
          raw_line,
        });
        continue;
      }
      const source_manager = ResolveDevelopmentToolingDistroPackageManager(fields[1]);
      const package_name = NormalizeOptionalText(fields[2]);
      if (!source_manager || source_manager === "unknown" || !package_name) {
        parse_warnings.push({
          source_kind: "distro_package_inventory",
          reason: "devtool_distro_inventory_parse_failed:invalid_fields",
          raw_line,
        });
        continue;
      }
      distro_packages_scanned_count += 1;
      const package_version = NormalizeVersionValue(fields.slice(3).join("\t"));
      const mapping_result = InferDevelopmentToolingDistroPackageEcosystemMatches({
        package_name,
      });
      const dedupe_key = `${source_manager}:${package_name.toLowerCase()}`;
      const existing_package = distro_package_map.get(dedupe_key);
      if (existing_package) {
        if (!existing_package.package_version && package_version) {
          existing_package.package_version = package_version;
        }
        continue;
      }
      distro_package_map.set(dedupe_key, {
        package_name,
        package_version,
        source_manager,
        ecosystem_matches: mapping_result.ecosystem_matches,
        confidence: mapping_result.confidence,
      });
      continue;
    }
    if (normalized_line.startsWith("__TOOL__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 5) {
        parse_warnings.push({
          source_kind: "tool",
          reason: "devtool_parse_failed:invalid_tool_record",
          raw_line,
        });
        continue;
      }
      const ecosystem_kind = ResolveDevelopmentToolingEcosystemKind(fields[1]);
      const executable_name = NormalizeOptionalText(fields[2]);
      if (!ecosystem_kind || !executable_name) {
        parse_warnings.push({
          source_kind: "tool",
          reason: "devtool_parse_failed:invalid_tool_fields",
          raw_line,
        });
        continue;
      }
      probed_ecosystems.add(ecosystem_kind);
      const toolchain_record = toolchain_map.get(ecosystem_kind) ?? BuildEmptyDevelopmentToolchainRecord(ecosystem_kind);
      const executable_path = NormalizeOptionalText(fields[3]) ?? undefined;
      const executable_version = NormalizeVersionValue(fields.slice(4).join("\t"));
      UpsertDevelopmentExecutable({
        toolchain_record,
        executable_name,
        executable_path,
        executable_version,
      });
      if (executable_version) {
        toolchain_record.versions[executable_name] = executable_version;
      }
      toolchain_record.is_present = toolchain_record.is_present || executable_path !== undefined || executable_version !== undefined;
      toolchain_record.source_kind = "tool";
      toolchain_map.set(ecosystem_kind, toolchain_record);
      continue;
    }
    if (normalized_line.startsWith("__PKGMGR__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 5) {
        parse_warnings.push({
          source_kind: "package_inventory",
          reason: "devtool_parse_failed:invalid_package_manager_record",
          raw_line,
        });
        continue;
      }
      const ecosystem_raw = NormalizeOptionalText(fields[1]) ?? "";
      const manager_name = NormalizeOptionalText(fields[2]);
      const manager_path = NormalizeOptionalText(fields[3]) ?? undefined;
      const manager_version = NormalizeVersionValue(fields.slice(4).join("\t"));
      if (!manager_name) {
        continue;
      }
      if (ecosystem_raw === "system") {
        const dedupe_key = manager_name.toLowerCase();
        system_package_provider_map.set(dedupe_key, {
          manager_name,
          is_present: true,
          path: manager_path,
          version: manager_version,
        });
        continue;
      }
      const ecosystem_kind = ResolveDevelopmentToolingEcosystemKind(ecosystem_raw);
      if (!ecosystem_kind) {
        parse_warnings.push({
          source_kind: "package_inventory",
          reason: "devtool_parse_failed:invalid_package_manager_ecosystem",
          raw_line,
        });
        continue;
      }
      probed_ecosystems.add(ecosystem_kind);
      const toolchain_record = toolchain_map.get(ecosystem_kind) ?? BuildEmptyDevelopmentToolchainRecord(ecosystem_kind);
      UpsertDevelopmentPackageManager({
        toolchain_record,
        manager_name,
        manager_path,
        manager_version,
      });
      if (manager_version) {
        toolchain_record.versions[manager_name] = manager_version;
      }
      toolchain_record.is_present = true;
      if (toolchain_record.source_kind === "probe") {
        toolchain_record.source_kind = "package_inventory";
      }
      toolchain_map.set(ecosystem_kind, toolchain_record);
      continue;
    }
    if (normalized_line.startsWith("__MODULE__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 5) {
        parse_warnings.push({
          source_kind: "package_inventory",
          reason: "devtool_parse_failed:invalid_module_record",
          raw_line,
        });
        continue;
      }
      const ecosystem_kind = ResolveDevelopmentToolingEcosystemKind(fields[1]);
      const module_name = NormalizeOptionalText(fields[2]);
      if (!ecosystem_kind || !module_name) {
        parse_warnings.push({
          source_kind: "package_inventory",
          reason: "devtool_parse_failed:invalid_module_fields",
          raw_line,
        });
        continue;
      }
      probed_ecosystems.add(ecosystem_kind);
      const toolchain_record = toolchain_map.get(ecosystem_kind) ?? BuildEmptyDevelopmentToolchainRecord(ecosystem_kind);
      UpsertDevelopmentModule({
        toolchain_record,
        module_name,
        module_version: NormalizeVersionValue(fields[3]),
        module_source: NormalizeOptionalText(fields[4]) ?? undefined,
      });
      toolchain_record.is_present = true;
      toolchain_record.source_kind = "package_inventory";
      toolchain_map.set(ecosystem_kind, toolchain_record);
      continue;
    }
    if (normalized_line.startsWith("__PATH__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 4) {
        parse_warnings.push({
          source_kind: "tool",
          reason: "devtool_parse_failed:invalid_path_record",
          raw_line,
        });
        continue;
      }
      const ecosystem_kind = ResolveDevelopmentToolingEcosystemKind(fields[1]);
      const path_key = NormalizeOptionalText(fields[2]) ?? undefined;
      const path_value = NormalizeOptionalText(fields.slice(3).join("\t")) ?? undefined;
      if (!ecosystem_kind || !path_key || !path_value) {
        continue;
      }
      probed_ecosystems.add(ecosystem_kind);
      const toolchain_record = toolchain_map.get(ecosystem_kind) ?? BuildEmptyDevelopmentToolchainRecord(ecosystem_kind);
      if (path_key.startsWith("runtime_")) {
        toolchain_record.runtime_paths = {
          ...(toolchain_record.runtime_paths ?? {}),
          [path_key.replace(/^runtime_/, "")]: path_value,
        };
      } else {
        toolchain_record.search_paths = {
          ...(toolchain_record.search_paths ?? {}),
          [path_key]: path_value,
        };
      }
      toolchain_record.is_present = true;
      if (toolchain_record.source_kind === "probe") {
        toolchain_record.source_kind = "tool";
      }
      toolchain_map.set(ecosystem_kind, toolchain_record);
      continue;
    }
  }

  const toolchains = Array.from(toolchain_map.values())
    .map((toolchain_record) => ({
      ...toolchain_record,
      executables: [...toolchain_record.executables]
        .sort((left_executable, right_executable) => left_executable.name.localeCompare(right_executable.name)),
      package_managers: [...toolchain_record.package_managers]
        .sort((left_manager, right_manager) => left_manager.manager_name.localeCompare(right_manager.manager_name)),
      libraries_or_modules: [...toolchain_record.libraries_or_modules]
        .sort((left_module, right_module) => {
          const by_name = left_module.name.localeCompare(right_module.name);
          if (by_name !== 0) {
            return by_name;
          }
          const left_version = left_module.version ?? "";
          const right_version = right_module.version ?? "";
          return left_version.localeCompare(right_version);
        }),
    }))
    .sort((left_toolchain, right_toolchain) => {
      return DevelopmentToolingEcosystemSortValue(left_toolchain.ecosystem_kind)
        - DevelopmentToolingEcosystemSortValue(right_toolchain.ecosystem_kind);
    });
  const system_package_providers = Array.from(system_package_provider_map.values())
    .sort((left_provider, right_provider) => left_provider.manager_name.localeCompare(right_provider.manager_name));
  const distro_packages = Array.from(distro_package_map.values())
    .sort((left_package, right_package) => {
      const by_name = left_package.package_name.localeCompare(right_package.package_name);
      if (by_name !== 0) {
        return by_name;
      }
      return left_package.source_manager.localeCompare(right_package.source_manager);
    });

  return {
    primary_source: "probe",
    fallback_used,
    distro_package_manager_used,
    distro_packages_scanned_count,
    distro_packages,
    probed_ecosystems,
    toolchains,
    system_package_providers,
    scan_errors,
    parse_warnings,
  };
}

function BuildEmptyDevelopmentToolchainRecord(
  ecosystem_kind: proxmox_lxc_devtool_ecosystem_kind_t,
): proxmox_lxc_devtool_toolchain_t {
  return {
    ecosystem_kind,
    is_present: false,
    executables: [],
    versions: {},
    package_managers: [],
    libraries_or_modules: [],
    source_kind: "probe",
  };
}

function GetDevelopmentToolingEcosystemOrder(): proxmox_lxc_devtool_ecosystem_kind_t[] {
  return ["c_cpp", "nodejs", "python", "ruby", "go", "rust", "other"];
}

function DevelopmentToolingEcosystemSortValue(
  ecosystem_kind: proxmox_lxc_devtool_ecosystem_kind_t,
): number {
  const ecosystem_order = GetDevelopmentToolingEcosystemOrder();
  const ecosystem_index = ecosystem_order.indexOf(ecosystem_kind);
  return ecosystem_index === -1 ? ecosystem_order.length : ecosystem_index;
}

function ResolveDevelopmentToolingEcosystemKind(
  raw_value: string | undefined,
): proxmox_lxc_devtool_ecosystem_kind_t | undefined {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (
    normalized_value === "c_cpp"
    || normalized_value === "nodejs"
    || normalized_value === "python"
    || normalized_value === "ruby"
    || normalized_value === "go"
    || normalized_value === "rust"
    || normalized_value === "other"
  ) {
    return normalized_value;
  }
  return undefined;
}

function ResolveDevelopmentToolingSourceKind(
  raw_value: string | undefined,
): proxmox_lxc_devtool_source_kind_t | undefined {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (
    normalized_value === "probe"
    || normalized_value === "tool"
    || normalized_value === "package_inventory"
    || normalized_value === "system_package_provider"
    || normalized_value === "distro_package_inventory"
  ) {
    return normalized_value;
  }
  return undefined;
}

function ResolveDevelopmentToolingDistroPackageManager(
  raw_value: string | undefined,
): proxmox_lxc_devtool_distro_package_manager_t | undefined {
  const normalized_value = NormalizeOptionalText(raw_value)?.toLowerCase();
  if (
    normalized_value === "dpkg"
    || normalized_value === "apk"
    || normalized_value === "rpm"
    || normalized_value === "pacman"
    || normalized_value === "unknown"
  ) {
    return normalized_value;
  }
  return undefined;
}

function InferDevelopmentToolingDistroPackageEcosystemMatches(params: {
  package_name: string;
}): {
  ecosystem_matches: proxmox_lxc_devtool_ecosystem_kind_t[];
  confidence: proxmox_lxc_devtool_distro_package_confidence_t;
} {
  const normalized_name = params.package_name.toLowerCase();
  const ecosystem_matches = new Set<proxmox_lxc_devtool_ecosystem_kind_t>();
  let confidence: proxmox_lxc_devtool_distro_package_confidence_t = "low";

  if (
    normalized_name.startsWith("libstdc++")
    || normalized_name.startsWith("libc6")
    || normalized_name.startsWith("gcc")
    || normalized_name.startsWith("g++")
    || normalized_name.startsWith("clang")
    || normalized_name.startsWith("cmake")
    || normalized_name.startsWith("make")
    || normalized_name.startsWith("pkg-config")
    || normalized_name.endsWith("-dev")
    || normalized_name.endsWith("-devel")
  ) {
    ecosystem_matches.add("c_cpp");
    confidence = "high";
  }
  if (
    normalized_name === "nodejs"
    || normalized_name === "npm"
    || normalized_name.startsWith("node-")
    || normalized_name.startsWith("nodejs")
    || normalized_name.startsWith("pnpm")
    || normalized_name.startsWith("yarn")
  ) {
    ecosystem_matches.add("nodejs");
    confidence = confidence === "high" ? "high" : "medium";
  }
  if (
    normalized_name === "python"
    || normalized_name.startsWith("python")
    || normalized_name.startsWith("pip")
    || normalized_name.startsWith("py3-")
  ) {
    ecosystem_matches.add("python");
    confidence = confidence === "high" ? "high" : "medium";
  }
  if (
    normalized_name === "ruby"
    || normalized_name.startsWith("ruby")
    || normalized_name.startsWith("rubygem-")
    || normalized_name.startsWith("bundler")
  ) {
    ecosystem_matches.add("ruby");
    confidence = confidence === "high" ? "high" : "medium";
  }
  if (
    normalized_name === "go"
    || normalized_name.startsWith("go-")
    || normalized_name.startsWith("golang")
  ) {
    ecosystem_matches.add("go");
    confidence = confidence === "high" ? "high" : "medium";
  }
  if (
    normalized_name === "rust"
    || normalized_name.startsWith("rust")
    || normalized_name.startsWith("cargo")
  ) {
    ecosystem_matches.add("rust");
    confidence = confidence === "high" ? "high" : "medium";
  }

  return {
    ecosystem_matches: ecosystem_matches.size > 0 ? [...ecosystem_matches] : ["other"],
    confidence,
  };
}

function NormalizeVersionValue(raw_value: string | undefined): string | undefined {
  const normalized_value = NormalizeOptionalText(raw_value);
  if (!normalized_value) {
    return undefined;
  }
  const version_match = normalized_value.match(/([0-9]+(?:\.[0-9]+){0,3}(?:[-+][A-Za-z0-9._-]+)?)/);
  if (version_match) {
    return version_match[1];
  }
  return normalized_value;
}

function UpsertDevelopmentExecutable(params: {
  toolchain_record: proxmox_lxc_devtool_toolchain_t;
  executable_name: string;
  executable_path?: string;
  executable_version?: string;
}): void {
  const normalized_name = params.executable_name.trim();
  if (!normalized_name) {
    return;
  }
  const existing_executable = params.toolchain_record.executables.find(
    (executable_record) => executable_record.name.toLowerCase() === normalized_name.toLowerCase(),
  );
  if (existing_executable) {
    existing_executable.path = existing_executable.path ?? params.executable_path;
    existing_executable.version = existing_executable.version ?? params.executable_version;
    return;
  }
  params.toolchain_record.executables.push({
    name: normalized_name,
    path: params.executable_path,
    version: params.executable_version,
  });
}

function UpsertDevelopmentPackageManager(params: {
  toolchain_record: proxmox_lxc_devtool_toolchain_t;
  manager_name: string;
  manager_path?: string;
  manager_version?: string;
}): void {
  const normalized_name = params.manager_name.trim();
  if (!normalized_name) {
    return;
  }
  const existing_manager = params.toolchain_record.package_managers.find(
    (manager_record) => manager_record.manager_name.toLowerCase() === normalized_name.toLowerCase(),
  );
  if (existing_manager) {
    existing_manager.path = existing_manager.path ?? params.manager_path;
    existing_manager.version = existing_manager.version ?? params.manager_version;
    existing_manager.is_present = true;
    return;
  }
  params.toolchain_record.package_managers.push({
    manager_name: normalized_name,
    is_present: true,
    path: params.manager_path,
    version: params.manager_version,
  });
}

function UpsertDevelopmentModule(params: {
  toolchain_record: proxmox_lxc_devtool_toolchain_t;
  module_name: string;
  module_version?: string;
  module_source?: string;
}): void {
  const normalized_name = params.module_name.trim();
  if (!normalized_name) {
    return;
  }
  const existing_module = params.toolchain_record.libraries_or_modules.find((module_record) => {
    const same_name = module_record.name.toLowerCase() === normalized_name.toLowerCase();
    const same_source = (module_record.source ?? "").toLowerCase() === (params.module_source ?? "").toLowerCase();
    return same_name && same_source;
  });
  if (existing_module) {
    existing_module.version = existing_module.version ?? params.module_version;
    return;
  }
  params.toolchain_record.libraries_or_modules.push({
    name: normalized_name,
    version: params.module_version,
    source: params.module_source,
  });
}

function BuildDevelopmentToolingSummary(params: {
  toolchains: proxmox_lxc_devtool_toolchain_t[];
  include_package_inventory: boolean;
  include_distro_package_enrichment: boolean;
  system_package_providers: proxmox_lxc_devtool_package_manager_record_i[];
  parse_warning_count: number;
  scan_error_count: number;
}): proxmox_lxc_devtool_summary_t {
  const ecosystems_present = params.toolchains
    .filter((toolchain_record) => toolchain_record.is_present)
    .map((toolchain_record) => toolchain_record.ecosystem_kind)
    .sort((left_ecosystem, right_ecosystem) => DevelopmentToolingEcosystemSortValue(left_ecosystem) - DevelopmentToolingEcosystemSortValue(right_ecosystem));
  const ecosystems_missing = params.toolchains
    .filter((toolchain_record) => !toolchain_record.is_present)
    .map((toolchain_record) => toolchain_record.ecosystem_kind)
    .sort((left_ecosystem, right_ecosystem) => DevelopmentToolingEcosystemSortValue(left_ecosystem) - DevelopmentToolingEcosystemSortValue(right_ecosystem));
  const ecosystem_module_counts: Record<string, number> = {};
  for (const toolchain_record of params.toolchains) {
    ecosystem_module_counts[toolchain_record.ecosystem_kind] = toolchain_record.libraries_or_modules.length
      + (toolchain_record.distro_packages?.length ?? 0);
  }
  const present_with_inventory_count = params.toolchains.filter((toolchain_record) => {
    if (!toolchain_record.is_present) {
      return false;
    }
    if (toolchain_record.libraries_or_modules.length > 0) {
      return true;
    }
    if (params.include_distro_package_enrichment && (toolchain_record.distro_packages?.length ?? 0) > 0) {
      return true;
    }
    return false;
  }).length;
  const include_any_inventory = params.include_package_inventory || params.include_distro_package_enrichment;
  const package_inventory_completeness = !include_any_inventory
    ? "none"
    : ecosystems_present.length === 0 || present_with_inventory_count === 0
      ? "none"
      : present_with_inventory_count === ecosystems_present.length
        ? "full"
        : "partial";
  const system_provider_count = params.system_package_providers.filter((provider_record) => provider_record.is_present).length;
  const raw_score = (ecosystems_present.length * 12) + (present_with_inventory_count * 8) + (system_provider_count * 2)
    - (params.parse_warning_count + params.scan_error_count);
  const development_tooling_score = Math.min(100, Math.max(0, raw_score));
  return {
    development_tooling_score,
    ecosystems_present,
    ecosystems_missing,
    ecosystem_module_counts,
    package_inventory_completeness,
    unknown_or_partial_count: params.parse_warning_count + params.scan_error_count + ecosystems_missing.length,
  };
}

function ResolveSystemReportSectionSelection(
  sections: proxmox_lxc_system_report_section_selection_i | undefined,
): Record<proxmox_lxc_system_report_section_id_t, boolean> {
  return {
    system_info: sections?.include_system_info !== false,
    cron_jobs: sections?.include_cron_jobs !== false,
    processes: sections?.include_processes !== false,
    tcp_ports: sections?.include_tcp_ports !== false,
    udp_ports: sections?.include_udp_ports !== false,
    services: sections?.include_services !== false,
    hardware: sections?.include_hardware !== false,
    disk: sections?.include_disk !== false,
    memory: sections?.include_memory !== false,
    cpu: sections?.include_cpu !== false,
    identity: sections?.include_identity !== false,
    firewall: sections?.include_firewall !== false,
    devtools: sections?.include_devtools !== false,
  };
}

function ResolveSystemReportCollectionOptions(
  collection_options: proxmox_lxc_system_report_collection_options_i | undefined,
): {
  section_timeout_ms: number;
  process_limit: number;
  listener_limit: number;
  service_limit: number;
  hardware_device_limit: number;
  disk_device_limit: number;
  disk_filesystem_limit: number;
  memory_process_limit: number;
  cpu_core_limit: number;
  identity_user_limit: number;
  identity_group_limit: number;
  firewall_rule_limit: number;
  firewall_finding_limit: number;
  devtools_module_limit_per_runtime: number;
  devtools_package_limit_per_runtime: number;
  devtools_include_distro_package_enrichment: boolean;
  devtools_distro_package_limit_total: number;
  devtools_distro_package_limit_per_ecosystem: number;
} {
  return {
    section_timeout_ms: ValidatePositiveInteger({
      raw_value: collection_options?.section_timeout_ms ?? 30000,
      field_name: "collection_options.section_timeout_ms",
      minimum: 1000,
      maximum: 600000,
    }),
    process_limit: ValidatePositiveInteger({
      raw_value: collection_options?.process_limit ?? 200,
      field_name: "collection_options.process_limit",
      minimum: 1,
      maximum: 10000,
    }),
    listener_limit: ValidatePositiveInteger({
      raw_value: collection_options?.listener_limit ?? 512,
      field_name: "collection_options.listener_limit",
      minimum: 1,
      maximum: 10000,
    }),
    service_limit: ValidatePositiveInteger({
      raw_value: collection_options?.service_limit ?? 512,
      field_name: "collection_options.service_limit",
      minimum: 1,
      maximum: 10000,
    }),
    hardware_device_limit: ValidatePositiveInteger({
      raw_value: collection_options?.hardware_device_limit ?? 512,
      field_name: "collection_options.hardware_device_limit",
      minimum: 1,
      maximum: 10000,
    }),
    disk_device_limit: ValidatePositiveInteger({
      raw_value: collection_options?.disk_device_limit ?? 512,
      field_name: "collection_options.disk_device_limit",
      minimum: 1,
      maximum: 10000,
    }),
    disk_filesystem_limit: ValidatePositiveInteger({
      raw_value: collection_options?.disk_filesystem_limit ?? 1024,
      field_name: "collection_options.disk_filesystem_limit",
      minimum: 1,
      maximum: 20000,
    }),
    memory_process_limit: ValidatePositiveInteger({
      raw_value: collection_options?.memory_process_limit ?? 200,
      field_name: "collection_options.memory_process_limit",
      minimum: 1,
      maximum: 10000,
    }),
    cpu_core_limit: ValidatePositiveInteger({
      raw_value: collection_options?.cpu_core_limit ?? 512,
      field_name: "collection_options.cpu_core_limit",
      minimum: 1,
      maximum: 10000,
    }),
    identity_user_limit: ValidatePositiveInteger({
      raw_value: collection_options?.identity_user_limit ?? 1024,
      field_name: "collection_options.identity_user_limit",
      minimum: 1,
      maximum: 20000,
    }),
    identity_group_limit: ValidatePositiveInteger({
      raw_value: collection_options?.identity_group_limit ?? 1024,
      field_name: "collection_options.identity_group_limit",
      minimum: 1,
      maximum: 20000,
    }),
    firewall_rule_limit: ValidatePositiveInteger({
      raw_value: collection_options?.firewall_rule_limit ?? 2048,
      field_name: "collection_options.firewall_rule_limit",
      minimum: 1,
      maximum: 50000,
    }),
    firewall_finding_limit: ValidatePositiveInteger({
      raw_value: collection_options?.firewall_finding_limit ?? 128,
      field_name: "collection_options.firewall_finding_limit",
      minimum: 1,
      maximum: 5000,
    }),
    devtools_module_limit_per_runtime: ValidatePositiveInteger({
      raw_value: collection_options?.devtools_module_limit_per_runtime ?? 200,
      field_name: "collection_options.devtools_module_limit_per_runtime",
      minimum: 1,
      maximum: 10000,
    }),
    devtools_package_limit_per_runtime: ValidatePositiveInteger({
      raw_value: collection_options?.devtools_package_limit_per_runtime ?? 500,
      field_name: "collection_options.devtools_package_limit_per_runtime",
      minimum: 1,
      maximum: 20000,
    }),
    devtools_include_distro_package_enrichment: collection_options?.devtools_include_distro_package_enrichment === true,
    devtools_distro_package_limit_total: ValidatePositiveInteger({
      raw_value: collection_options?.devtools_distro_package_limit_total ?? 2000,
      field_name: "collection_options.devtools_distro_package_limit_total",
      minimum: 1,
      maximum: 100000,
    }),
    devtools_distro_package_limit_per_ecosystem: ValidatePositiveInteger({
      raw_value: collection_options?.devtools_distro_package_limit_per_ecosystem ?? 500,
      field_name: "collection_options.devtools_distro_package_limit_per_ecosystem",
      minimum: 1,
      maximum: 20000,
    }),
  };
}

function ResolveSystemReportRenderOptions(
  render_options: proxmox_lxc_system_report_render_options_i | undefined,
): {
  theme: "dark";
  report_title: string;
  include_raw_json: boolean;
  max_table_rows: number;
} {
  return {
    theme: "dark",
    report_title: NormalizeOptionalText(render_options?.report_title) ?? "LXC Telemetry Report",
    include_raw_json: render_options?.include_raw_json === true,
    max_table_rows: ValidatePositiveInteger({
      raw_value: render_options?.max_table_rows ?? 1000,
      field_name: "render_options.max_table_rows",
      minimum: 1,
      maximum: 20000,
    }),
  };
}

function ResolveSystemReportResultStats(payload: unknown): {
  warning_count: number;
  error_count: number;
  truncated: boolean;
} {
  if (!payload || typeof payload !== "object") {
    return {
      warning_count: 0,
      error_count: 0,
      truncated: false,
    };
  }
  const payload_record = payload as Record<string, unknown>;
  return {
    warning_count: Array.isArray(payload_record.parse_warnings) ? payload_record.parse_warnings.length : 0,
    error_count: Array.isArray(payload_record.scan_errors) ? payload_record.scan_errors.length : 0,
    truncated: payload_record.truncated === true,
  };
}

function ResolveSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

function BuildSystemReportStatusCounts(params: {
  sections: proxmox_lxc_system_report_section_metadata_t[];
}): Record<proxmox_lxc_system_report_section_status_t, number> {
  const counts: Record<proxmox_lxc_system_report_section_status_t, number> = {
    success: 0,
    partial: 0,
    failed: 0,
    disabled: 0,
  };
  for (const section_record of params.sections) {
    counts[section_record.status] = (counts[section_record.status] ?? 0) + 1;
  }
  return counts;
}

function ResolveSystemReportOutputPath(params: {
  output_path?: string;
  output_dir?: string;
  file_name_prefix?: string;
  node_id: string;
  container_id: string;
  generated_at_iso: string;
}): string {
  if (NormalizeOptionalText(params.output_path)) {
    return path.resolve(params.output_path as string);
  }
  const safe_prefix = (NormalizeOptionalText(params.file_name_prefix) ?? "proxmox-lxc-report")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe_node_id = params.node_id.replace(/[^A-Za-z0-9._-]+/g, "-");
  const safe_container_id = params.container_id.replace(/[^A-Za-z0-9._-]+/g, "-");
  const safe_timestamp = params.generated_at_iso
    .replace(/[:]/g, "")
    .replace(/[.]/g, "-")
    .replace(/[T]/g, "-")
    .replace(/[Z]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  const output_dir = NormalizeOptionalText(params.output_dir) ?? "/tmp";
  const file_name = `${safe_prefix}-${safe_node_id}-${safe_container_id}-${safe_timestamp}.html`;
  return path.resolve(output_dir, file_name);
}

function BuildSystemReportHtmlDocument(params: {
  metadata: proxmox_lxc_system_report_metadata_t;
  section_payloads: Partial<Record<proxmox_lxc_system_report_section_id_t, unknown>>;
  render_options: {
    theme: "dark";
    report_title: string;
    include_raw_json: boolean;
    max_table_rows: number;
  };
}): string {
  const enabled_sections = params.metadata.sections.filter((section_record) => section_record.status !== "disabled");
  const navigation_html = enabled_sections.map((section_record) => {
    const section_id = section_record.section_id;
    const status = section_record.status;
    return [
      `<a href="#section-${EscapeHtml(section_id)}" class="nav-link nav-${EscapeHtml(status)}" data-section="section-${EscapeHtml(section_id)}">`,
      `<span class="nav-title">${EscapeHtml(GetSystemReportSectionTitle(section_id))}</span>`,
      `<span class="nav-meta">${EscapeHtml(status.toUpperCase())}</span>`,
      "</a>",
    ].join("");
  }).join("");
  const sections_html = enabled_sections.map((section_record) => {
    const payload = params.section_payloads[section_record.section_id];
    const section_rows = ExtractSystemReportSectionRows({
      section_id: section_record.section_id,
      payload,
    });
    const summary_cards = BuildSystemReportSummaryCards({
      section_record,
      payload,
      row_count: section_rows.length,
    });
    const table_html = BuildSystemReportSectionTable({
      section_id: section_record.section_id,
      rows: section_rows,
      max_table_rows: params.render_options.max_table_rows,
    });
    const raw_json_html = params.render_options.include_raw_json
      ? `<details><summary>Raw JSON</summary><pre>${EscapeHtml(SafeJsonStringify(payload))}</pre></details>`
      : "";
    const failure_message = section_record.message
      ? `<p class="section-error">${EscapeHtml(section_record.message)}</p>`
      : "";
    return [
      `<section id="section-${EscapeHtml(section_record.section_id)}" class="report-section">`,
      `<h2>${EscapeHtml(GetSystemReportSectionTitle(section_record.section_id))}</h2>`,
      failure_message,
      `<div class="section-cards">${summary_cards}</div>`,
      table_html,
      raw_json_html,
      "</section>",
    ].join("");
  }).join("\n");

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `<title>${EscapeHtml(params.render_options.report_title)}</title>`,
    "<style>",
    "body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;background:#12171f;color:#d8e0ea;line-height:1.45;}",
    ".layout{display:grid;grid-template-columns:260px 1fr;min-height:100vh;}",
    ".sidebar{position:sticky;top:0;height:100vh;overflow:auto;background:#171f2a;border-right:1px solid #243143;padding:20px;}",
    ".brand{font-size:18px;font-weight:700;margin-bottom:14px;}",
    ".meta{font-size:12px;color:#9fb2c8;margin-bottom:16px;}",
    ".nav-link{display:flex;justify-content:space-between;align-items:center;color:#c5d3e4;text-decoration:none;padding:8px 10px;border-radius:8px;margin-bottom:6px;background:#1e2734;}",
    ".nav-link:hover{background:#263247;}",
    ".nav-link.active{outline:2px solid #4a90e2;background:#223248;}",
    ".nav-title{font-size:13px;font-weight:600;}",
    ".nav-meta{font-size:10px;color:#9db4cd;letter-spacing:0.4px;}",
    ".nav-success{border-left:3px solid #2fb170;}",
    ".nav-partial{border-left:3px solid #d2a23c;}",
    ".nav-failed{border-left:3px solid #d26060;}",
    ".content{padding:24px;}",
    ".top-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px;}",
    ".card{background:#1a2431;border:1px solid #2a374b;border-radius:12px;padding:12px;}",
    ".card .k{font-size:12px;color:#9eb1c8;}",
    ".card .v{font-size:18px;font-weight:700;}",
    ".report-section{margin-bottom:28px;padding:14px;background:#171f2a;border:1px solid #27374f;border-radius:12px;}",
    ".section-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:10px;}",
    ".table-wrap{overflow:auto;border:1px solid #2a374b;border-radius:10px;}",
    "table{width:100%;border-collapse:collapse;font-size:13px;}",
    "th,td{padding:8px 10px;border-bottom:1px solid #283547;vertical-align:top;}",
    "th{position:sticky;top:0;background:#203047;color:#d8e0ea;text-align:left;}",
    "tr:nth-child(even){background:#1a2533;}",
    ".muted{color:#9eb1c8;font-size:12px;}",
    ".section-error{color:#ffb1b1;background:#2f1f23;border:1px solid #5d3138;padding:8px 10px;border-radius:8px;}",
    "details pre{white-space:pre-wrap;word-break:break-word;background:#0f141b;padding:10px;border-radius:8px;}",
    ".table-filter{margin:8px 0 10px 0;width:100%;max-width:320px;background:#131b26;border:1px solid #2a374b;color:#d8e0ea;border-radius:8px;padding:8px;}",
    ".table-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;}",
    ".table-toggle{background:#203047;border:1px solid #355172;color:#d8e0ea;border-radius:8px;padding:6px 10px;cursor:pointer;}",
    ".table-toggle:hover{background:#27405f;}",
    ".table-collapsed{display:none;}",
    ".table-expanded{display:block;}",
    "@media (max-width:980px){.layout{grid-template-columns:1fr;}.sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid #243143;}}",
    "</style>",
    "</head>",
    "<body>",
    "<div class=\"layout\">",
    "<aside class=\"sidebar\">",
    `<div class="brand">${EscapeHtml(params.render_options.report_title)}</div>`,
    `<div class="meta">Generated: ${EscapeHtml(params.metadata.generated_at_iso)}<br/>Node: ${EscapeHtml(params.metadata.node_id)}<br/>Container: ${EscapeHtml(params.metadata.container_id)}<br/>Duration: ${params.metadata.total_duration_ms}ms</div>`,
    navigation_html,
    "</aside>",
    "<main class=\"content\">",
    `<div class="top-grid">${BuildSystemReportTopCards(params.metadata)}</div>`,
    sections_html,
    "</main>",
    "</div>",
    "<script>",
    "document.querySelectorAll('.table-filter').forEach((input)=>{input.addEventListener('input',()=>{const tableId=input.getAttribute('data-target');const query=(input.value||'').toLowerCase();const table=document.getElementById(tableId);if(!table){return;}table.querySelectorAll('tbody tr').forEach((row)=>{const text=(row.textContent||'').toLowerCase();row.style.display=query===''||text.includes(query)?'':'none';});});});",
    "document.querySelectorAll('.table-toggle').forEach((button)=>{button.addEventListener('click',()=>{const targetId=button.getAttribute('data-target');if(!targetId){return;}const container=document.getElementById(targetId);if(!container){return;}const isCollapsed=container.classList.contains('table-collapsed');container.classList.toggle('table-collapsed',!isCollapsed);container.classList.toggle('table-expanded',isCollapsed);button.textContent=isCollapsed?'Collapse table':'Expand table';});});",
    "const navLinks=[...document.querySelectorAll('.nav-link[data-section]')];const sectionMap=new Map(navLinks.map((link)=>[link.getAttribute('data-section'),link]));const observer=new IntersectionObserver((entries)=>{entries.forEach((entry)=>{if(!entry.isIntersecting){return;}const id=entry.target.getAttribute('id');if(!id){return;}navLinks.forEach((link)=>link.classList.remove('active'));const matched=sectionMap.get(id);if(matched){matched.classList.add('active');}});},{root:null,rootMargin:'-30% 0px -55% 0px',threshold:[0.05,0.2,0.5]});document.querySelectorAll('.report-section[id]').forEach((section)=>observer.observe(section));",
    "navLinks.forEach((link)=>{link.addEventListener('click',(event)=>{const href=link.getAttribute('href');if(!href||!href.startsWith('#')){return;}const target=document.querySelector(href);if(!target){return;}event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'',href);});});",
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}

function BuildSystemReportTopCards(metadata: proxmox_lxc_system_report_metadata_t): string {
  return [
    BuildSystemReportMiniCard({ key_text: "Sections", value_text: String(metadata.sections.length) }),
    BuildSystemReportMiniCard({ key_text: "Success", value_text: String(metadata.section_status_counts.success) }),
    BuildSystemReportMiniCard({ key_text: "Partial", value_text: String(metadata.section_status_counts.partial) }),
    BuildSystemReportMiniCard({ key_text: "Failed", value_text: String(metadata.section_status_counts.failed) }),
    BuildSystemReportMiniCard({ key_text: "Disabled", value_text: String(metadata.section_status_counts.disabled) }),
  ].join("");
}

function BuildSystemReportSummaryCards(params: {
  section_record: proxmox_lxc_system_report_section_metadata_t;
  payload: unknown;
  row_count: number;
}): string {
  const cards = [
    BuildSystemReportMiniCard({ key_text: "Status", value_text: params.section_record.status }),
    BuildSystemReportMiniCard({ key_text: "Rows", value_text: String(params.row_count) }),
    BuildSystemReportMiniCard({ key_text: "Warnings", value_text: String(params.section_record.warning_count) }),
    BuildSystemReportMiniCard({ key_text: "Errors", value_text: String(params.section_record.error_count) }),
    BuildSystemReportMiniCard({ key_text: "Truncated", value_text: String(params.section_record.truncated) }),
    BuildSystemReportMiniCard({ key_text: "Duration (ms)", value_text: String(params.section_record.duration_ms) }),
  ];
  const summary_text = ExtractSystemReportSectionSummaryText(params.payload);
  if (summary_text) {
    cards.push(BuildSystemReportMiniCard({ key_text: "Summary", value_text: summary_text }));
  }
  return cards.join("");
}

function BuildSystemReportMiniCard(params: {
  key_text: string;
  value_text: string;
}): string {
  return `<div class="card"><div class="k">${EscapeHtml(params.key_text)}</div><div class="v">${EscapeHtml(params.value_text)}</div></div>`;
}

function BuildSystemReportSectionTable(params: {
  section_id: proxmox_lxc_system_report_section_id_t;
  rows: Array<Record<string, unknown>>;
  max_table_rows: number;
}): string {
  const rows = params.rows;
  if (!rows || rows.length === 0) {
    return "<p class=\"muted\">No row data available for this section.</p>";
  }
  const normalized_rows = rows.slice(0, params.max_table_rows);
  const column_names = ResolveTableColumnNames(normalized_rows);
  if (column_names.length === 0) {
    return `<p class="muted">Rows available: ${rows.length} (no tabular columns detected).</p>`;
  }
  const table_id = `table-${params.section_id}`;
  const table_container_id = `table-container-${params.section_id}`;
  const collapse_threshold = 40;
  const should_enable_collapse = rows.length > collapse_threshold;
  const container_classes = should_enable_collapse ? "table-collapsed" : "table-expanded";
  const toolbar_html = should_enable_collapse
    ? `<div class="table-toolbar"><button type="button" class="table-toggle" data-target="${EscapeHtml(table_container_id)}">Expand table</button><span class="muted">Large dataset (${rows.length} rows)</span></div>`
    : "";
  return [
    `<input class="table-filter" data-target="${EscapeHtml(table_id)}" placeholder="Filter rows..." />`,
    toolbar_html,
    `<div id="${EscapeHtml(table_container_id)}" class="${EscapeHtml(container_classes)}">`,
    "<div class=\"table-wrap\">",
    `<table id="${EscapeHtml(table_id)}">`,
    "<thead><tr>",
    column_names.map((column_name) => `<th>${EscapeHtml(column_name)}</th>`).join(""),
    "</tr></thead>",
    "<tbody>",
    normalized_rows.map((row_record) => {
      return "<tr>"
        + column_names.map((column_name) => {
          const cell_value = row_record[column_name as keyof typeof row_record];
          return `<td>${EscapeHtml(FormatCellValue(cell_value))}</td>`;
        }).join("")
        + "</tr>";
    }).join(""),
    "</tbody>",
    "</table>",
    "</div>",
    "</div>",
    rows.length > params.max_table_rows
      ? `<p class="muted">Showing ${params.max_table_rows} of ${rows.length} rows.</p>`
      : "",
  ].join("");
}

function ExtractSystemReportSectionRows(params: {
  section_id: proxmox_lxc_system_report_section_id_t;
  payload: unknown;
}): Array<Record<string, unknown>> {
  if (!params.payload || typeof params.payload !== "object") {
    return [];
  }
  const payload = params.payload as Record<string, unknown>;
  if (params.section_id === "cron_jobs" && Array.isArray(payload.jobs)) {
    return payload.jobs as Array<Record<string, unknown>>;
  }
  if (params.section_id === "processes" && Array.isArray(payload.processes)) {
    return payload.processes as Array<Record<string, unknown>>;
  }
  if (params.section_id === "tcp_ports" && Array.isArray(payload.listeners)) {
    return payload.listeners as Array<Record<string, unknown>>;
  }
  if (params.section_id === "udp_ports" && Array.isArray(payload.listeners)) {
    return payload.listeners as Array<Record<string, unknown>>;
  }
  if (params.section_id === "services" && Array.isArray(payload.services)) {
    return payload.services as Array<Record<string, unknown>>;
  }
  if (params.section_id === "hardware" && Array.isArray(payload.devices)) {
    return payload.devices as Array<Record<string, unknown>>;
  }
  if (params.section_id === "disk" && Array.isArray(payload.block_devices)) {
    return payload.block_devices as Array<Record<string, unknown>>;
  }
  if (params.section_id === "memory" && Array.isArray(payload.processes)) {
    return payload.processes as Array<Record<string, unknown>>;
  }
  if (params.section_id === "cpu" && Array.isArray(payload.cores)) {
    return payload.cores as Array<Record<string, unknown>>;
  }
  if (params.section_id === "identity" && Array.isArray(payload.users)) {
    return payload.users as Array<Record<string, unknown>>;
  }
  if (params.section_id === "firewall" && Array.isArray(payload.rules)) {
    return payload.rules as Array<Record<string, unknown>>;
  }
  if (params.section_id === "devtools" && Array.isArray(payload.toolchains)) {
    return (payload.toolchains as Array<Record<string, unknown>>).map((toolchain_record) => {
      return {
        ecosystem_kind: toolchain_record.ecosystem_kind,
        is_present: toolchain_record.is_present,
        executables_count: Array.isArray(toolchain_record.executables) ? toolchain_record.executables.length : 0,
        package_managers_count: Array.isArray(toolchain_record.package_managers) ? toolchain_record.package_managers.length : 0,
        modules_count: Array.isArray(toolchain_record.libraries_or_modules) ? toolchain_record.libraries_or_modules.length : 0,
        distro_packages_count: Array.isArray(toolchain_record.distro_packages) ? toolchain_record.distro_packages.length : 0,
      };
    });
  }
  return Object.entries(payload).map(([field_key, field_value]) => ({
    field: field_key,
    value: field_value,
  }));
}

function ExtractSystemReportSectionSummaryText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const payload_record = payload as Record<string, unknown>;
  if (payload_record.summary && typeof payload_record.summary === "object") {
    return SafeJsonStringify(payload_record.summary);
  }
  if (typeof payload_record.distribution_pretty_name === "string") {
    const kernel_release = NormalizeOptionalText(payload_record.kernel_release as string | undefined) ?? "unknown";
    return `${payload_record.distribution_pretty_name} / ${kernel_release}`;
  }
  return undefined;
}

function ResolveTableColumnNames(rows: Array<Record<string, unknown>>): string[] {
  const column_name_set = new Set<string>();
  for (const row_record of rows) {
    for (const column_name of Object.keys(row_record)) {
      column_name_set.add(column_name);
    }
  }
  return [...column_name_set];
}

function FormatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return SafeJsonStringify(value);
}

function GetSystemReportSectionTitle(section_id: proxmox_lxc_system_report_section_id_t): string {
  const section_title_map: Record<proxmox_lxc_system_report_section_id_t, string> = {
    system_info: "Distribution and Kernel Version",
    cron_jobs: "Cron Jobs",
    processes: "Running Processes",
    tcp_ports: "Open TCP Ports",
    udp_ports: "Open UDP Ports",
    services: "Services and Daemons",
    hardware: "Available Hardware Devices",
    disk: "Disk and Block Devices",
    memory: "Memory and Swap",
    cpu: "CPU Information",
    identity: "Users and Groups",
    firewall: "Firewall",
    devtools: "Development Tool Availability",
  };
  return section_title_map[section_id];
}

function SafeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function EscapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function BuildCpuProbeShellCommand(params: {
  include_cgroup_limits: boolean;
  include_cpu_pressure: boolean;
}): string {
  return [
    "# __PROXMOX_CPU_PROBE__",
    "if [ -r /proc/cpuinfo ]; then",
    "  awk '{printf \"__CPUINFO__\\t%s\\n\",$0}' /proc/cpuinfo",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'cpuinfo' 'cpu_probe_unavailable'",
    "fi",
    "if [ -r /proc/stat ]; then",
    "  awk '/^cpu([0-9]+)?[[:space:]]/ {printf \"__CPUSTAT__\\t%s\\n\",$0}' /proc/stat",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'cpustat' 'cpu_probe_unavailable'",
    "fi",
    "if [ -r /sys/devices/system/cpu/online ]; then printf '__CPUONLINE__\\t%s\\n' \"$(cat /sys/devices/system/cpu/online 2>/dev/null | tr -d '\\r\\n')\"; fi",
    "if [ -r /sys/devices/system/cpu/offline ]; then printf '__CPUOFFLINE__\\t%s\\n' \"$(cat /sys/devices/system/cpu/offline 2>/dev/null | tr -d '\\r\\n')\"; fi",
    "if [ -r /proc/loadavg ]; then awk '{printf \"__CPULOAD__\\t%s\\n\",$0}' /proc/loadavg; else printf '__ERR__\\t%s\\t%s\\n' 'loadavg' 'cpu_partial_data:loadavg_unavailable'; fi",
    "if command -v uname >/dev/null 2>&1; then printf '__CPUARCH__\\t%s\\n' \"$(uname -m 2>/dev/null | tr -d '\\r\\n')\"; fi",
    ...(params.include_cpu_pressure
      ? [
        "if [ -r /proc/pressure/cpu ]; then awk '/^some/ {printf \"__CPUPSI__\\tsome\\t%s\\n\",$0} /^full/ {printf \"__CPUPSI__\\tfull\\t%s\\n\",$0}' /proc/pressure/cpu; else printf '__ERR__\\t%s\\t%s\\n' 'cpu_pressure' 'cpu_pressure_unavailable'; fi",
      ]
      : []),
    ...(params.include_cgroup_limits
      ? [
        "if [ -r /sys/fs/cgroup/cpu.max ]; then printf '__CPUCGROUP__\\tcpu.max\\t%s\\n' \"$(cat /sys/fs/cgroup/cpu.max 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/cpu.weight ]; then printf '__CPUCGROUP__\\tcpu.weight\\t%s\\n' \"$(cat /sys/fs/cgroup/cpu.weight 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/cpuset.cpus.effective ]; then printf '__CPUCGROUP__\\tcpuset.cpus.effective\\t%s\\n' \"$(cat /sys/fs/cgroup/cpuset.cpus.effective 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/cpu/cpu.cfs_quota_us ]; then printf '__CPUCGROUP__\\tcpu.cfs_quota_us\\t%s\\n' \"$(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/cpu/cpu.cfs_period_us ]; then printf '__CPUCGROUP__\\tcpu.cfs_period_us\\t%s\\n' \"$(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us 2>/dev/null | tr -d '\\r\\n')\"; fi",
        "if [ -r /sys/fs/cgroup/cpuset/cpuset.cpus ]; then printf '__CPUCGROUP__\\tcpuset.cpus\\t%s\\n' \"$(cat /sys/fs/cgroup/cpuset/cpuset.cpus 2>/dev/null | tr -d '\\r\\n')\"; fi",
      ]
      : []),
  ].join("\n");
}

function BuildCpuTopSnapshotShellCommand(): string {
  return [
    "# __PROXMOX_CPU_TOP_SNAPSHOT__",
    "if command -v ps >/dev/null 2>&1; then",
    "  ps -eo pid=,user=,pcpu=,comm=,args= --sort=-pcpu 2>/dev/null | head -n 20 | awk '{pid=$1; user=$2; cpu=$3; comm=$4; $1=$2=$3=$4=\"\"; sub(/^ +/,\"\"); printf \"__CPUTOP__\\t%s\\t%s\\t%s\\t%s\\t%s\\n\", pid, user, cpu, comm, $0}'",
    "else",
    "  printf '__ERR__\\t%s\\t%s\\n' 'top_snapshot' 'cpu_probe_unavailable'",
    "fi",
  ].join("\n");
}

function ParseCpuProbeOutput(params: {
  probe_output: string;
}): {
  primary_source: string;
  fallback_used: boolean;
  cpu: {
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
  };
  cores: proxmox_lxc_cpu_core_t[];
  loadavg_1m?: number;
  loadavg_5m?: number;
  loadavg_15m?: number;
  psi_some_avg10?: number;
  psi_full_avg10?: number;
  scan_errors: proxmox_lxc_cpu_scan_error_t[];
  parse_warnings: proxmox_lxc_cpu_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_cpu_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_cpu_parse_warning_t[] = [];
  const cpuinfo_blocks: Array<Record<string, string>> = [];
  let current_cpuinfo_block: Record<string, string> = {};
  const core_stat_map = new Map<number, proxmox_lxc_cpu_core_t["stat"]>();
  let online_cpu_set: Set<number> | undefined;
  let offline_cpu_set: Set<number> | undefined;
  let cpuset_effective: string | undefined;
  let cpuset_cpu_count: number | undefined;
  let cgroup_quota_us: number | undefined;
  let cgroup_period_us: number | undefined;
  let architecture: string | undefined;
  let loadavg_1m: number | undefined;
  let loadavg_5m: number | undefined;
  let loadavg_15m: number | undefined;
  let psi_some_avg10: number | undefined;
  let psi_full_avg10: number | undefined;
  let fallback_used = false;
  let cpuinfo_seen = false;

  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      scan_errors.push({
        source_kind: fields[1] ?? "probe",
        reason: fields[2] ?? "cpu_partial_data:probe_error",
      });
      if ((fields[2] ?? "").includes("unavailable")) {
        fallback_used = true;
      }
      continue;
    }
    if (normalized_line.startsWith("__CPUINFO__\t")) {
      cpuinfo_seen = true;
      const cpuinfo_line = raw_line.slice("__CPUINFO__\t".length);
      if (cpuinfo_line.trim().length === 0) {
        if (Object.keys(current_cpuinfo_block).length > 0) {
          cpuinfo_blocks.push(current_cpuinfo_block);
          current_cpuinfo_block = {};
        }
        continue;
      }
      const separator_index = cpuinfo_line.indexOf(":");
      if (separator_index <= 0) {
        parse_warnings.push({
          source_kind: "cpuinfo",
          reason: "cpu_parse_failed:invalid_cpuinfo_line",
          raw_line: cpuinfo_line,
        });
        continue;
      }
      const raw_key = cpuinfo_line.slice(0, separator_index).trim().toLowerCase();
      const raw_value = cpuinfo_line.slice(separator_index + 1).trim();
      if (raw_key.length > 0) {
        current_cpuinfo_block[raw_key] = raw_value;
      }
      continue;
    }
    if (normalized_line.startsWith("__CPUSTAT__\t")) {
      const stat_line = raw_line.slice("__CPUSTAT__\t".length).trim();
      if (!stat_line.startsWith("cpu")) {
        continue;
      }
      const stat_fields = stat_line.split(/\s+/g);
      const core_match = stat_fields[0].match(/^cpu([0-9]+)$/);
      if (!core_match) {
        continue;
      }
      const core_id = Number.parseInt(core_match[1], 10);
      if (!Number.isInteger(core_id) || core_id < 0) {
        continue;
      }
      core_stat_map.set(core_id, {
        user: ParseOptionalInteger(stat_fields[1]),
        nice: ParseOptionalInteger(stat_fields[2]),
        system: ParseOptionalInteger(stat_fields[3]),
        idle: ParseOptionalInteger(stat_fields[4]),
        iowait: ParseOptionalInteger(stat_fields[5]),
        irq: ParseOptionalInteger(stat_fields[6]),
        softirq: ParseOptionalInteger(stat_fields[7]),
        steal: ParseOptionalInteger(stat_fields[8]),
        guest: ParseOptionalInteger(stat_fields[9]),
        guest_nice: ParseOptionalInteger(stat_fields[10]),
      });
      continue;
    }
    if (normalized_line.startsWith("__CPUONLINE__\t")) {
      online_cpu_set = ParseCpuRangeSet(raw_line.split("\t")[1] ?? "");
      continue;
    }
    if (normalized_line.startsWith("__CPUOFFLINE__\t")) {
      offline_cpu_set = ParseCpuRangeSet(raw_line.split("\t")[1] ?? "");
      continue;
    }
    if (normalized_line.startsWith("__CPUCGROUP__\t")) {
      const fields = raw_line.split("\t");
      if (fields.length < 3) {
        continue;
      }
      const cgroup_key = NormalizeOptionalText(fields[1]) ?? "";
      const cgroup_value = NormalizeOptionalText(fields[2]) ?? "";
      if (cgroup_key === "cpuset.cpus.effective" || cgroup_key === "cpuset.cpus") {
        cpuset_effective = cgroup_value;
        const parsed_cpuset = ParseCpuRangeSet(cgroup_value);
        if (parsed_cpuset.size > 0) {
          cpuset_cpu_count = parsed_cpuset.size;
        }
      } else if (cgroup_key === "cpu.max") {
        const max_fields = cgroup_value.split(/\s+/g).filter((field_value) => field_value.length > 0);
        if (max_fields.length >= 2 && max_fields[0] !== "max") {
          cgroup_quota_us = ParseOptionalInteger(max_fields[0]);
          cgroup_period_us = ParseOptionalInteger(max_fields[1]);
        }
      } else if (cgroup_key === "cpu.cfs_quota_us") {
        cgroup_quota_us = ParseOptionalInteger(cgroup_value);
      } else if (cgroup_key === "cpu.cfs_period_us") {
        cgroup_period_us = ParseOptionalInteger(cgroup_value);
      }
      continue;
    }
    if (normalized_line.startsWith("__CPULOAD__\t")) {
      const fields = raw_line.split("\t");
      const load_fields = (fields[1] ?? "").split(/\s+/g);
      loadavg_1m = load_fields.length > 0 ? Number.parseFloat(load_fields[0]) : undefined;
      loadavg_5m = load_fields.length > 1 ? Number.parseFloat(load_fields[1]) : undefined;
      loadavg_15m = load_fields.length > 2 ? Number.parseFloat(load_fields[2]) : undefined;
      if (loadavg_1m !== undefined && Number.isNaN(loadavg_1m)) {
        loadavg_1m = undefined;
      }
      if (loadavg_5m !== undefined && Number.isNaN(loadavg_5m)) {
        loadavg_5m = undefined;
      }
      if (loadavg_15m !== undefined && Number.isNaN(loadavg_15m)) {
        loadavg_15m = undefined;
      }
      continue;
    }
    if (normalized_line.startsWith("__CPUPSI__\t")) {
      const fields = raw_line.split("\t");
      const psi_kind = NormalizeOptionalText(fields[1]) ?? "";
      const psi_payload = fields.slice(2).join("\t");
      const avg10_match = psi_payload.match(/avg10=([0-9]+(?:\.[0-9]+)?)/);
      const avg10_value = avg10_match ? Number.parseFloat(avg10_match[1]) : undefined;
      if (avg10_value === undefined || Number.isNaN(avg10_value)) {
        continue;
      }
      if (psi_kind === "some") {
        psi_some_avg10 = avg10_value;
      } else if (psi_kind === "full") {
        psi_full_avg10 = avg10_value;
      }
      continue;
    }
    if (normalized_line.startsWith("__CPUARCH__\t")) {
      architecture = NormalizeOptionalText(raw_line.split("\t")[1]) ?? undefined;
      continue;
    }
  }
  if (Object.keys(current_cpuinfo_block).length > 0) {
    cpuinfo_blocks.push(current_cpuinfo_block);
  }

  const cores: proxmox_lxc_cpu_core_t[] = [];
  const has_online_cpu_set = online_cpu_set !== undefined && online_cpu_set.size > 0;
  for (const cpuinfo_block of cpuinfo_blocks) {
    const processor_id = ParseOptionalInteger(cpuinfo_block.processor);
    if (processor_id === undefined || processor_id < 0) {
      continue;
    }
    const online_value = has_online_cpu_set
      ? online_cpu_set!.has(processor_id)
      : (offline_cpu_set ? !offline_cpu_set.has(processor_id) : true);
    cores.push({
      core_id: processor_id,
      processor_id,
      physical_id: ParseOptionalInteger(cpuinfo_block["physical id"]),
      siblings: ParseOptionalInteger(cpuinfo_block.siblings),
      cpu_cores: ParseOptionalInteger(cpuinfo_block["cpu cores"]),
      bogomips: ParseOptionalNumber(cpuinfo_block.bogomips),
      mhz: ParseOptionalNumber(cpuinfo_block["cpu mhz"]),
      online: online_value,
      stat: core_stat_map.get(processor_id),
    });
  }
  for (const [core_id, stat_record] of core_stat_map.entries()) {
    if (!cores.some((core_record) => core_record.core_id === core_id)) {
      const online_value = online_cpu_set
        ? (has_online_cpu_set ? online_cpu_set.has(core_id) : (offline_cpu_set ? !offline_cpu_set.has(core_id) : true))
        : (offline_cpu_set ? !offline_cpu_set.has(core_id) : true);
      cores.push({
        core_id,
        processor_id: core_id,
        online: online_value,
        stat: stat_record,
      });
    }
  }
  cores.sort((left_core, right_core) => left_core.core_id - right_core.core_id);

  const first_cpu_block = cpuinfo_blocks[0] ?? {};
  const flags = NormalizeOptionalText(first_cpu_block.flags)
    ?.split(/\s+/g)
    .filter((flag_value) => flag_value.length > 0);
  const logical_cpu_count = cores.length > 0 ? cores.length : undefined;
  const online_cpu_count = cores.filter((core_record) => core_record.online !== false).length;
  const offline_cpu_count = cores.filter((core_record) => core_record.online === false).length;
  const effective_quota_cores = cgroup_quota_us !== undefined
    && cgroup_period_us !== undefined
    && cgroup_quota_us > 0
    && cgroup_period_us > 0
    ? RoundFloat(cgroup_quota_us / cgroup_period_us, 3)
    : undefined;

  return {
    primary_source: cpuinfo_seen ? "cpuinfo" : "cpustat",
    fallback_used,
    cpu: {
      vendor_id: NormalizeOptionalText(first_cpu_block.vendor_id) ?? undefined,
      model_name: NormalizeOptionalText(first_cpu_block["model name"]) ?? undefined,
      cpu_family: NormalizeOptionalText(first_cpu_block["cpu family"]) ?? undefined,
      model: NormalizeOptionalText(first_cpu_block.model) ?? undefined,
      stepping: NormalizeOptionalText(first_cpu_block.stepping) ?? undefined,
      microcode: NormalizeOptionalText(first_cpu_block.microcode) ?? undefined,
      architecture,
      logical_cpu_count,
      online_cpu_count: logical_cpu_count !== undefined ? online_cpu_count : undefined,
      offline_cpu_count: logical_cpu_count !== undefined ? offline_cpu_count : undefined,
      cpuset_effective,
      cpuset_cpu_count,
      cgroup_quota_us,
      cgroup_period_us,
      effective_quota_cores,
      flags,
    },
    cores,
    loadavg_1m,
    loadavg_5m,
    loadavg_15m,
    psi_some_avg10,
    psi_full_avg10,
    scan_errors,
    parse_warnings,
  };
}

function ParseCpuTopSnapshotOutput(params: {
  probe_output: string;
}): {
  top_snapshot: proxmox_lxc_cpu_top_process_t[];
  scan_errors: proxmox_lxc_cpu_scan_error_t[];
  parse_warnings: proxmox_lxc_cpu_parse_warning_t[];
} {
  const top_snapshot: proxmox_lxc_cpu_top_process_t[] = [];
  const scan_errors: proxmox_lxc_cpu_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_cpu_parse_warning_t[] = [];
  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = raw_line.split("\t");
      scan_errors.push({
        source_kind: fields[1] ?? "top_snapshot",
        reason: fields[2] ?? "cpu_partial_data:top_snapshot_error",
      });
      continue;
    }
    if (!normalized_line.startsWith("__CPUTOP__\t")) {
      continue;
    }
    const fields = raw_line.split("\t");
    if (fields.length < 5) {
      parse_warnings.push({
        source_kind: "top_snapshot",
        reason: "cpu_parse_failed:invalid_top_snapshot_record",
        raw_line,
      });
      continue;
    }
    const pid = ParseOptionalInteger(fields[1]);
    if (pid === undefined || pid <= 0) {
      continue;
    }
    const cpu_percent = ParseOptionalNumber(fields[3]);
    top_snapshot.push({
      pid,
      username: NormalizeOptionalText(fields[2]) ?? undefined,
      cpu_percent,
      comm: NormalizeOptionalText(fields[4]) ?? undefined,
      args: NormalizeOptionalText(fields[5]) ?? undefined,
    });
  }
  top_snapshot.sort((left_record, right_record) => (right_record.cpu_percent ?? -1) - (left_record.cpu_percent ?? -1));
  return {
    top_snapshot,
    scan_errors,
    parse_warnings,
  };
}

function BuildCpuSummary(params: {
  cpu: {
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
  };
  cores: proxmox_lxc_cpu_core_t[];
  top_snapshot: proxmox_lxc_cpu_top_process_t[];
  loadavg_1m?: number;
  loadavg_5m?: number;
  loadavg_15m?: number;
  psi_some_avg10?: number;
  psi_full_avg10?: number;
}): {
  total_bogomips?: number;
  per_core_bogomips: Array<{ core_id: number; bogomips: number }>;
  loadavg_1m?: number;
  loadavg_5m?: number;
  loadavg_15m?: number;
  cpu_pressure_available: boolean;
  psi_some_avg10?: number;
  psi_full_avg10?: number;
  top_cpu_pids: number[];
  top_cpu_processes: proxmox_lxc_cpu_top_process_t[];
  unknown_or_partial_count: number;
} {
  const per_core_bogomips = params.cores
    .filter((core_record): core_record is proxmox_lxc_cpu_core_t & { bogomips: number } => core_record.bogomips !== undefined)
    .map((core_record) => ({
      core_id: core_record.core_id,
      bogomips: core_record.bogomips,
    }))
    .sort((left_core, right_core) => left_core.core_id - right_core.core_id);
  const total_bogomips = per_core_bogomips.length > 0
    ? RoundFloat(per_core_bogomips.reduce((total, core_record) => total + core_record.bogomips, 0), 3)
    : undefined;
  const top_cpu_processes = [...params.top_snapshot].slice(0, 10);
  const top_cpu_pids = top_cpu_processes.map((process_record) => process_record.pid);
  let unknown_or_partial_count = 0;
  if (!params.cpu.model_name) {
    unknown_or_partial_count += 1;
  }
  if (!params.cpu.logical_cpu_count && params.cores.length === 0) {
    unknown_or_partial_count += 1;
  }
  if (total_bogomips === undefined) {
    unknown_or_partial_count += 1;
  }
  if (params.loadavg_1m === undefined && params.loadavg_5m === undefined && params.loadavg_15m === undefined) {
    unknown_or_partial_count += 1;
  }
  return {
    total_bogomips,
    per_core_bogomips,
    loadavg_1m: params.loadavg_1m,
    loadavg_5m: params.loadavg_5m,
    loadavg_15m: params.loadavg_15m,
    cpu_pressure_available: params.psi_some_avg10 !== undefined || params.psi_full_avg10 !== undefined,
    psi_some_avg10: params.psi_some_avg10,
    psi_full_avg10: params.psi_full_avg10,
    top_cpu_pids,
    top_cpu_processes,
    unknown_or_partial_count,
  };
}

function ParseCpuRangeSet(raw_value: string): Set<number> {
  const cpu_set = new Set<number>();
  const normalized_value = raw_value.trim();
  if (!normalized_value) {
    return cpu_set;
  }
  for (const token of normalized_value.split(",")) {
    const normalized_token = token.trim();
    if (!normalized_token) {
      continue;
    }
    const range_match = normalized_token.match(/^([0-9]+)-([0-9]+)$/);
    if (!range_match) {
      const single_value = Number.parseInt(normalized_token, 10);
      if (Number.isInteger(single_value) && single_value >= 0) {
        cpu_set.add(single_value);
      }
      continue;
    }
    const start_value = Number.parseInt(range_match[1], 10);
    const end_value = Number.parseInt(range_match[2], 10);
    if (!Number.isInteger(start_value) || !Number.isInteger(end_value) || start_value < 0 || end_value < start_value) {
      continue;
    }
    for (let cpu_index = start_value; cpu_index <= end_value; cpu_index += 1) {
      cpu_set.add(cpu_index);
    }
  }
  return cpu_set;
}

function BuildMemorySummary(params: {
  memory: {
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
  };
  swap: {
    swap_total_kb?: number;
    swap_free_kb?: number;
    swap_used_kb?: number;
    swap_used_percent?: number;
    devices: Array<{
      source: string;
      type?: string;
      size_kb?: number;
      used_kb?: number;
      priority?: number;
    }>;
  };
  kernel: {
    kernel_stack_kb?: number;
    page_tables_kb?: number;
    slab_kb?: number;
    s_unreclaim_kb?: number;
    kernel_memory_estimate_kb?: number;
  };
  processes: proxmox_lxc_memory_process_t[];
  psi_some_avg10?: number;
  psi_full_avg10?: number;
  cgroup_limit_kb?: number;
  cgroup_current_kb?: number;
  cgroup_swap_limit_kb?: number;
  cgroup_swap_current_kb?: number;
}): {
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
} {
  const top_rss_pids = [...params.processes]
    .sort((left_process, right_process) => (right_process.rss_kb ?? -1) - (left_process.rss_kb ?? -1))
    .slice(0, 10)
    .map((process_record) => process_record.pid);
  const top_memory_percent_pids = [...params.processes]
    .sort((left_process, right_process) => (right_process.memory_percent ?? -1) - (left_process.memory_percent ?? -1))
    .slice(0, 10)
    .map((process_record) => process_record.pid);
  let unknown_or_partial_count = 0;
  if (!params.memory.mem_total_kb) {
    unknown_or_partial_count += 1;
  }
  if (!params.memory.mem_available_kb && !params.memory.mem_free_kb) {
    unknown_or_partial_count += 1;
  }
  if (!params.swap.swap_total_kb && params.swap.devices.length === 0) {
    unknown_or_partial_count += 1;
  }
  if (!params.kernel.kernel_memory_estimate_kb) {
    unknown_or_partial_count += 1;
  }
  return {
    process_count: params.processes.length,
    top_rss_pids,
    top_memory_percent_pids,
    memory_pressure_available: params.psi_some_avg10 !== undefined || params.psi_full_avg10 !== undefined,
    psi_some_avg10: params.psi_some_avg10,
    psi_full_avg10: params.psi_full_avg10,
    cgroup_limit_kb: params.cgroup_limit_kb,
    cgroup_current_kb: params.cgroup_current_kb,
    cgroup_swap_limit_kb: params.cgroup_swap_limit_kb,
    cgroup_swap_current_kb: params.cgroup_swap_current_kb,
    unknown_or_partial_count,
  };
}

function RoundFloat(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function ParseLspciRawRecord(raw_value: string): proxmox_lxc_hardware_device_t | undefined {
  const normalized_value = raw_value.trim();
  if (!normalized_value) {
    return undefined;
  }
  const address_match = normalized_value.match(/^([0-9a-fA-F:.]+)\s+(.+)$/);
  if (!address_match) {
    return undefined;
  }
  const pci_address = address_match[1];
  const description = address_match[2].trim();
  const id_match = description.match(/\[([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\]/);
  const class_segment = description.split(":")[0]?.trim() ?? "pci_device";
  const is_graphics = /vga|3d|display/i.test(description);
  return {
    device_id: `pci:${pci_address}`,
    name: description,
    class: is_graphics ? "graphics" : class_segment.toLowerCase().replace(/\s+/g, "_"),
    subclass: class_segment,
    bus_type: "pci",
    pci_address,
    vendor_id: id_match ? NormalizeHardwareId(id_match[1]) : undefined,
    product_id: id_match ? NormalizeHardwareId(id_match[2]) : undefined,
    model: description,
    is_graphics,
    is_virtual_device: LooksLikeVirtualDevice({
      source_text: description,
      path: undefined,
    }),
    is_passthrough_candidate: !is_graphics,
    source_kind: "lspci",
  };
}

function ParseLsusbRawRecord(raw_value: string): proxmox_lxc_hardware_device_t | undefined {
  const normalized_value = raw_value.trim();
  const usb_match = normalized_value.match(/^Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\s+(.+)$/);
  if (!usb_match) {
    return undefined;
  }
  const bus_number = usb_match[1].padStart(3, "0");
  const device_number = usb_match[2].padStart(3, "0");
  const vendor_id = NormalizeHardwareId(usb_match[3]);
  const product_id = NormalizeHardwareId(usb_match[4]);
  const device_name = usb_match[5].trim();
  return {
    device_id: `usb:${bus_number}:${device_number}:${vendor_id ?? "unknown"}:${product_id ?? "unknown"}`,
    name: device_name,
    class: "usb",
    subclass: "device",
    bus_type: "usb",
    usb_bus_device: `${bus_number}:${device_number}`,
    vendor_id,
    product_id,
    model: device_name,
    is_graphics: false,
    is_virtual_device: LooksLikeVirtualDevice({
      source_text: device_name,
      path: undefined,
    }),
    source_kind: "lsusb",
  };
}

function ClassFromPciClassCode(raw_class_code: string | undefined): {
  class_name: string;
  subclass_name?: string;
  is_graphics: boolean;
} {
  const normalized_class_code = NormalizeHardwareId(raw_class_code) ?? "";
  if (normalized_class_code.startsWith("0x")) {
    if (normalized_class_code.startsWith("0x03")) {
      return { class_name: "graphics", subclass_name: normalized_class_code, is_graphics: true };
    }
    if (normalized_class_code.startsWith("0x02")) {
      return { class_name: "network", subclass_name: normalized_class_code, is_graphics: false };
    }
    if (normalized_class_code.startsWith("0x01")) {
      return { class_name: "storage", subclass_name: normalized_class_code, is_graphics: false };
    }
    if (normalized_class_code.startsWith("0x0c")) {
      return { class_name: "bus_controller", subclass_name: normalized_class_code, is_graphics: false };
    }
  }
  return {
    class_name: "pci_device",
    subclass_name: normalized_class_code || undefined,
    is_graphics: false,
  };
}

function NormalizeHardwareId(raw_value: string | undefined): string | undefined {
  const normalized_value = NormalizeOptionalText(raw_value);
  if (!normalized_value) {
    return undefined;
  }
  return normalized_value.toLowerCase();
}

function NormalizeHardwareSourceKind(raw_source_kind: string | undefined): proxmox_lxc_hardware_source_kind_t {
  const normalized_source_kind = (raw_source_kind ?? "").trim().toLowerCase();
  if (normalized_source_kind === "sysfs_net") {
    return "sysfs_net";
  }
  if (normalized_source_kind === "sysfs_block") {
    return "sysfs_block";
  }
  if (normalized_source_kind === "lspci") {
    return "lspci";
  }
  if (normalized_source_kind === "sysfs_pci") {
    return "sysfs_pci";
  }
  if (normalized_source_kind === "lsusb") {
    return "lsusb";
  }
  if (normalized_source_kind === "sysfs_usb") {
    return "sysfs_usb";
  }
  if (normalized_source_kind === "proc_mounts") {
    return "proc_mounts";
  }
  if (normalized_source_kind === "proc_meminfo") {
    return "proc_meminfo";
  }
  if (normalized_source_kind === "proc_cpuinfo") {
    return "proc_cpuinfo";
  }
  if (normalized_source_kind === "dri") {
    return "dri";
  }
  return "probe";
}

function LooksLikeVirtualDevice(params: {
  source_text: string | undefined;
  path: string | undefined;
}): boolean {
  if (params.path?.includes("/virtual/")) {
    return true;
  }
  const source_text = (params.source_text ?? "").toLowerCase();
  return /virtio|qemu|vmware|xen|veth|tap|loop/.test(source_text);
}

function ParseSystemdServicesProbeOutput(params: {
  probe_output: string;
  detail_level: proxmox_lxc_service_detail_level_t;
  metadata_max_length: number;
  service_limit: number;
}): {
  manager_detected: boolean;
  services: proxmox_lxc_service_record_t[];
  scan_errors: proxmox_lxc_service_scan_error_t[];
  parse_warnings: proxmox_lxc_service_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_service_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_service_parse_warning_t[] = [];
  const unit_map = new Map<string, { active_state: string; sub_state?: string; description?: string }>();
  const unit_file_map = new Map<string, string>();
  const show_map = new Map<string, Record<string, string>>();
  let manager_detected = false;
  let show_record: Record<string, string> = {};

  const flush_show_record = (): void => {
    const show_id = NormalizeOptionalText(show_record.Id);
    if (!show_id) {
      show_record = {};
      return;
    }
    show_map.set(show_id, { ...show_record });
    show_record = {};
  };

  for (const raw_line of params.probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = normalized_line.split("\t");
      const reason = fields[1] ?? "service_probe_unavailable:systemd";
      scan_errors.push({
        source_kind: "systemd_units",
        reason: reason === "systemd_unavailable" ? "service_probe_unavailable:systemd" : reason,
      });
      if (reason !== "systemd_unavailable") {
        manager_detected = true;
      }
      continue;
    }
    if (normalized_line.startsWith("__UNIT__\t")) {
      manager_detected = true;
      const fields = raw_line.split("\t");
      if (fields.length < 5) {
        parse_warnings.push({
          source_kind: "systemd_units",
          reason: "service_parse_failed:invalid_systemd_unit_field_count",
          raw_line,
        });
        continue;
      }
      const service_name = fields[1]?.trim();
      if (!service_name) {
        parse_warnings.push({
          source_kind: "systemd_units",
          reason: "service_parse_failed:invalid_systemd_unit_name",
          raw_line,
        });
        continue;
      }
      unit_map.set(service_name, {
        active_state: NormalizeOptionalText(fields[2]) ?? "unknown",
        sub_state: NormalizeOptionalText(fields[3]) ?? undefined,
        description: NormalizeOptionalText(fields.slice(4).join("\t")) ?? undefined,
      });
      continue;
    }
    if (normalized_line.startsWith("__UNITFILE__\t")) {
      manager_detected = true;
      const fields = raw_line.split("\t");
      if (fields.length < 3) {
        parse_warnings.push({
          source_kind: "systemd_unit_files",
          reason: "service_parse_failed:invalid_systemd_unit_file_record",
          raw_line,
        });
        continue;
      }
      const service_name = fields[1]?.trim();
      if (!service_name) {
        continue;
      }
      unit_file_map.set(service_name, NormalizeOptionalText(fields[2]) ?? "unknown");
      continue;
    }
    if (normalized_line.startsWith("__SHOWLINE__\t")) {
      manager_detected = true;
      const show_content = raw_line.slice("__SHOWLINE__\t".length);
      if (!show_content.trim()) {
        flush_show_record();
        continue;
      }
      const equals_index = show_content.indexOf("=");
      if (equals_index <= 0) {
        parse_warnings.push({
          source_kind: "systemd_units",
          reason: "service_parse_failed:invalid_systemd_show_line",
          raw_line,
        });
        continue;
      }
      const key_name = show_content.slice(0, equals_index).trim();
      const value = show_content.slice(equals_index + 1).trim();
      if (key_name === "Id" && show_record.Id && show_record.Id !== value) {
        flush_show_record();
      }
      show_record[key_name] = value;
    }
  }
  flush_show_record();

  let service_names = Array.from(new Set<string>([
    ...unit_map.keys(),
    ...unit_file_map.keys(),
    ...show_map.keys(),
  ])).sort((left_name, right_name) => left_name.localeCompare(right_name));
  if (service_names.length > params.service_limit) {
    service_names = service_names.slice(0, params.service_limit);
    scan_errors.push({
      source_kind: "systemd_units",
      reason: "service_limit_applied",
    });
  }
  const services: proxmox_lxc_service_record_t[] = [];
  for (const service_name of service_names) {
    const unit_record = unit_map.get(service_name);
    const show_record_value = show_map.get(service_name);
    const enabled_state = unit_file_map.get(service_name);
    const active_state = unit_record?.active_state
      ?? ((ParseOptionalInteger(show_record_value?.MainPID) ?? 0) > 0 ? "active" : "unknown");
    const sub_state = unit_record?.sub_state;
    const main_pid = ParseOptionalInteger(show_record_value?.MainPID);
    const control_pid = ParseOptionalInteger(show_record_value?.ControlPID);
    const process_pid_list = [
      ...(main_pid !== undefined && main_pid > 0 ? [main_pid] : []),
      ...(control_pid !== undefined && control_pid > 0 ? [control_pid] : []),
    ];
    const cpu_usage_nsec = ParseOptionalInteger(show_record_value?.CPUUsageNSec);
    services.push({
      service_name,
      display_name: service_name.replace(/\.service$/, ""),
      description: TruncateServiceMetadata({
        raw_value: unit_record?.description,
        metadata_max_length: params.metadata_max_length,
      }),
      manager_kind: "systemd",
      active_state,
      sub_state,
      is_running: active_state === "active" || sub_state === "running",
      health_state: active_state === "failed" ? "failed" : undefined,
      enabled_state,
      start_on_boot: ResolveServiceStartOnBoot(enabled_state),
      preset_state: NormalizeOptionalText(show_record_value?.UnitFilePreset) ?? undefined,
      main_pid: main_pid && main_pid > 0 ? main_pid : undefined,
      pids: process_pid_list.length > 0 ? [...new Set(process_pid_list)] : undefined,
      exec_start: params.detail_level === "full"
        ? TruncateServiceMetadata({
          raw_value: NormalizeOptionalText(show_record_value?.ExecStart) ?? undefined,
          metadata_max_length: params.metadata_max_length,
        })
        : undefined,
      exec_reload: params.detail_level === "full"
        ? TruncateServiceMetadata({
          raw_value: NormalizeOptionalText(show_record_value?.ExecReload) ?? undefined,
          metadata_max_length: params.metadata_max_length,
        })
        : undefined,
      restart_policy: params.detail_level === "summary_only"
        ? undefined
        : TruncateServiceMetadata({
          raw_value: NormalizeOptionalText(show_record_value?.Restart) ?? undefined,
          metadata_max_length: params.metadata_max_length,
        }),
      tasks_current: ParseOptionalInteger(show_record_value?.TasksCurrent),
      memory_current_bytes: ParseOptionalInteger(show_record_value?.MemoryCurrent),
      cpu_usage_usec: cpu_usage_nsec !== undefined ? Math.floor(cpu_usage_nsec / 1000) : undefined,
      unit_file_path: TruncateServiceMetadata({
        raw_value: NormalizeOptionalText(show_record_value?.FragmentPath) ?? undefined,
        metadata_max_length: params.metadata_max_length,
      }),
      fragment_path: TruncateServiceMetadata({
        raw_value: NormalizeOptionalText(show_record_value?.FragmentPath) ?? undefined,
        metadata_max_length: params.metadata_max_length,
      }),
      source_kind: "systemd_units",
    });
  }
  return {
    manager_detected,
    services,
    scan_errors,
    parse_warnings,
  };
}

function ParseOpenrcServicesProbeOutput(probe_output: string): {
  manager_detected: boolean;
  services: proxmox_lxc_service_record_t[];
  scan_errors: proxmox_lxc_service_scan_error_t[];
  parse_warnings: proxmox_lxc_service_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_service_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_service_parse_warning_t[] = [];
  const services: proxmox_lxc_service_record_t[] = [];
  let manager_detected = false;

  for (const raw_line of probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = normalized_line.split("\t");
      const reason = fields[1] ?? "openrc_probe_error";
      scan_errors.push({
        source_kind: "openrc_status",
        reason: reason === "openrc_unavailable" ? "service_probe_unavailable:openrc" : reason,
      });
      if (reason !== "openrc_unavailable") {
        manager_detected = true;
      }
      continue;
    }
    if (!normalized_line.startsWith("__OPENRC__\t")) {
      continue;
    }
    manager_detected = true;
    const fields = raw_line.split("\t");
    if (fields.length < 4) {
        parse_warnings.push({
          source_kind: "openrc_status",
          reason: "service_parse_failed:invalid_openrc_record",
          raw_line,
        });
      continue;
    }
    const service_name = NormalizeOptionalText(fields[1]) ?? undefined;
    if (!service_name) {
      continue;
    }
    const active_state = NormalizeOptionalText(fields[2]) ?? "unknown";
    const enabled_state = NormalizeOptionalText(fields[3]) ?? "unknown";
    services.push({
      service_name,
      display_name: service_name,
      manager_kind: "openrc",
      active_state,
      is_running: active_state === "started" || active_state === "running",
      health_state: active_state === "crashed" ? "failed" : undefined,
      enabled_state,
      start_on_boot: ResolveServiceStartOnBoot(enabled_state),
      source_kind: "openrc_status",
    });
  }
  return {
    manager_detected,
    services,
    scan_errors,
    parse_warnings,
  };
}

function ParseSysvServicesProbeOutput(probe_output: string): {
  manager_detected: boolean;
  services: proxmox_lxc_service_record_t[];
  scan_errors: proxmox_lxc_service_scan_error_t[];
  parse_warnings: proxmox_lxc_service_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_service_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_service_parse_warning_t[] = [];
  const service_status_map = new Map<string, { active_state: string; health_state?: string }>();
  const initd_names = new Set<string>();
  let manager_detected = false;

  for (const raw_line of probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = normalized_line.split("\t");
      const reason = fields[1] ?? "sysv_probe_error";
      scan_errors.push({
        source_kind: "sysv_service_status",
        reason: reason === "sysv_service_unavailable" ? "service_probe_unavailable:sysvinit" : reason,
      });
      if (reason !== "sysv_service_unavailable") {
        manager_detected = true;
      }
      continue;
    }
    if (normalized_line.startsWith("__SYSV__\t")) {
      manager_detected = true;
      const fields = raw_line.split("\t");
      if (fields.length < 3) {
        parse_warnings.push({
          source_kind: "sysv_service_status",
          reason: "service_parse_failed:invalid_sysv_status_record",
          raw_line,
        });
        continue;
      }
      const service_name = NormalizeOptionalText(fields[1]) ?? undefined;
      if (!service_name) {
        continue;
      }
      const status_symbol = NormalizeOptionalText(fields[2]) ?? "?";
      if (status_symbol === "+") {
        service_status_map.set(service_name, { active_state: "running" });
      } else if (status_symbol === "-") {
        service_status_map.set(service_name, { active_state: "stopped" });
      } else {
        service_status_map.set(service_name, { active_state: "unknown", health_state: "unknown" });
      }
      continue;
    }
    if (normalized_line.startsWith("__INITD__\t")) {
      manager_detected = true;
      const service_name = NormalizeOptionalText(raw_line.slice("__INITD__\t".length)) ?? undefined;
      if (service_name) {
        initd_names.add(service_name);
      }
    }
  }

  const service_names = new Set<string>([
    ...service_status_map.keys(),
    ...initd_names.values(),
  ]);
  const services: proxmox_lxc_service_record_t[] = [];
  for (const service_name of Array.from(service_names).sort((left_name, right_name) => left_name.localeCompare(right_name))) {
    const status_record = service_status_map.get(service_name);
    const active_state = status_record?.active_state ?? "unknown";
    services.push({
      service_name,
      display_name: service_name,
      manager_kind: "sysvinit",
      active_state,
      is_running: active_state === "running",
      health_state: status_record?.health_state,
      source_kind: status_record ? "sysv_service_status" : "sysv_initd",
    });
  }
  return {
    manager_detected,
    services,
    scan_errors,
    parse_warnings,
  };
}

function ParseStaticServicesProbeOutput(probe_output: string): {
  services: proxmox_lxc_service_record_t[];
  scan_errors: proxmox_lxc_service_scan_error_t[];
  parse_warnings: proxmox_lxc_service_parse_warning_t[];
} {
  const scan_errors: proxmox_lxc_service_scan_error_t[] = [];
  const parse_warnings: proxmox_lxc_service_parse_warning_t[] = [];
  const service_map = new Map<string, string>();
  for (const raw_line of probe_output.split(/\r?\n/g)) {
    const normalized_line = raw_line.trim();
    if (!normalized_line) {
      continue;
    }
    if (normalized_line.startsWith("__ERR__\t")) {
      const fields = normalized_line.split("\t");
      scan_errors.push({
        source_kind: "fallback_static",
        reason: fields[1] ?? "service_probe_unavailable:static",
      });
      continue;
    }
    if (!normalized_line.startsWith("__STATIC__\t")) {
      continue;
    }
    const fields = raw_line.split("\t");
    if (fields.length < 3) {
      parse_warnings.push({
        source_kind: "fallback_static",
        reason: "service_parse_failed:invalid_static_service_record",
        raw_line,
      });
      continue;
    }
    const service_name = NormalizeOptionalText(fields[1]) ?? undefined;
    const source_path = NormalizeOptionalText(fields[2]) ?? undefined;
    if (!service_name || !source_path) {
      continue;
    }
    service_map.set(service_name, source_path);
  }
  const services: proxmox_lxc_service_record_t[] = [];
  for (const [service_name, source_path] of Array.from(service_map.entries()).sort((left_entry, right_entry) => {
    return left_entry[0].localeCompare(right_entry[0]);
  })) {
    services.push({
      service_name,
      display_name: service_name.replace(/\.service$/, ""),
      manager_kind: "unknown",
      active_state: "unknown",
      is_running: false,
      unit_file_path: source_path,
      source_kind: "fallback_static",
    });
  }
  return {
    services,
    scan_errors,
    parse_warnings,
  };
}

function NormalizeServiceNameFilter(raw_name_filter: string[] | undefined): string[] | undefined {
  if (!raw_name_filter || raw_name_filter.length === 0) {
    return undefined;
  }
  const normalized_filter = raw_name_filter
    .map((raw_filter_value) => raw_filter_value.trim().toLowerCase())
    .filter((normalized_value) => normalized_value.length > 0);
  return normalized_filter.length > 0 ? [...new Set(normalized_filter)] : undefined;
}

function ResolveServiceStartOnBoot(enabled_state: string | undefined): boolean | undefined {
  if (!enabled_state) {
    return undefined;
  }
  const normalized_enabled_state = enabled_state.trim().toLowerCase();
  if (!normalized_enabled_state) {
    return undefined;
  }
  if (
    normalized_enabled_state === "enabled"
    || normalized_enabled_state === "enabled-runtime"
    || normalized_enabled_state === "linked"
    || normalized_enabled_state === "linked-runtime"
    || normalized_enabled_state === "alias"
  ) {
    return true;
  }
  if (
    normalized_enabled_state === "disabled"
    || normalized_enabled_state === "masked"
    || normalized_enabled_state === "masked-runtime"
  ) {
    return false;
  }
  return undefined;
}

function ApplyServiceFilters(params: {
  services: proxmox_lxc_service_record_t[];
  include_inactive: boolean;
  include_failed: boolean;
  include_disabled: boolean;
  name_filter?: string[];
}): proxmox_lxc_service_record_t[] {
  const filtered_services: proxmox_lxc_service_record_t[] = [];
  for (const service_record of params.services) {
    const active_state = service_record.active_state.trim().toLowerCase();
    const enabled_state = (service_record.enabled_state ?? "").trim().toLowerCase();
    const is_failed = active_state === "failed" || service_record.health_state === "failed";
    if (!params.include_inactive && !service_record.is_running) {
      continue;
    }
    if (!params.include_failed && is_failed) {
      continue;
    }
    if (
      !params.include_disabled
      && (
        enabled_state === "disabled"
        || enabled_state === "masked"
        || enabled_state === "masked-runtime"
      )
    ) {
      continue;
    }
    if (params.name_filter && params.name_filter.length > 0) {
      const service_name = service_record.service_name.toLowerCase();
      const display_name = (service_record.display_name ?? "").toLowerCase();
      const matches_filter = params.name_filter.some((filter_value) => {
        return service_name.includes(filter_value) || display_name.includes(filter_value);
      });
      if (!matches_filter) {
        continue;
      }
    }
    filtered_services.push(service_record);
  }
  return filtered_services;
}

function BuildServiceSummary(services: proxmox_lxc_service_record_t[]): {
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
} {
  const state_counts: Record<string, number> = {};
  const manager_counts: Record<string, number> = {};
  const process_counts: Record<string, number> = {};
  const user_counts: Record<string, number> = {};
  const failed_services = new Set<string>();
  let running_count = 0;
  let stopped_count = 0;
  let failed_count = 0;
  let enabled_count = 0;
  let disabled_count = 0;
  let static_count = 0;
  let masked_count = 0;

  for (const service_record of services) {
    const normalized_state = service_record.active_state.trim().toLowerCase() || "unknown";
    state_counts[normalized_state] = (state_counts[normalized_state] ?? 0) + 1;
    manager_counts[service_record.manager_kind] = (manager_counts[service_record.manager_kind] ?? 0) + 1;
    if (service_record.is_running) {
      running_count += 1;
    } else {
      stopped_count += 1;
    }
    if (normalized_state === "failed" || service_record.health_state === "failed") {
      failed_count += 1;
      failed_services.add(service_record.service_name);
    }
    const enabled_state = (service_record.enabled_state ?? "").trim().toLowerCase();
    if (enabled_state === "enabled" || enabled_state === "enabled-runtime" || enabled_state === "linked") {
      enabled_count += 1;
    }
    if (enabled_state === "disabled") {
      disabled_count += 1;
    }
    if (enabled_state === "static") {
      static_count += 1;
    }
    if (enabled_state === "masked" || enabled_state === "masked-runtime") {
      masked_count += 1;
    }
    const process_key = service_record.process?.comm ?? "unknown";
    process_counts[process_key] = (process_counts[process_key] ?? 0) + 1;
    const user_key = service_record.process?.username ?? String(service_record.process?.uid ?? "unknown");
    user_counts[user_key] = (user_counts[user_key] ?? 0) + 1;
  }

  return {
    total_services: services.length,
    running_count,
    stopped_count,
    failed_count,
    enabled_count,
    disabled_count,
    static_count,
    masked_count,
    state_counts,
    manager_counts,
    process_counts,
    user_counts,
    top_failed_services: Array.from(failed_services).sort((left_name, right_name) => left_name.localeCompare(right_name)).slice(0, 10),
  };
}

function ResolveServiceDetailLevel(
  raw_detail_level: proxmox_lxc_service_detail_level_t | undefined,
): proxmox_lxc_service_detail_level_t {
  const detail_level = raw_detail_level ?? "standard";
  if (
    detail_level !== "summary_only"
    && detail_level !== "standard"
    && detail_level !== "full"
  ) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "detail_level must be summary_only, standard, or full.",
      details: {
        field: "detail_level",
        value: String(raw_detail_level),
      },
    });
  }
  return detail_level;
}

function ResolveServiceProcessEnrichmentMode(params: {
  raw_process_enrichment_mode: proxmox_lxc_service_process_enrichment_mode_t | undefined;
  include_process_details: boolean;
}): proxmox_lxc_service_process_enrichment_mode_t {
  const process_enrichment_mode = params.raw_process_enrichment_mode
    ?? (params.include_process_details ? "full" : "none");
  if (
    process_enrichment_mode !== "none"
    && process_enrichment_mode !== "main_pid_only"
    && process_enrichment_mode !== "full"
  ) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "process_enrichment_mode must be none, main_pid_only, or full.",
      details: {
        field: "process_enrichment_mode",
        value: String(params.raw_process_enrichment_mode),
      },
    });
  }
  return process_enrichment_mode;
}

function TruncateServiceMetadata(params: {
  raw_value: string | undefined;
  metadata_max_length: number;
}): string | undefined {
  if (!params.raw_value) {
    return undefined;
  }
  const normalized_value = params.raw_value.trim();
  if (!normalized_value) {
    return undefined;
  }
  if (normalized_value.length <= params.metadata_max_length) {
    return normalized_value;
  }
  return normalized_value.slice(0, params.metadata_max_length);
}

type lxc_interface_inventory_record_t = {
  interface_name: string;
  is_loopback: boolean;
  ipv4_addresses: string[];
  ipv6_addresses: string[];
  is_up?: boolean;
};

function BuildInterfaceIpProbeShellCommand(): string {
  return [
    "# __PROXMOX_INTERFACE_IP__",
    "if command -v ip >/dev/null 2>&1; then",
    "  ip -o addr show 2>/dev/null | awk '{print \"__IFACE__\\t\"$2\"\\t\"$3\"\\t\"$4}'",
    "else",
    "  printf '__ERR__\\t%s\\n' 'ip_unavailable'",
    "fi",
  ].join("\n");
}

function BuildInterfaceIfconfigProbeShellCommand(): string {
  return [
    "# __PROXMOX_INTERFACE_IFCONFIG__",
    "if command -v ifconfig >/dev/null 2>&1; then",
    "  ifconfig -a 2>/dev/null",
    "else",
    "  printf '__ERR__\\t%s\\n' 'ifconfig_unavailable'",
    "fi",
  ].join("\n");
}

function BuildInterfaceBaseProbeShellCommand(): string {
  return [
    "# __PROXMOX_INTERFACE_BASE__",
    "if [ -d /sys/class/net ]; then",
    "  for interface_path in /sys/class/net/*; do",
    "    [ -e \"$interface_path\" ] || continue",
    "    interface_name=\"$(basename \"$interface_path\")\"",
    "    printf '__IFBASE__\\t%s\\n' \"$interface_name\"",
    "  done",
    "fi",
    "if [ -r /proc/net/dev ]; then",
    "  awk -F: 'NR>2{gsub(/ /,\"\",$1); if(length($1)>0) print \"__IFBASE__\\t\"$1}' /proc/net/dev",
    "fi",
  ].join("\n");
}

function ParseInterfaceProbeErrors(
  probe_output: string,
): proxmox_lxc_tcp_listener_scan_error_t[] {
  const scan_errors: proxmox_lxc_tcp_listener_scan_error_t[] = [];
  for (const raw_line of probe_output.split(/\r?\n/g)) {
    if (!raw_line.startsWith("__ERR__\t")) {
      continue;
    }
    const fields = raw_line.split("\t");
    scan_errors.push({
      source_kind: "interface",
      reason: fields[1] ?? "interface_probe_error",
    });
  }
  return scan_errors;
}

function ParseInterfaceIpProbeOutput(probe_output: string): lxc_interface_inventory_record_t[] {
  const interface_map = new Map<string, lxc_interface_inventory_record_t>();
  for (const raw_line of probe_output.split(/\r?\n/g)) {
    if (!raw_line.startsWith("__IFACE__\t")) {
      continue;
    }
    const fields = raw_line.split("\t");
    if (fields.length < 4) {
      continue;
    }
    const interface_name = fields[1].trim();
    const family = fields[2].trim().toLowerCase();
    const cidr_value = fields[3].trim();
    const address_value = cidr_value.split("/")[0].trim();
    if (!interface_name || !address_value) {
      continue;
    }
    const existing_record = interface_map.get(interface_name) ?? {
      interface_name,
      is_loopback: interface_name === "lo",
      ipv4_addresses: [],
      ipv6_addresses: [],
    };
    if (family === "inet") {
      existing_record.ipv4_addresses = [...new Set([...existing_record.ipv4_addresses, address_value])];
      if (address_value.startsWith("127.")) {
        existing_record.is_loopback = true;
      }
    } else if (family === "inet6") {
      existing_record.ipv6_addresses = [...new Set([...existing_record.ipv6_addresses, address_value])];
      if (address_value === "::1") {
        existing_record.is_loopback = true;
      }
    }
    interface_map.set(interface_name, existing_record);
  }
  return Array.from(interface_map.values());
}

function ParseIfconfigProbeOutput(probe_output: string): lxc_interface_inventory_record_t[] {
  const interface_map = new Map<string, lxc_interface_inventory_record_t>();
  let active_interface_name: string | undefined;
  for (const raw_line of probe_output.split(/\r?\n/g)) {
    const trimmed_line = raw_line.trim();
    if (!trimmed_line || raw_line.startsWith("__ERR__\t")) {
      continue;
    }
    const header_match = raw_line.match(/^([^\s:]+)(?::|\s)/);
    if (header_match && !raw_line.startsWith(" ")) {
      active_interface_name = header_match[1].trim();
      if (!active_interface_name) {
        continue;
      }
      const existing_record = interface_map.get(active_interface_name) ?? {
        interface_name: active_interface_name,
        is_loopback: active_interface_name === "lo" || raw_line.includes("LOOPBACK"),
        ipv4_addresses: [],
        ipv6_addresses: [],
      };
      interface_map.set(active_interface_name, existing_record);
      continue;
    }
    if (!active_interface_name) {
      continue;
    }
    const active_record = interface_map.get(active_interface_name);
    if (!active_record) {
      continue;
    }
    const inet_match = raw_line.match(/\binet (?:addr:)?([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
    if (inet_match) {
      active_record.ipv4_addresses = [...new Set([...active_record.ipv4_addresses, inet_match[1]])];
      if (inet_match[1].startsWith("127.")) {
        active_record.is_loopback = true;
      }
    }
    const inet6_match = raw_line.match(/\binet6 (?:addr:\s*)?([0-9a-fA-F:]+)/);
    if (inet6_match) {
      const normalized_ipv6 = inet6_match[1].toLowerCase();
      active_record.ipv6_addresses = [...new Set([...active_record.ipv6_addresses, normalized_ipv6])];
      if (normalized_ipv6 === "::1") {
        active_record.is_loopback = true;
      }
    }
  }
  return Array.from(interface_map.values());
}

function ParseInterfaceBaseProbeOutput(probe_output: string): string[] {
  const interface_names = new Set<string>();
  for (const raw_line of probe_output.split(/\r?\n/g)) {
    if (!raw_line.startsWith("__IFBASE__\t")) {
      continue;
    }
    const interface_name = raw_line.slice("__IFBASE__\t".length).trim();
    if (!interface_name) {
      continue;
    }
    interface_names.add(interface_name);
  }
  return Array.from(interface_names).sort();
}

function UpsertInterfaceInventory(params: {
  interface_inventory: Map<string, lxc_interface_inventory_record_t>;
  interface_record: lxc_interface_inventory_record_t;
}): void {
  const existing_record = params.interface_inventory.get(params.interface_record.interface_name);
  if (!existing_record) {
    params.interface_inventory.set(params.interface_record.interface_name, {
      interface_name: params.interface_record.interface_name,
      is_loopback: params.interface_record.is_loopback,
      ipv4_addresses: [...new Set(params.interface_record.ipv4_addresses)],
      ipv6_addresses: [...new Set(params.interface_record.ipv6_addresses)],
      is_up: params.interface_record.is_up,
    });
    return;
  }
  existing_record.is_loopback = existing_record.is_loopback || params.interface_record.is_loopback;
  existing_record.ipv4_addresses = [
    ...new Set([...existing_record.ipv4_addresses, ...params.interface_record.ipv4_addresses]),
  ];
  existing_record.ipv6_addresses = [
    ...new Set([...existing_record.ipv6_addresses, ...params.interface_record.ipv6_addresses]),
  ];
  if (params.interface_record.is_up !== undefined) {
    existing_record.is_up = params.interface_record.is_up;
  }
}

function CorrelateListenerInterface(params: {
  listener: proxmox_lxc_tcp_listener_t;
  interface_inventory: Map<string, lxc_interface_inventory_record_t>;
}): proxmox_lxc_tcp_listener_t {
  if (params.interface_inventory.size === 0) {
    return {
      ...params.listener,
      interface_match_kind: "unresolved",
    };
  }
  const interface_records = Array.from(params.interface_inventory.values());
  let matched_interfaces: lxc_interface_inventory_record_t[] = [];
  let interface_match_kind: "exact_ip" | "wildcard_any" | "loopback_default" | "unresolved" = "unresolved";
  if (params.listener.is_wildcard) {
    const has_family_addresses = interface_records.some((interface_record) => params.listener.address_family === "ipv4"
      ? interface_record.ipv4_addresses.length > 0
      : interface_record.ipv6_addresses.length > 0);
    matched_interfaces = has_family_addresses
      ? interface_records.filter((interface_record) => params.listener.address_family === "ipv4"
        ? interface_record.ipv4_addresses.length > 0
        : interface_record.ipv6_addresses.length > 0)
      : interface_records;
    interface_match_kind = matched_interfaces.length > 0 ? "wildcard_any" : "unresolved";
  } else if (params.listener.is_loopback) {
    matched_interfaces = interface_records.filter((interface_record) => interface_record.is_loopback
      || interface_record.interface_name === "lo"
      || interface_record.ipv4_addresses.some((address_value) => address_value.startsWith("127."))
      || interface_record.ipv6_addresses.some((address_value) => address_value === "::1"));
    interface_match_kind = matched_interfaces.length > 0 ? "loopback_default" : "unresolved";
  } else {
    const normalized_listener_address = params.listener.bind_address.trim().toLowerCase();
    matched_interfaces = interface_records.filter((interface_record) => {
      const candidate_addresses = params.listener.address_family === "ipv4"
        ? interface_record.ipv4_addresses
        : interface_record.ipv6_addresses;
      return candidate_addresses.some(
        (address_value) => address_value.trim().toLowerCase() === normalized_listener_address,
      );
    });
    interface_match_kind = matched_interfaces.length > 0 ? "exact_ip" : "unresolved";
  }

  const interface_names = [...new Set(matched_interfaces.map((interface_record) => interface_record.interface_name))]
    .sort((left_name, right_name) => left_name.localeCompare(right_name));
  const interface_addresses = [...new Set(
    matched_interfaces.flatMap((interface_record) => params.listener.address_family === "ipv4"
      ? interface_record.ipv4_addresses
      : interface_record.ipv6_addresses),
  )];
  const warnings = [...(params.listener.warnings ?? [])];
  if (interface_match_kind === "unresolved") {
    warnings.push("interface_correlation_unresolved");
  }
  return {
    ...params.listener,
    interface_match_kind,
    interface_name: interface_names[0],
    interface_names: interface_names.length > 0 ? interface_names : undefined,
    interface_addresses: interface_addresses.length > 0 ? interface_addresses : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function CorrelateUdpListenerInterface(params: {
  listener: proxmox_lxc_udp_listener_t;
  interface_inventory: Map<string, lxc_interface_inventory_record_t>;
}): proxmox_lxc_udp_listener_t {
  if (params.interface_inventory.size === 0) {
    return {
      ...params.listener,
      interface_match_kind: "unresolved",
    };
  }
  const interface_records = Array.from(params.interface_inventory.values());
  let matched_interfaces: lxc_interface_inventory_record_t[] = [];
  let interface_match_kind: "exact_ip" | "wildcard_any" | "loopback_default" | "unresolved" = "unresolved";
  if (params.listener.is_wildcard) {
    const has_family_addresses = interface_records.some((interface_record) => params.listener.address_family === "ipv4"
      ? interface_record.ipv4_addresses.length > 0
      : interface_record.ipv6_addresses.length > 0);
    matched_interfaces = has_family_addresses
      ? interface_records.filter((interface_record) => params.listener.address_family === "ipv4"
        ? interface_record.ipv4_addresses.length > 0
        : interface_record.ipv6_addresses.length > 0)
      : interface_records;
    interface_match_kind = matched_interfaces.length > 0 ? "wildcard_any" : "unresolved";
  } else if (params.listener.is_loopback) {
    matched_interfaces = interface_records.filter((interface_record) => interface_record.is_loopback
      || interface_record.interface_name === "lo"
      || interface_record.ipv4_addresses.some((address_value) => address_value.startsWith("127."))
      || interface_record.ipv6_addresses.some((address_value) => address_value === "::1"));
    interface_match_kind = matched_interfaces.length > 0 ? "loopback_default" : "unresolved";
  } else {
    const normalized_listener_address = params.listener.bind_address.trim().toLowerCase();
    matched_interfaces = interface_records.filter((interface_record) => {
      const candidate_addresses = params.listener.address_family === "ipv4"
        ? interface_record.ipv4_addresses
        : interface_record.ipv6_addresses;
      return candidate_addresses.some(
        (address_value) => address_value.trim().toLowerCase() === normalized_listener_address,
      );
    });
    interface_match_kind = matched_interfaces.length > 0 ? "exact_ip" : "unresolved";
  }
  const interface_names = [...new Set(matched_interfaces.map((interface_record) => interface_record.interface_name))]
    .sort((left_name, right_name) => left_name.localeCompare(right_name));
  const interface_addresses = [...new Set(
    matched_interfaces.flatMap((interface_record) => params.listener.address_family === "ipv4"
      ? interface_record.ipv4_addresses
      : interface_record.ipv6_addresses),
  )];
  const warnings = [...(params.listener.warnings ?? [])];
  if (interface_match_kind === "unresolved") {
    warnings.push("interface_correlation_unresolved");
  }
  return {
    ...params.listener,
    interface_match_kind,
    interface_name: interface_names[0],
    interface_names: interface_names.length > 0 ? interface_names : undefined,
    interface_addresses: interface_addresses.length > 0 ? interface_addresses : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function ParseSsListenerLine(raw_line: string): proxmox_lxc_tcp_listener_t | undefined {
  const fields = raw_line.trim().split(/\s+/g);
  if (fields.length < 5) {
    return undefined;
  }
  const state = fields[0].toUpperCase();
  if (state !== "LISTEN") {
    return undefined;
  }
  const recv_queue = ParseOptionalInteger(fields[1]);
  const send_queue = ParseOptionalInteger(fields[2]);
  const local_endpoint = fields[3];
  const process_segment = fields.slice(5).join(" ");
  const endpoint = ParseTcpEndpoint(local_endpoint);
  if (!endpoint) {
    return undefined;
  }
  const pid = ParsePidFromProcessSegment(process_segment);
  const fd = ParseFdFromProcessSegment(process_segment);
  const inode = ParseInodeFromProcessSegment(process_segment);
  const comm = ParseCommandFromProcessSegment(process_segment);
  return {
    port: endpoint.port,
    ip_address: endpoint.bind_address,
    bind_address: endpoint.bind_address,
    address_family: endpoint.address_family,
    is_loopback: endpoint.is_loopback,
    is_wildcard: endpoint.is_wildcard,
    state,
    recv_queue,
    send_queue,
    source_kind: "ss",
    pid,
    fd,
    inode,
    interface_match_kind: "unresolved",
    warnings: comm ? undefined : ["process_name_unresolved"],
  };
}

function ParseNetstatListenerLine(raw_line: string): proxmox_lxc_tcp_listener_t | undefined {
  const fields = raw_line.trim().split(/\s+/g);
  if (fields.length < 7) {
    return undefined;
  }
  const protocol = fields[0].toLowerCase();
  if (!protocol.startsWith("tcp")) {
    return undefined;
  }
  const local_endpoint = fields[3];
  const state = (fields[5] ?? "").toUpperCase();
  if (state !== "LISTEN") {
    return undefined;
  }
  const endpoint = ParseTcpEndpoint(local_endpoint);
  if (!endpoint) {
    return undefined;
  }
  const pid_program = fields[6] ?? "";
  const pid = ParseOptionalInteger(pid_program.split("/")[0]);
  return {
    port: endpoint.port,
    ip_address: endpoint.bind_address,
    bind_address: endpoint.bind_address,
    address_family: endpoint.address_family,
    is_loopback: endpoint.is_loopback,
    is_wildcard: endpoint.is_wildcard,
    state,
    recv_queue: ParseOptionalInteger(fields[1]),
    send_queue: ParseOptionalInteger(fields[2]),
    source_kind: "netstat",
    pid,
    interface_match_kind: "unresolved",
  };
}

function ParseProcTcpListenerLine(params: {
  source_path: string;
  local_address_hex: string;
  state_hex: string;
  inode_raw: string;
}): proxmox_lxc_tcp_listener_t | undefined {
  if (params.state_hex !== "0A") {
    return undefined;
  }
  const endpoint = ParseProcTcpEndpoint({
    source_path: params.source_path,
    local_address_hex: params.local_address_hex,
  });
  if (!endpoint) {
    return undefined;
  }
  return {
    port: endpoint.port,
    ip_address: endpoint.bind_address,
    bind_address: endpoint.bind_address,
    address_family: endpoint.address_family,
    is_loopback: endpoint.is_loopback,
    is_wildcard: endpoint.is_wildcard,
    state: "LISTEN",
    source_kind: "procfs",
    inode: ParseOptionalInteger(params.inode_raw),
    interface_match_kind: "unresolved",
  };
}

function ParseSsUdpListenerLine(raw_line: string): proxmox_lxc_udp_listener_t | undefined {
  const fields = raw_line.trim().split(/\s+/g);
  if (fields.length < 5) {
    return undefined;
  }
  const state = fields[0].toUpperCase();
  const recv_queue = ParseOptionalInteger(fields[1]);
  const send_queue = ParseOptionalInteger(fields[2]);
  const local_endpoint = fields[3];
  const process_segment = fields.slice(5).join(" ");
  const endpoint = ParseTcpEndpoint(local_endpoint);
  if (!endpoint) {
    return undefined;
  }
  const pid = ParsePidFromProcessSegment(process_segment);
  const fd = ParseFdFromProcessSegment(process_segment);
  const inode = ParseInodeFromProcessSegment(process_segment);
  const comm = ParseCommandFromProcessSegment(process_segment);
  return {
    port: endpoint.port,
    ip_address: endpoint.bind_address,
    bind_address: endpoint.bind_address,
    address_family: endpoint.address_family,
    is_loopback: endpoint.is_loopback,
    is_wildcard: endpoint.is_wildcard,
    state,
    recv_queue,
    send_queue,
    source_kind: "ss",
    pid,
    fd,
    inode,
    interface_match_kind: "unresolved",
    warnings: comm ? undefined : ["process_name_unresolved"],
  };
}

function ParseNetstatUdpListenerLine(raw_line: string): proxmox_lxc_udp_listener_t | undefined {
  const fields = raw_line.trim().split(/\s+/g);
  if (fields.length < 6) {
    return undefined;
  }
  const protocol = fields[0].toLowerCase();
  if (!protocol.startsWith("udp")) {
    return undefined;
  }
  const local_endpoint = fields[3];
  const endpoint = ParseTcpEndpoint(local_endpoint);
  if (!endpoint) {
    return undefined;
  }
  const pid_program = fields[fields.length - 1] ?? "";
  const pid = ParseOptionalInteger(pid_program.split("/")[0]);
  const state_candidate = fields.length > 6 ? fields[5].toUpperCase() : "UNCONN";
  return {
    port: endpoint.port,
    ip_address: endpoint.bind_address,
    bind_address: endpoint.bind_address,
    address_family: endpoint.address_family,
    is_loopback: endpoint.is_loopback,
    is_wildcard: endpoint.is_wildcard,
    state: state_candidate || "UNCONN",
    recv_queue: ParseOptionalInteger(fields[1]),
    send_queue: ParseOptionalInteger(fields[2]),
    source_kind: "netstat",
    pid,
    interface_match_kind: "unresolved",
  };
}

function ParseProcUdpListenerLine(params: {
  source_path: string;
  local_address_hex: string;
  state_hex: string;
  inode_raw: string;
}): proxmox_lxc_udp_listener_t | undefined {
  const endpoint = ParseProcTcpEndpoint({
    source_path: params.source_path.endsWith("udp6") ? "/proc/net/tcp6" : "/proc/net/tcp",
    local_address_hex: params.local_address_hex,
  });
  if (!endpoint) {
    return undefined;
  }
  return {
    port: endpoint.port,
    ip_address: endpoint.bind_address,
    bind_address: endpoint.bind_address,
    address_family: endpoint.address_family,
    is_loopback: endpoint.is_loopback,
    is_wildcard: endpoint.is_wildcard,
    state: MapUdpProcState(params.state_hex),
    source_kind: "procfs",
    inode: ParseOptionalInteger(params.inode_raw),
    interface_match_kind: "unresolved",
  };
}

function MapUdpProcState(raw_state_hex: string): string {
  const normalized = raw_state_hex.trim().toUpperCase();
  if (normalized === "07") {
    return "UNCONN";
  }
  if (normalized === "01") {
    return "ESTABLISHED";
  }
  if (normalized === "0A") {
    return "LISTEN";
  }
  return `STATE_${normalized}`;
}

function ParseTcpEndpoint(raw_endpoint: string): {
  bind_address: string;
  port: number;
  address_family: proxmox_lxc_address_family_t;
  is_loopback: boolean;
  is_wildcard: boolean;
} | undefined {
  const normalized = raw_endpoint.trim();
  if (!normalized) {
    return undefined;
  }
  const normalized_without_zone = normalized.replace(/%[A-Za-z0-9_.-]+/g, "");
  let host_part = "";
  let port_part = "";
  if (normalized_without_zone.startsWith("[")) {
    const closing_index = normalized_without_zone.lastIndexOf("]:");
    if (closing_index <= 0) {
      return undefined;
    }
    host_part = normalized_without_zone.slice(1, closing_index);
    port_part = normalized_without_zone.slice(closing_index + 2);
  } else {
    const last_colon_index = normalized_without_zone.lastIndexOf(":");
    if (last_colon_index <= 0) {
      return undefined;
    }
    host_part = normalized_without_zone.slice(0, last_colon_index);
    port_part = normalized_without_zone.slice(last_colon_index + 1);
  }
  const port = ParseOptionalInteger(port_part);
  if (port === undefined || port < 1 || port > 65535) {
    return undefined;
  }
  const normalized_host = host_part.trim();
  const address_family: proxmox_lxc_address_family_t = normalized_host.includes(":") ? "ipv6" : "ipv4";
  const is_wildcard = normalized_host === "0.0.0.0" || normalized_host === "::" || normalized_host === "*";
  const is_loopback = normalized_host.startsWith("127.") || normalized_host === "::1";
  return {
    bind_address: normalized_host,
    port,
    address_family,
    is_loopback,
    is_wildcard,
  };
}

function ParseProcTcpEndpoint(params: {
  source_path: string;
  local_address_hex: string;
}): {
  bind_address: string;
  port: number;
  address_family: proxmox_lxc_address_family_t;
  is_loopback: boolean;
  is_wildcard: boolean;
} | undefined {
  const segments = params.local_address_hex.split(":");
  if (segments.length !== 2) {
    return undefined;
  }
  const address_hex = segments[0];
  const port_hex = segments[1];
  const port = Number.parseInt(port_hex, 16);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }
  if (params.source_path.endsWith("tcp")) {
    if (address_hex.length !== 8) {
      return undefined;
    }
    const octets: number[] = [];
    for (let index = 0; index < 8; index += 2) {
      octets.push(Number.parseInt(address_hex.slice(index, index + 2), 16));
    }
    const ipv4_octets = octets.reverse();
    const bind_address = ipv4_octets.join(".");
    return {
      bind_address,
      port,
      address_family: "ipv4",
      is_loopback: bind_address.startsWith("127."),
      is_wildcard: bind_address === "0.0.0.0",
    };
  }
  if (address_hex.length !== 32) {
    return undefined;
  }
  const groups: string[] = [];
  for (let index = 0; index < 32; index += 4) {
    groups.push(address_hex.slice(index, index + 4));
  }
  const bind_address = groups.join(":").replace(/(^|:)0+(?=\w)/g, "$1");
  return {
    bind_address,
    port,
    address_family: "ipv6",
    is_loopback: bind_address === "0:0:0:0:0:0:0:1" || bind_address === "::1",
    is_wildcard: bind_address === "0:0:0:0:0:0:0:0" || bind_address === "::",
  };
}

function ParsePidFromProcessSegment(raw_process_segment: string): number | undefined {
  const match = raw_process_segment.match(/pid=(\d+)/);
  if (!match) {
    return undefined;
  }
  return ParseOptionalInteger(match[1]);
}

function ParseFdFromProcessSegment(raw_process_segment: string): number | undefined {
  const match = raw_process_segment.match(/fd=(\d+)/);
  if (!match) {
    return undefined;
  }
  return ParseOptionalInteger(match[1]);
}

function ParseInodeFromProcessSegment(raw_process_segment: string): number | undefined {
  const match = raw_process_segment.match(/ino=(\d+)/);
  if (!match) {
    return undefined;
  }
  return ParseOptionalInteger(match[1]);
}

function ParseCommandFromProcessSegment(raw_process_segment: string): string | undefined {
  const match = raw_process_segment.match(/\"([^\"]+)\"/);
  if (!match) {
    return undefined;
  }
  return match[1];
}

function ApplyTcpListenerFilters(params: {
  listeners: proxmox_lxc_tcp_listener_t[];
  include_loopback: boolean;
  port_filter?: Set<number>;
  address_family_filter?: Set<proxmox_lxc_address_family_t>;
}): proxmox_lxc_tcp_listener_t[] {
  const filtered_listeners: proxmox_lxc_tcp_listener_t[] = [];
  for (const listener of params.listeners) {
    if (!params.include_loopback && listener.is_loopback) {
      continue;
    }
    if (params.port_filter && !params.port_filter.has(listener.port)) {
      continue;
    }
    if (params.address_family_filter && !params.address_family_filter.has(listener.address_family)) {
      continue;
    }
    filtered_listeners.push(listener);
  }
  return filtered_listeners;
}

function BuildTcpListenerSummary(listeners: proxmox_lxc_tcp_listener_t[]): {
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
} {
  const port_counts: Record<string, number> = {};
  const address_family_counts: Record<string, number> = {};
  const bind_scope_counts: Record<string, number> = {};
  const interface_counts: Record<string, number> = {};
  let interface_resolved_count = 0;
  let interface_unresolved_count = 0;
  const user_counts: Record<string, number> = {};
  const process_counts: Record<string, number> = {};
  for (const listener of listeners) {
    const port_key = String(listener.port);
    port_counts[port_key] = (port_counts[port_key] ?? 0) + 1;
    address_family_counts[listener.address_family] = (address_family_counts[listener.address_family] ?? 0) + 1;
    const bind_scope = listener.is_wildcard ? "wildcard" : (listener.is_loopback ? "loopback" : "specific");
    bind_scope_counts[bind_scope] = (bind_scope_counts[bind_scope] ?? 0) + 1;
    const user_key = listener.process?.username ?? String(listener.process?.uid ?? "unknown");
    user_counts[user_key] = (user_counts[user_key] ?? 0) + 1;
    const process_key = listener.process?.comm ?? "unknown";
    process_counts[process_key] = (process_counts[process_key] ?? 0) + 1;
    if (listener.interface_names && listener.interface_names.length > 0) {
      interface_resolved_count += 1;
      for (const interface_name of listener.interface_names) {
        interface_counts[interface_name] = (interface_counts[interface_name] ?? 0) + 1;
      }
    } else {
      interface_unresolved_count += 1;
    }
  }
  const top_ports = Object.keys(port_counts)
    .map((port_key) => Number.parseInt(port_key, 10))
    .filter((port) => Number.isInteger(port))
    .sort((left_port, right_port) => (port_counts[String(right_port)] ?? 0) - (port_counts[String(left_port)] ?? 0))
    .slice(0, 10);
  const top_interfaces = Object.keys(interface_counts)
    .sort(
      (left_interface, right_interface) => (interface_counts[right_interface] ?? 0) - (interface_counts[left_interface] ?? 0),
    )
    .slice(0, 10);
  return {
    total_listeners: listeners.length,
    unique_ports: Object.keys(port_counts).length,
    port_counts,
    address_family_counts,
    bind_scope_counts,
    interface_counts,
    interface_resolved_count,
    interface_unresolved_count,
    user_counts,
    process_counts,
    top_ports,
    top_interfaces,
  };
}

function ApplyUdpListenerFilters(params: {
  listeners: proxmox_lxc_udp_listener_t[];
  include_loopback: boolean;
  port_filter?: Set<number>;
  address_family_filter?: Set<proxmox_lxc_address_family_t>;
}): proxmox_lxc_udp_listener_t[] {
  const filtered_listeners: proxmox_lxc_udp_listener_t[] = [];
  for (const listener of params.listeners) {
    if (!params.include_loopback && listener.is_loopback) {
      continue;
    }
    if (params.port_filter && !params.port_filter.has(listener.port)) {
      continue;
    }
    if (params.address_family_filter && !params.address_family_filter.has(listener.address_family)) {
      continue;
    }
    filtered_listeners.push(listener);
  }
  return filtered_listeners;
}

function BuildUdpListenerSummary(listeners: proxmox_lxc_udp_listener_t[]): {
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
} {
  const port_counts: Record<string, number> = {};
  const address_family_counts: Record<string, number> = {};
  const bind_scope_counts: Record<string, number> = {};
  const interface_counts: Record<string, number> = {};
  let interface_resolved_count = 0;
  let interface_unresolved_count = 0;
  const user_counts: Record<string, number> = {};
  const process_counts: Record<string, number> = {};
  for (const listener of listeners) {
    const port_key = String(listener.port);
    port_counts[port_key] = (port_counts[port_key] ?? 0) + 1;
    address_family_counts[listener.address_family] = (address_family_counts[listener.address_family] ?? 0) + 1;
    const bind_scope = listener.is_wildcard ? "wildcard" : (listener.is_loopback ? "loopback" : "specific");
    bind_scope_counts[bind_scope] = (bind_scope_counts[bind_scope] ?? 0) + 1;
    const user_key = listener.process?.username ?? String(listener.process?.uid ?? "unknown");
    user_counts[user_key] = (user_counts[user_key] ?? 0) + 1;
    const process_key = listener.process?.comm ?? "unknown";
    process_counts[process_key] = (process_counts[process_key] ?? 0) + 1;
    if (listener.interface_names && listener.interface_names.length > 0) {
      interface_resolved_count += 1;
      for (const interface_name of listener.interface_names) {
        interface_counts[interface_name] = (interface_counts[interface_name] ?? 0) + 1;
      }
    } else {
      interface_unresolved_count += 1;
    }
  }
  const top_ports = Object.keys(port_counts)
    .map((port_key) => Number.parseInt(port_key, 10))
    .filter((port) => Number.isInteger(port))
    .sort((left_port, right_port) => (port_counts[String(right_port)] ?? 0) - (port_counts[String(left_port)] ?? 0))
    .slice(0, 10);
  const top_interfaces = Object.keys(interface_counts)
    .sort(
      (left_interface, right_interface) => (interface_counts[right_interface] ?? 0) - (interface_counts[left_interface] ?? 0),
    )
    .slice(0, 10);
  return {
    total_listeners: listeners.length,
    unique_ports: Object.keys(port_counts).length,
    port_counts,
    address_family_counts,
    bind_scope_counts,
    interface_counts,
    interface_resolved_count,
    interface_unresolved_count,
    user_counts,
    process_counts,
    top_ports,
    top_interfaces,
  };
}

function ResolveEnvironmentMode(
  raw_environment_mode: proxmox_lxc_process_environment_mode_t | undefined,
  include_environment: boolean,
): proxmox_lxc_process_environment_mode_t {
  if (!include_environment) {
    return "none";
  }
  const environment_mode = raw_environment_mode ?? "keys_only";
  if (
    environment_mode !== "none"
    && environment_mode !== "keys_only"
    && environment_mode !== "sanitized_values"
  ) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "environment_mode must be none, keys_only, or sanitized_values.",
      details: {
        field: "environment_mode",
        value: String(raw_environment_mode),
      },
    });
  }
  return environment_mode;
}

function NormalizeProcessPidFilter(raw_pid_filter: Array<number | string> | undefined): Set<number> | undefined {
  if (!raw_pid_filter || raw_pid_filter.length === 0) {
    return undefined;
  }
  const normalized = new Set<number>();
  for (const raw_pid of raw_pid_filter) {
    const pid_value = Number.parseInt(String(raw_pid).trim(), 10);
    if (!Number.isInteger(pid_value) || pid_value <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "pid_filter entries must be positive integer values.",
        details: {
          field: "pid_filter",
          value: String(raw_pid),
        },
      });
    }
    normalized.add(pid_value);
  }
  return normalized;
}

function NormalizeUserFilter(raw_user_filter: string[] | undefined): Set<string> | undefined {
  if (!raw_user_filter || raw_user_filter.length === 0) {
    return undefined;
  }
  const normalized = new Set<string>();
  for (const raw_user of raw_user_filter) {
    const normalized_user = raw_user.trim().toLowerCase();
    if (!normalized_user) {
      continue;
    }
    normalized.add(normalized_user);
  }
  return normalized.size > 0 ? normalized : undefined;
}

function BuildProcessPsProbeShellCommand(): string {
  return [
    "# __PROXMOX_PROCESS_PS__",
    "ps -ewwo pid=,ppid=,pgid=,sid=,uid=,gid=,user=,group=,stat=,etime=,pcpu=,pmem=,rss=,vsz=,tty=,comm=,args= 2>/dev/null | awk 'BEGIN{OFS=\"\\t\"}{pid=$1;ppid=$2;pgid=$3;sid=$4;uid=$5;gid=$6;user=$7;group=$8;stat=$9;etime=$10;pcpu=$11;pmem=$12;rss=$13;vsz=$14;tty=$15;comm=$16;$1=$2=$3=$4=$5=$6=$7=$8=$9=$10=$11=$12=$13=$14=$15=$16=\"\";sub(/^ +/,\"\",$0);args=$0;gsub(/\\t/,\" \",args); print pid,ppid,pgid,sid,uid,gid,user,group,stat,etime,pcpu,pmem,rss,vsz,tty,comm,args}'",
  ].join("\n");
}

function BuildProcessPidFallbackShellCommand(): string {
  return [
    "# __PROXMOX_PROCESS_PID_FALLBACK__",
    "for proc_dir in /proc/[0-9]*; do",
    "  [ -d \"$proc_dir\" ] || continue",
    "  proc_pid=\"${proc_dir#/proc/}\"",
    "  printf '%s\\n' \"$proc_pid\"",
    "done",
  ].join("\n");
}

function BuildProcessProcDetailsShellCommand(params: {
  pid_list: number[];
  include_environment: boolean;
  include_threads: boolean;
  max_environment_bytes_per_process: number;
}): string {
  const pid_list_segment = params.pid_list.map((pid) => String(pid)).join(" ");
  const include_threads_value = params.include_threads ? "1" : "0";
  const include_environment_value = params.include_environment ? "1" : "0";
  return [
    "# __PROXMOX_PROCESS_PROC_DETAILS__",
    `for proc_pid in ${pid_list_segment}; do`,
    "  proc_path=\"/proc/${proc_pid}\"",
    "  if [ ! -d \"$proc_path\" ]; then",
    "    printf '__ERR__\\t%s\\t%s\\n' \"$proc_pid\" 'missing_proc_entry'",
    "    continue",
    "  fi",
    "  uid_value=\"$(awk '/^Uid:/{print $2; exit}' \"$proc_path/status\" 2>/dev/null)\"",
    "  gid_value=\"$(awk '/^Gid:/{print $2; exit}' \"$proc_path/status\" 2>/dev/null)\"",
    `  thread_count_value=\"$( [ \"${include_threads_value}\" = \"1\" ] && awk '/^Threads:/{print $2; exit}' \"$proc_path/status\" 2>/dev/null || printf '' )\"`,
    "  fd_count_value=\"$(ls -1 \"$proc_path/fd\" 2>/dev/null | wc -l | tr -d ' ')\"",
    "  comm_value=\"$(cat \"$proc_path/comm\" 2>/dev/null | tr '\\t\\r\\n' '   ')\"",
    "  cmdline_value=\"$(tr '\\0' ' ' < \"$proc_path/cmdline\" 2>/dev/null | tr '\\t\\r\\n' '   ')\"",
    "  exe_value=\"$(readlink \"$proc_path/exe\" 2>/dev/null | tr '\\t\\r\\n' '   ')\"",
    "  cwd_value=\"$(readlink \"$proc_path/cwd\" 2>/dev/null | tr '\\t\\r\\n' '   ')\"",
    "  root_value=\"$(readlink \"$proc_path/root\" 2>/dev/null | tr '\\t\\r\\n' '   ')\"",
    "  state_value=\"$(awk '/^State:/{print $2; exit}' \"$proc_path/status\" 2>/dev/null)\"",
    "  rss_value=\"$(awk '/^VmRSS:/{print $2; exit}' \"$proc_path/status\" 2>/dev/null)\"",
    "  vsz_value=\"$(awk '/^VmSize:/{print $2; exit}' \"$proc_path/status\" 2>/dev/null)\"",
    "  user_name_value=\"$(awk -F: -v uid=\"$uid_value\" '($3==uid){print $1; exit}' /etc/passwd 2>/dev/null)\"",
    "  group_name_value=\"$(awk -F: -v gid=\"$gid_value\" '($3==gid){print $1; exit}' /etc/group 2>/dev/null)\"",
    "  start_time_value=\"$(awk '{print $22}' \"$proc_path/stat\" 2>/dev/null)\"",
    "  printf '__PROC__\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$proc_pid\" \"$uid_value\" \"$gid_value\" \"$thread_count_value\" \"$fd_count_value\" \"$comm_value\" \"$cmdline_value\" \"$exe_value\" \"$cwd_value\" \"$root_value\" \"$state_value\" \"$rss_value\" \"$vsz_value\" \"$user_name_value\" \"$group_name_value\" \"$start_time_value\"",
    `  if [ "${include_environment_value}" = "1" ] && [ -r "$proc_path/environ" ]; then`,
    `    env_value=\"$(tr '\\0' '\\n' < \"$proc_path/environ\" 2>/dev/null | head -c ${params.max_environment_bytes_per_process} | tr '\\n' '\\r' | sed 's/\\r/__ENV_NL__/g')\"`,
    "    printf '__ENV__\\t%s\\t%s\\n' \"$proc_pid\" \"$env_value\"",
    "  fi",
    "done",
  ].join("\n");
}

function ParseOptionalInteger(raw_value: string | undefined): number | undefined {
  if (raw_value === undefined) {
    return undefined;
  }
  const normalized = raw_value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

function ParseOptionalNumber(raw_value: string | undefined): number | undefined {
  if (raw_value === undefined) {
    return undefined;
  }
  const normalized = raw_value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function MapProcessState(raw_state_value: string | undefined): proxmox_lxc_process_state_t {
  const normalized = (raw_state_value ?? "").trim().toUpperCase();
  const state_char = normalized.charAt(0);
  if (state_char === "R") {
    return "running";
  }
  if (state_char === "S") {
    return "sleeping";
  }
  if (state_char === "D") {
    return "disk_sleep";
  }
  if (state_char === "T") {
    return "stopped";
  }
  if (state_char === "Z") {
    return "zombie";
  }
  if (state_char === "I") {
    return "idle";
  }
  if (state_char === "X") {
    return "dead";
  }
  if (state_char === "K") {
    return "wakekill";
  }
  if (state_char === "W") {
    return "waking";
  }
  if (state_char === "P") {
    return "parked";
  }
  return "unknown";
}

function BuildProcessSummary(processes: proxmox_lxc_process_record_t[]): {
  total_process_count: number;
  state_counts: Record<string, number>;
  user_counts: Record<string, number>;
  top_cpu_pids: number[];
  top_memory_pids: number[];
} {
  const state_counts: Record<string, number> = {};
  const user_counts: Record<string, number> = {};
  for (const process_record of processes) {
    state_counts[process_record.state] = (state_counts[process_record.state] ?? 0) + 1;
    const user_key = process_record.username ?? String(process_record.uid ?? "unknown");
    user_counts[user_key] = (user_counts[user_key] ?? 0) + 1;
  }
  const top_cpu_pids = [...processes]
    .sort((left_process, right_process) => (right_process.cpu_percent ?? -1) - (left_process.cpu_percent ?? -1))
    .slice(0, 5)
    .map((process_record) => process_record.pid);
  const top_memory_pids = [...processes]
    .sort((left_process, right_process) => (right_process.rss_kb ?? -1) - (left_process.rss_kb ?? -1))
    .slice(0, 5)
    .map((process_record) => process_record.pid);
  return {
    total_process_count: processes.length,
    state_counts,
    user_counts,
    top_cpu_pids,
    top_memory_pids,
  };
}

function IsSensitiveEnvironmentKey(environment_key: string): boolean {
  const normalized_key = environment_key.toLowerCase();
  const sensitive_fragments = [
    "token",
    "password",
    "passwd",
    "secret",
    "apikey",
    "api_key",
    "private",
    "credential",
    "cookie",
    "session",
    "auth",
  ];
  return sensitive_fragments.some((fragment) => normalized_key.includes(fragment));
}

function NormalizeRunCommandInput(params: proxmox_lxc_run_command_input_i): {
  command_argv: string[];
  shell_mode: boolean;
  shell_command?: string;
  env?: Record<string, string>;
  cwd?: string;
  user?: string;
  stdin_text?: string;
  timeout_ms?: number;
  max_output_bytes?: number;
  fail_on_non_zero_exit?: boolean;
  retry_allowed?: boolean;
} {
  const command_argv = params.command_argv ?? [];
  const shell_mode = params.shell_mode === true;
  const shell_command = params.shell_command?.trim();
  if (shell_mode && (!shell_command || shell_command.length === 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "shell_command is required when shell_mode is true.",
      details: {
        field: "shell_command",
      },
    });
  }
  if (!shell_mode && command_argv.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "command_argv must contain at least one command token.",
      details: {
        field: "command_argv",
      },
    });
  }
  const normalized_env = ValidateCommandEnvironment(params.env);
  const cwd = params.cwd?.trim();
  const user = params.user?.trim();
  if (params.max_output_bytes !== undefined && (!Number.isFinite(params.max_output_bytes) || params.max_output_bytes <= 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "max_output_bytes must be a positive number when provided.",
      details: {
        field: "max_output_bytes",
      },
    });
  }
  return {
    command_argv,
    shell_mode,
    shell_command,
    env: normalized_env,
    cwd: cwd?.length ? cwd : undefined,
    user: user?.length ? user : undefined,
    stdin_text: params.stdin_text,
    timeout_ms: params.timeout_ms,
    max_output_bytes: params.max_output_bytes,
    fail_on_non_zero_exit: params.fail_on_non_zero_exit,
    retry_allowed: params.retry_allowed,
  };
}

function NormalizeTerminalOpenInput(params: proxmox_lxc_terminal_open_input_i): {
  command_argv: string[];
  shell_mode: boolean;
  shell_command?: string;
  env?: Record<string, string>;
  cwd?: string;
  user?: string;
  columns: number;
  rows: number;
  timeout_ms?: number;
  retry_allowed?: boolean;
} {
  const command_argv = params.command_argv ?? [];
  const shell_mode = params.shell_mode === true;
  const shell_command = params.shell_command?.trim();
  if (!shell_mode && command_argv.length === 0) {
    command_argv.push("/bin/sh", "-il");
  }
  if (shell_mode && (!shell_command || shell_command.length === 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "shell_command is required when shell_mode is true.",
      details: {
        field: "shell_command",
      },
    });
  }
  const columns = params.columns ?? 120;
  const rows = params.rows ?? 30;
  ValidateTerminalSize({
    columns,
    rows,
  });
  const normalized_env = ValidateCommandEnvironment(params.env);
  return {
    command_argv,
    shell_mode,
    shell_command,
    env: normalized_env,
    cwd: params.cwd?.trim(),
    user: params.user?.trim(),
    columns,
    rows,
    timeout_ms: params.timeout_ms,
    retry_allowed: params.retry_allowed,
  };
}

function NormalizeUploadFileInput(params: proxmox_lxc_upload_file_input_i): {
  source_file_path: string;
  target_file_path: string;
  owner_user?: string;
  owner_group?: string;
  mode_octal?: string;
  create_parent_directories: boolean;
  overwrite: boolean;
  verify_checksum: boolean;
  timeout_ms: number;
  chunk_size_bytes: number;
  high_water_mark_bytes: number;
} {
  const source_file_path = ValidateSourceFilePath(params.source_file_path);
  const target_file_path = ValidateTargetFilePath(params.target_file_path);
  const owner_user = ValidateOptionalOwnerName({
    raw_owner: params.owner_user,
    field_name: "owner_user",
  });
  const owner_group = ValidateOptionalOwnerName({
    raw_owner: params.owner_group,
    field_name: "owner_group",
  });
  const mode_octal = ValidateOptionalModeOctal(params.mode_octal);
  const create_parent_directories = params.create_parent_directories === true;
  const overwrite = params.overwrite !== false;
  const verify_checksum = params.verify_checksum === true;
  const timeout_ms = ValidatePositiveInteger({
    raw_value: params.timeout_ms ?? 120000,
    field_name: "timeout_ms",
    minimum: 1000,
    maximum: 600000,
  });
  const chunk_size_bytes = ValidatePositiveInteger({
    raw_value: params.chunk_size_bytes ?? 256 * 1024,
    field_name: "chunk_size_bytes",
    minimum: 16 * 1024,
    maximum: 8 * 1024 * 1024,
  });
  const high_water_mark_bytes = ValidatePositiveInteger({
    raw_value: params.high_water_mark_bytes ?? 256 * 1024,
    field_name: "high_water_mark_bytes",
    minimum: 16 * 1024,
    maximum: 8 * 1024 * 1024,
  });

  return {
    source_file_path,
    target_file_path,
    owner_user,
    owner_group,
    mode_octal,
    create_parent_directories,
    overwrite,
    verify_checksum,
    timeout_ms,
    chunk_size_bytes,
    high_water_mark_bytes,
  };
}

function NormalizeUploadDirectoryInput(params: proxmox_lxc_upload_directory_input_i): {
  source_directory_path: string;
  target_directory_path: string;
  create_parent_directories: boolean;
  overwrite: boolean;
  verify_checksum: boolean;
  timeout_ms: number;
  chunk_size_bytes: number;
  high_water_mark_bytes: number;
  include_patterns?: string[];
  exclude_patterns?: string[];
  pattern_mode: proxmox_lxc_upload_directory_pattern_mode_t;
  symlink_policy: proxmox_lxc_upload_directory_symlink_policy_t;
  include_hidden: boolean;
} {
  const source_directory_path = ValidateSourceDirectoryPath(params.source_directory_path);
  const target_directory_path = ValidateTargetFilePath(params.target_directory_path);
  const create_parent_directories = params.create_parent_directories !== false;
  const overwrite = params.overwrite !== false;
  const verify_checksum = params.verify_checksum === true;
  const timeout_ms = ValidatePositiveInteger({
    raw_value: params.timeout_ms ?? 300000,
    field_name: "timeout_ms",
    minimum: 1000,
    maximum: 1800000,
  });
  const chunk_size_bytes = ValidatePositiveInteger({
    raw_value: params.chunk_size_bytes ?? 256 * 1024,
    field_name: "chunk_size_bytes",
    minimum: 16 * 1024,
    maximum: 8 * 1024 * 1024,
  });
  const high_water_mark_bytes = ValidatePositiveInteger({
    raw_value: params.high_water_mark_bytes ?? 256 * 1024,
    field_name: "high_water_mark_bytes",
    minimum: 16 * 1024,
    maximum: 8 * 1024 * 1024,
  });
  const include_patterns = ValidatePatternList({
    raw_patterns: params.include_patterns,
    field_name: "include_patterns",
    pattern_mode: params.pattern_mode ?? "regex",
  });
  const exclude_patterns = ValidatePatternList({
    raw_patterns: params.exclude_patterns,
    field_name: "exclude_patterns",
    pattern_mode: params.pattern_mode ?? "regex",
  });
  const pattern_mode = ValidateDirectoryPatternMode(params.pattern_mode);
  const symlink_policy = ValidateSymlinkPolicy(params.symlink_policy);
  const include_hidden = params.include_hidden !== false;

  return {
    source_directory_path,
    target_directory_path,
    create_parent_directories,
    overwrite,
    verify_checksum,
    timeout_ms,
    chunk_size_bytes,
    high_water_mark_bytes,
    include_patterns,
    exclude_patterns,
    pattern_mode,
    symlink_policy,
    include_hidden,
  };
}

function ValidateSourceFilePath(raw_source_file_path: string): string {
  const normalized = raw_source_file_path.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "source_file_path is required.",
      details: {
        field: "source_file_path",
      },
    });
  }
  if (normalized.includes("\0")) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "source_file_path contains invalid null-byte character.",
      details: {
        field: "source_file_path",
      },
    });
  }
  return normalized;
}

function ValidateSourceDirectoryPath(raw_source_directory_path: string): string {
  const normalized = raw_source_directory_path.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "source_directory_path is required.",
      details: {
        field: "source_directory_path",
      },
    });
  }
  if (normalized.includes("\0")) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "source_directory_path contains invalid null-byte character.",
      details: {
        field: "source_directory_path",
      },
    });
  }
  return normalized;
}

function ValidateTargetFilePath(raw_target_file_path: string): string {
  const normalized = raw_target_file_path.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "target_file_path is required.",
      details: {
        field: "target_file_path",
      },
    });
  }
  if (!normalized.startsWith("/")) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "target_file_path must be an absolute path.",
      details: {
        field: "target_file_path",
      },
    });
  }
  if (normalized.includes("\0")) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "target_file_path contains invalid null-byte character.",
      details: {
        field: "target_file_path",
      },
    });
  }
  const path_segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (path_segments.includes("..")) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "target_file_path must not contain parent path traversal segments.",
      details: {
        field: "target_file_path",
      },
    });
  }
  const disallowed_prefixes = ["/proc/", "/sys/", "/dev/"];
  for (const disallowed_prefix of disallowed_prefixes) {
    if (normalized === disallowed_prefix.slice(0, -1) || normalized.startsWith(disallowed_prefix)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "target_file_path points to a restricted filesystem path.",
        details: {
          field: "target_file_path",
        },
      });
    }
  }
  return normalized;
}

function ValidatePatternList(params: {
  raw_patterns: string[] | undefined;
  field_name: string;
  pattern_mode: proxmox_lxc_upload_directory_pattern_mode_t;
}): string[] | undefined {
  if (params.raw_patterns === undefined) {
    return undefined;
  }
  if (!Array.isArray(params.raw_patterns)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be an array of regex pattern strings.`,
      details: {
        field: params.field_name,
      },
    });
  }
  const normalized_patterns: string[] = [];
  for (const raw_pattern of params.raw_patterns) {
    if (typeof raw_pattern !== "string") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `${params.field_name} entries must be strings.`,
        details: {
          field: params.field_name,
        },
      });
    }
    const normalized_pattern = raw_pattern.trim();
    if (normalized_pattern.length === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `${params.field_name} entries cannot be empty.`,
        details: {
          field: params.field_name,
        },
      });
    }
    if (params.pattern_mode === "regex") {
      try {
        // Validate syntax only; matcher compilation happens in backend.
        new RegExp(normalized_pattern);
      } catch {
        throw new ProxmoxValidationError({
          code: "proxmox.validation.invalid_input",
          message: `${params.field_name} contains an invalid regex pattern.`,
          details: {
            field: params.field_name,
            value: normalized_pattern,
          },
        });
      }
    }
    if (params.pattern_mode === "glob") {
      if (normalized_pattern.includes("\0")) {
        throw new ProxmoxValidationError({
          code: "proxmox.validation.invalid_input",
          message: `${params.field_name} contains invalid null-byte characters.`,
          details: {
            field: params.field_name,
            value: normalized_pattern,
          },
        });
      }
    }
    normalized_patterns.push(normalized_pattern);
  }
  return normalized_patterns.length > 0 ? normalized_patterns : undefined;
}

function ValidateDirectoryPatternMode(
  raw_pattern_mode: proxmox_lxc_upload_directory_pattern_mode_t | undefined,
): proxmox_lxc_upload_directory_pattern_mode_t {
  const pattern_mode = raw_pattern_mode ?? "regex";
  if (pattern_mode !== "regex" && pattern_mode !== "glob") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "pattern_mode must be regex or glob.",
      details: {
        field: "pattern_mode",
        value: String(raw_pattern_mode),
      },
    });
  }
  return pattern_mode;
}

function ValidateSymlinkPolicy(
  raw_symlink_policy: proxmox_lxc_upload_directory_symlink_policy_t | undefined,
): proxmox_lxc_upload_directory_symlink_policy_t {
  const symlink_policy = raw_symlink_policy ?? "skip";
  if (
    symlink_policy !== "skip"
    && symlink_policy !== "dereference"
    && symlink_policy !== "preserve"
  ) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "symlink_policy must be skip, dereference, or preserve.",
      details: {
        field: "symlink_policy",
        value: String(raw_symlink_policy),
      },
    });
  }
  return symlink_policy;
}

function ValidateOptionalOwnerName(params: {
  raw_owner: string | undefined;
  field_name: string;
}): string | undefined {
  if (params.raw_owner === undefined) {
    return undefined;
  }
  const normalized = params.raw_owner.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} cannot be empty when provided.`,
      details: {
        field: params.field_name,
      },
    });
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} contains unsupported characters.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized;
}

function ValidateOptionalModeOctal(raw_mode_octal: string | undefined): string | undefined {
  if (raw_mode_octal === undefined) {
    return undefined;
  }
  const normalized = raw_mode_octal.trim();
  if (!/^[0-7]{3,4}$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "mode_octal must be a 3 or 4 digit octal value.",
      details: {
        field: "mode_octal",
      },
    });
  }
  return normalized;
}

function ValidatePositiveInteger(params: {
  raw_value: number;
  field_name: string;
  minimum: number;
  maximum: number;
}): number {
  if (
    !Number.isInteger(params.raw_value)
    || params.raw_value < params.minimum
    || params.raw_value > params.maximum
  ) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be an integer between ${params.minimum} and ${params.maximum}.`,
      details: {
        field: params.field_name,
        value: String(params.raw_value),
      },
    });
  }
  return params.raw_value;
}

function ValidateTerminalSize(params: {
  columns: number;
  rows: number;
}): void {
  if (!Number.isInteger(params.columns) || params.columns < 20 || params.columns > 500) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "columns must be an integer between 20 and 500.",
      details: {
        field: "columns",
      },
    });
  }
  if (!Number.isInteger(params.rows) || params.rows < 10 || params.rows > 300) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "rows must be an integer between 10 and 300.",
      details: {
        field: "rows",
      },
    });
  }
}

function ValidateCommandEnvironment(raw_env?: Record<string, string>): Record<string, string> | undefined {
  if (raw_env === undefined) {
    return undefined;
  }
  const normalized_env: Record<string, string> = {};
  for (const env_key of Object.keys(raw_env)) {
    const normalized_key = env_key.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized_key)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `Invalid env key: ${env_key}`,
        details: {
          field: "env",
          value: env_key,
        },
      });
    }
    const env_value = String(raw_env[env_key] ?? "");
    normalized_env[normalized_key] = env_value;
  }
  return normalized_env;
}

function BuildContainerCommand(params: {
  command_argv: string[];
  shell_mode: boolean;
  shell_command?: string;
  env?: Record<string, string>;
  cwd?: string;
  user?: string;
}): string {
  let command = params.shell_mode
    ? params.shell_command!
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

function ShouldSendInitialTerminalCommand(params: {
  shell_mode: boolean;
  command_argv?: string[];
}): boolean {
  if (params.shell_mode) {
    return true;
  }
  return Array.isArray(params.command_argv) && params.command_argv.length > 0;
}

function ShellEscapeToken(raw_token: string): string {
  const token = String(raw_token);
  return `'${token.replace(/'/g, `'\"'\"'`)}'`;
}

function ShouldUseSshShellBackend(node_connection: proxmox_node_connection_i): boolean {
  return node_connection.shell_backend === "ssh_pct" && node_connection.ssh_shell !== undefined;
}
