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
