import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createReadStream, readFileSync, Dirent } from "node:fs";
import { lstat, mkdtemp, readdir, readlink, realpath, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Client, ConnectConfig, ClientChannel, SFTPWrapper } from "ssh2";
import { proxmox_auth_t, proxmox_ssh_shell_t } from "../../types/proxmox_config_types";
import { proxmox_node_connection_i } from "../request/proxmox_request_client";
import {
  ProxmoxCommandExitError,
  ProxmoxCommandTimeoutError,
  ProxmoxLxcUploadError,
  ProxmoxSshShellError,
  ProxmoxValidationError,
} from "../../errors/proxmox_error";
import {
  proxmox_lxc_run_command_result_t,
  proxmox_lxc_upload_directory_failed_entry_t,
  proxmox_lxc_upload_directory_result_t,
  proxmox_lxc_upload_file_result_t,
  proxmox_lxc_terminal_event_t,
  proxmox_lxc_terminal_session_t,
} from "../../types/proxmox_service_types";
import {
  proxmox_lxc_shell_backend_command_input_i,
  proxmox_lxc_shell_backend_i,
  proxmox_lxc_shell_backend_open_input_i,
  proxmox_lxc_shell_backend_upload_directory_input_i,
  proxmox_lxc_shell_backend_upload_input_i,
} from "./lxc_shell_backend";
import { ResolveSopsToken } from "../auth/sops_token_resolver";
import { ResolveVaultToken } from "../auth/vault_token_resolver";

interface ssh_interactive_session_runtime_i {
  client: Client;
  channel: ClientChannel;
  session: proxmox_lxc_terminal_session_t;
  events: proxmox_lxc_terminal_event_t[];
  close_promise: Promise<void>;
  close_resolve: () => void;
  close_event_recorded: boolean;
}

interface proxmox_directory_upload_manifest_record_i {
  relative_paths: string[];
  files_uploaded: number;
  directories_created: number;
  bytes_uploaded: number;
  skipped_count: number;
  failed_count: number;
  failed_entries: proxmox_lxc_upload_directory_failed_entry_t[];
}

const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
const DEFAULT_COMMAND_TIMEOUT_MS = 60000;
const DEFAULT_IDLE_TIMEOUT_MS = 180000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_UPLOAD_COMMAND_OUTPUT_BYTES = 64 * 1024;

export class SshPctLxcShellBackend implements proxmox_lxc_shell_backend_i {
  private readonly interactive_sessions: Map<string, ssh_interactive_session_runtime_i>;

  constructor() {
    this.interactive_sessions = new Map<string, ssh_interactive_session_runtime_i>();
  }

  public async runCommand(params: {
    node_connection: proxmox_node_connection_i;
    command_input: proxmox_lxc_shell_backend_command_input_i;
  }): Promise<proxmox_lxc_run_command_result_t> {
    const ssh_shell = ResolveSshShellConfig(params.node_connection);
    const started_at_epoch_ms = Date.now();
    const command_preview = BuildSafeCommandPreview({
      command_argv: params.command_input.command_argv,
      shell_mode: params.command_input.shell_mode,
      shell_command: params.command_input.shell_command,
    });
    const command_timeout_ms = params.command_input.timeout_ms ?? ssh_shell.command_timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const max_output_bytes = params.command_input.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    const shell_command = BuildContainerCommand(params.command_input);
    const wrapped_shell_command = `/bin/sh -lc ${ShellEscapeToken(shell_command)}`;
    const execute_command = `pct exec ${ShellEscapeToken(params.command_input.container_id)} -- ${wrapped_shell_command}`;

    const client = await ConnectSshClient({
      node_connection: params.node_connection,
      ssh_shell,
    });
    let timed_out = false;
    try {
      const command_result = await ExecuteSshCommand({
        client,
        command: execute_command,
        timeout_ms: command_timeout_ms,
        max_output_bytes,
        stdin_text: params.command_input.stdin_text,
        pty: false,
      });
      timed_out = command_result.timed_out;
      const finished_at_epoch_ms = Date.now();
      const result: proxmox_lxc_run_command_result_t = {
        session_id: BuildSshSessionId({
          node_id: params.command_input.node_id,
          container_id: params.command_input.container_id,
        }),
        node_id: params.command_input.node_id,
        container_id: params.command_input.container_id,
        command: command_preview,
        execution_mode: "ssh_pct",
        started_at: new Date(started_at_epoch_ms).toISOString(),
        finished_at: new Date(finished_at_epoch_ms).toISOString(),
        duration_ms: finished_at_epoch_ms - started_at_epoch_ms,
        succeeded: command_result.exit_code === 0,
        timed_out,
        exit_code: command_result.exit_code,
        stdout: command_result.stdout,
        stderr: command_result.stderr,
        combined_output: `${command_result.stdout}${command_result.stderr}`,
        truncated_output: command_result.truncated_output,
        handshake: {
          backend: "ssh_pct",
          transport: "ssh",
          task_id: undefined,
          user: ssh_shell.username,
          endpoint: `ssh://${params.node_connection.host}:${ssh_shell.port ?? 22}`,
        },
      };
      if (
        result.exit_code !== undefined
        && result.exit_code !== 0
        && params.command_input.fail_on_non_zero_exit !== false
      ) {
        throw new ProxmoxCommandExitError({
          code: "proxmox.lxc.command_non_zero_exit",
          message: `LXC command exited with status ${result.exit_code}.`,
          details: {
            field: "run_command.exit_code",
            value: String(result.exit_code),
          },
        });
      }
      return result;
    } finally {
      if (timed_out) {
        try {
          client.destroy();
        } catch {
          // no-op
        }
      } else {
        try {
          client.end();
        } catch {
          // no-op
        }
      }
    }
  }

  public async uploadFile(params: {
    node_connection: proxmox_node_connection_i;
    upload_input: proxmox_lxc_shell_backend_upload_input_i;
  }): Promise<proxmox_lxc_upload_file_result_t> {
    const ssh_shell = ResolveSshShellConfig(params.node_connection);
    const phase_started_epoch_ms = Date.now();
    const source_file_stat = await ResolveLocalUploadSourceStat({
      source_file_path: params.upload_input.source_file_path,
    });
    const started_at_epoch_ms = Date.now();
    let transfer_duration_ms = 0;
    let checksum_duration_ms = 0;
    let temporary_node_file_path: string | undefined;
    let source_checksum: string | undefined;
    let target_checksum: string | undefined;

    const client = await ConnectSshClient({
      node_connection: params.node_connection,
      ssh_shell,
    });
    try {
      temporary_node_file_path = await CreateNodeTempFile({
        client,
        timeout_ms: params.upload_input.timeout_ms,
      });

      const transfer_started_epoch_ms = Date.now();
      await StreamLocalFileToNode({
        client,
        source_file_path: params.upload_input.source_file_path,
        destination_file_path: temporary_node_file_path,
        timeout_ms: params.upload_input.timeout_ms,
        chunk_size_bytes: params.upload_input.chunk_size_bytes,
        high_water_mark_bytes: params.upload_input.high_water_mark_bytes,
      });
      transfer_duration_ms = Math.max(1, Date.now() - transfer_started_epoch_ms);

      if (params.upload_input.create_parent_directories) {
        await ExecuteRequiredUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `mkdir -p -- $(dirname -- ${ShellEscapeToken(params.upload_input.target_file_path)})`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
          error_code: "proxmox.lxc.upload_push_failed",
          error_message: "Could not create parent directory inside container before upload.",
          details_field: "upload_file.create_parent_directories",
        });
      }

      if (!params.upload_input.overwrite) {
        const exists_result = await ExecuteUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `test -e -- ${ShellEscapeToken(params.upload_input.target_file_path)}`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
        });
        if (exists_result.exit_code === 0) {
          throw new ProxmoxLxcUploadError({
            code: "proxmox.lxc.upload_conflict",
            message: "Target file already exists and overwrite is disabled.",
            details: {
              field: "target_file_path",
              value: params.upload_input.target_file_path,
            },
          });
        }
        if (exists_result.exit_code !== 1) {
          throw BuildUploadCommandFailure({
            error_code: "proxmox.lxc.upload_push_failed",
            error_message: "Could not check target file existence inside container.",
            details_field: "upload_file.overwrite",
            command_result: exists_result,
          });
        }
      }

      await ExecuteRequiredUploadCommand({
        client,
        command: BuildPctPushCommand({
          container_id: params.upload_input.container_id,
          source_path: temporary_node_file_path,
          target_path: params.upload_input.target_file_path,
        }),
        timeout_ms: params.upload_input.timeout_ms,
        error_code: "proxmox.lxc.upload_push_failed",
        error_message: "pct push failed while uploading file to container.",
        details_field: "upload_file.pct_push",
      });

      if (params.upload_input.mode_octal !== undefined) {
        await ExecuteRequiredUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `chmod ${ShellEscapeToken(params.upload_input.mode_octal)} -- ${ShellEscapeToken(params.upload_input.target_file_path)}`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
          error_code: "proxmox.lxc.upload_push_failed",
          error_message: "Could not apply file mode after upload.",
          details_field: "upload_file.mode_octal",
        });
      }

      const ownership_target = BuildOwnershipTarget({
        owner_user: params.upload_input.owner_user,
        owner_group: params.upload_input.owner_group,
      });
      if (ownership_target !== undefined) {
        await ExecuteRequiredUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `chown ${ShellEscapeToken(ownership_target)} -- ${ShellEscapeToken(params.upload_input.target_file_path)}`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
          error_code: "proxmox.lxc.upload_push_failed",
          error_message: "Could not apply owner/group after upload.",
          details_field: "upload_file.owner",
        });
      }

      if (params.upload_input.verify_checksum) {
        const checksum_started_epoch_ms = Date.now();
        source_checksum = await ComputeLocalSha256({
          source_file_path: params.upload_input.source_file_path,
        });
        const checksum_result = await ExecuteRequiredUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `sha256sum -- ${ShellEscapeToken(params.upload_input.target_file_path)} | cut -d ' ' -f1`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
          error_code: "proxmox.lxc.upload_push_failed",
          error_message: "Could not compute uploaded file checksum inside container.",
          details_field: "upload_file.verify_checksum",
        });
        target_checksum = ParseSha256FromOutput(checksum_result.stdout);
        if (!target_checksum || source_checksum !== target_checksum) {
          throw new ProxmoxLxcUploadError({
            code: "proxmox.lxc.upload_checksum_mismatch",
            message: "Uploaded file checksum did not match source checksum.",
            details: {
              field: "upload_file.verify_checksum",
            },
          });
        }
        checksum_duration_ms = Math.max(1, Date.now() - checksum_started_epoch_ms);
      }

      const finished_at_epoch_ms = Date.now();
      const elapsed_ms = Math.max(1, finished_at_epoch_ms - started_at_epoch_ms);
      const throughput_bytes_per_sec = Math.floor((source_file_stat.size * 1000) / elapsed_ms);
      const total_duration_ms = Math.max(1, finished_at_epoch_ms - phase_started_epoch_ms);
      return {
        session_id: BuildSshUploadSessionId({
          node_id: params.upload_input.node_id,
          container_id: params.upload_input.container_id,
          target_file_path: params.upload_input.target_file_path,
        }),
        node_id: params.upload_input.node_id,
        container_id: params.upload_input.container_id,
        source_file_path: params.upload_input.source_file_path,
        target_file_path: params.upload_input.target_file_path,
        bytes_uploaded: source_file_stat.size,
        elapsed_ms,
        throughput_bytes_per_sec,
        overwrite: params.upload_input.overwrite,
        verify_checksum: params.upload_input.verify_checksum,
        checksum_source: source_checksum,
        checksum_target: target_checksum,
        retries: 0,
        truncated: false,
        started_at: new Date(started_at_epoch_ms).toISOString(),
        finished_at: new Date(finished_at_epoch_ms).toISOString(),
        metrics: {
          logical_bytes_uploaded: source_file_stat.size,
          wire_bytes_uploaded: source_file_stat.size,
          logical_throughput_bytes_per_sec: throughput_bytes_per_sec,
          wire_throughput_bytes_per_sec: throughput_bytes_per_sec,
          phase_timings: {
            prepare_ms: Math.max(1, started_at_epoch_ms - phase_started_epoch_ms),
            manifest_ms: 0,
            archive_ms: 0,
            transfer_ms: transfer_duration_ms,
            extract_ms: 0,
            checksum_ms: checksum_duration_ms,
            total_ms: total_duration_ms,
          },
        },
        handshake: {
          backend: "ssh_pct",
          transport: "ssh",
          task_id: undefined,
          user: ssh_shell.username,
          endpoint: `ssh://${params.node_connection.host}:${ssh_shell.port ?? 22}`,
        },
      };
    } catch (error) {
      throw MapUploadError({
        error,
        timeout_ms: params.upload_input.timeout_ms,
      });
    } finally {
      if (temporary_node_file_path) {
        try {
          await ExecuteUploadCommand({
            client,
            command: `/bin/sh -lc ${ShellEscapeToken(`rm -f -- ${ShellEscapeToken(temporary_node_file_path)}`)}`,
            timeout_ms: Math.min(params.upload_input.timeout_ms, 10000),
          });
        } catch {
          // no-op
        }
      }
      try {
        client.end();
      } catch {
        // no-op
      }
    }
  }

  public async uploadDirectory(params: {
    node_connection: proxmox_node_connection_i;
    upload_input: proxmox_lxc_shell_backend_upload_directory_input_i;
  }): Promise<proxmox_lxc_upload_directory_result_t> {
    const ssh_shell = ResolveSshShellConfig(params.node_connection);
    const phase_started_epoch_ms = Date.now();
    const source_directory_stat = await ResolveLocalUploadDirectoryStat({
      source_directory_path: params.upload_input.source_directory_path,
    });
    const manifest_started_epoch_ms = Date.now();
    const manifest = await BuildDirectoryUploadManifest({
      source_directory_path: params.upload_input.source_directory_path,
      include_patterns: params.upload_input.include_patterns,
      exclude_patterns: params.upload_input.exclude_patterns,
      pattern_mode: params.upload_input.pattern_mode,
      symlink_policy: params.upload_input.symlink_policy,
      include_hidden: params.upload_input.include_hidden,
    });
    const manifest_duration_ms = Math.max(1, Date.now() - manifest_started_epoch_ms);
    const started_at_epoch_ms = Date.now();
    let archive_duration_ms = 0;
    let transfer_duration_ms = 0;
    let extract_duration_ms = 0;
    let checksum_duration_ms = 0;
    let wire_bytes_uploaded = 0;
    let local_temp_directory_path: string | undefined;
    let local_archive_path: string | undefined;
    let temporary_node_archive_path: string | undefined;
    let temporary_container_archive_path: string | undefined;
    let source_checksum: string | undefined;
    let target_checksum: string | undefined;

    const client = await ConnectSshClient({
      node_connection: params.node_connection,
      ssh_shell,
    });
    try {
      if (!params.upload_input.overwrite) {
        const exists_result = await ExecuteUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `test -e -- ${ShellEscapeToken(params.upload_input.target_directory_path)}`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
        });
        if (exists_result.exit_code === 0) {
          throw new ProxmoxLxcUploadError({
            code: "proxmox.lxc.upload_conflict",
            message: "Target directory already exists and overwrite is disabled.",
            details: {
              field: "target_directory_path",
              value: params.upload_input.target_directory_path,
            },
          });
        }
        if (exists_result.exit_code !== 1) {
          throw BuildUploadCommandFailure({
            error_code: "proxmox.lxc.upload_push_failed",
            error_message: "Could not check target directory existence inside container.",
            details_field: "upload_directory.overwrite",
            command_result: exists_result,
          });
        }
      }

      if (params.upload_input.create_parent_directories) {
        await ExecuteRequiredUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `mkdir -p -- ${ShellEscapeToken(params.upload_input.target_directory_path)}`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
          error_code: "proxmox.lxc.upload_push_failed",
          error_message: "Could not create target directory inside container before directory upload.",
          details_field: "upload_directory.target_directory_path",
        });
      }

      if (manifest.relative_paths.length === 0) {
        const finished_at_epoch_ms = Date.now();
        const elapsed_ms = Math.max(1, finished_at_epoch_ms - started_at_epoch_ms);
        const total_duration_ms = Math.max(1, finished_at_epoch_ms - phase_started_epoch_ms);
        return {
          session_id: BuildSshUploadDirectorySessionId({
            node_id: params.upload_input.node_id,
            container_id: params.upload_input.container_id,
            target_directory_path: params.upload_input.target_directory_path,
          }),
          node_id: params.upload_input.node_id,
          container_id: params.upload_input.container_id,
          source_directory_path: params.upload_input.source_directory_path,
          target_directory_path: params.upload_input.target_directory_path,
          files_uploaded: 0,
          directories_created: source_directory_stat.is_directory ? 1 : 0,
          bytes_uploaded: 0,
          elapsed_ms,
          throughput_bytes_per_sec: 0,
          skipped_count: manifest.skipped_count,
          failed_count: manifest.failed_count,
          checksum_verified_count: 0,
          overwrite: params.upload_input.overwrite,
          verify_checksum: params.upload_input.verify_checksum,
          checksum_source: undefined,
          checksum_target: undefined,
          retries: 0,
          truncated: false,
          started_at: new Date(started_at_epoch_ms).toISOString(),
          finished_at: new Date(finished_at_epoch_ms).toISOString(),
          failed_entries: manifest.failed_entries,
          metrics: {
            logical_bytes_uploaded: manifest.bytes_uploaded,
            wire_bytes_uploaded,
            logical_throughput_bytes_per_sec: Math.floor((manifest.bytes_uploaded * 1000) / elapsed_ms),
            wire_throughput_bytes_per_sec: 0,
            phase_timings: {
              prepare_ms: Math.max(1, started_at_epoch_ms - phase_started_epoch_ms),
              manifest_ms: manifest_duration_ms,
              archive_ms: archive_duration_ms,
              transfer_ms: transfer_duration_ms,
              extract_ms: extract_duration_ms,
              checksum_ms: checksum_duration_ms,
              total_ms: total_duration_ms,
            },
          },
          handshake: {
            backend: "ssh_pct",
            transport: "ssh",
            task_id: undefined,
            user: ssh_shell.username,
            endpoint: `ssh://${params.node_connection.host}:${ssh_shell.port ?? 22}`,
          },
        };
      }

      local_temp_directory_path = await mkdtemp(
        path.join(tmpdir(), "proxmoxlib-upload-directory-"),
      );
      local_archive_path = path.join(local_temp_directory_path, "payload.tar");
      const archive_started_epoch_ms = Date.now();
      await CreateTarArchiveFromManifest({
        source_directory_path: params.upload_input.source_directory_path,
        archive_file_path: local_archive_path,
        relative_paths: manifest.relative_paths,
        symlink_policy: params.upload_input.symlink_policy,
        timeout_ms: params.upload_input.timeout_ms,
      });
      archive_duration_ms = Math.max(1, Date.now() - archive_started_epoch_ms);
      const local_archive_stat = await stat(local_archive_path);
      wire_bytes_uploaded = local_archive_stat.size;

      temporary_node_archive_path = await CreateNodeTempFile({
        client,
        timeout_ms: params.upload_input.timeout_ms,
      });
      const transfer_started_epoch_ms = Date.now();
      await StreamLocalFileToNode({
        client,
        source_file_path: local_archive_path,
        destination_file_path: temporary_node_archive_path,
        timeout_ms: params.upload_input.timeout_ms,
        chunk_size_bytes: params.upload_input.chunk_size_bytes,
        high_water_mark_bytes: params.upload_input.high_water_mark_bytes,
      });
      transfer_duration_ms = Math.max(1, Date.now() - transfer_started_epoch_ms);

      temporary_container_archive_path =
        `/tmp/proxmoxlib-upload-dir-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.tar`;
      await ExecuteRequiredUploadCommand({
        client,
        command: BuildPctPushCommand({
          container_id: params.upload_input.container_id,
          source_path: temporary_node_archive_path,
          target_path: temporary_container_archive_path,
        }),
        timeout_ms: params.upload_input.timeout_ms,
        error_code: "proxmox.lxc.upload_push_failed",
        error_message: "Failed to push directory archive into container temporary path.",
        details_field: "upload_directory.pct_push_archive",
      });

      if (params.upload_input.verify_checksum) {
        const checksum_started_epoch_ms = Date.now();
        source_checksum = await ComputeLocalSha256({
          source_file_path: local_archive_path,
        });
        const checksum_result = await ExecuteRequiredUploadCommand({
          client,
          command: BuildPctExecShellCommand({
            container_id: params.upload_input.container_id,
            shell_command: `sha256sum -- ${ShellEscapeToken(temporary_container_archive_path)} | cut -d ' ' -f1`,
          }),
          timeout_ms: params.upload_input.timeout_ms,
          error_code: "proxmox.lxc.upload_push_failed",
          error_message: "Could not compute uploaded directory archive checksum inside container.",
          details_field: "upload_directory.verify_checksum",
        });
        target_checksum = ParseSha256FromOutput(checksum_result.stdout);
        if (!target_checksum || source_checksum !== target_checksum) {
          throw new ProxmoxLxcUploadError({
            code: "proxmox.lxc.upload_checksum_mismatch",
            message: "Uploaded directory archive checksum did not match source checksum.",
            details: {
              field: "upload_directory.verify_checksum",
            },
          });
        }
        checksum_duration_ms = Math.max(1, Date.now() - checksum_started_epoch_ms);
      }

      const extract_started_epoch_ms = Date.now();
      await ExecuteRequiredUploadCommand({
        client,
        command: BuildPctExecShellCommand({
          container_id: params.upload_input.container_id,
          shell_command: `tar -xpf ${ShellEscapeToken(temporary_container_archive_path)} -C ${ShellEscapeToken(params.upload_input.target_directory_path)}`,
        }),
        timeout_ms: params.upload_input.timeout_ms,
        error_code: "proxmox.lxc.upload_push_failed",
        error_message: "Failed to extract uploaded directory archive inside container.",
        details_field: "upload_directory.extract",
      });
      extract_duration_ms = Math.max(1, Date.now() - extract_started_epoch_ms);

      const finished_at_epoch_ms = Date.now();
      const elapsed_ms = Math.max(1, finished_at_epoch_ms - started_at_epoch_ms);
      const throughput_bytes_per_sec = Math.floor((local_archive_stat.size * 1000) / elapsed_ms);
      const logical_throughput_bytes_per_sec = Math.floor((manifest.bytes_uploaded * 1000) / elapsed_ms);
      const total_duration_ms = Math.max(1, finished_at_epoch_ms - phase_started_epoch_ms);
      return {
        session_id: BuildSshUploadDirectorySessionId({
          node_id: params.upload_input.node_id,
          container_id: params.upload_input.container_id,
          target_directory_path: params.upload_input.target_directory_path,
        }),
        node_id: params.upload_input.node_id,
        container_id: params.upload_input.container_id,
        source_directory_path: params.upload_input.source_directory_path,
        target_directory_path: params.upload_input.target_directory_path,
        files_uploaded: manifest.files_uploaded,
        directories_created: manifest.directories_created,
        bytes_uploaded: manifest.bytes_uploaded,
        elapsed_ms,
        throughput_bytes_per_sec,
        skipped_count: manifest.skipped_count,
        failed_count: manifest.failed_count,
        checksum_verified_count: params.upload_input.verify_checksum ? manifest.files_uploaded : 0,
        overwrite: params.upload_input.overwrite,
        verify_checksum: params.upload_input.verify_checksum,
        checksum_source: source_checksum,
        checksum_target: target_checksum,
        retries: 0,
        truncated: false,
        started_at: new Date(started_at_epoch_ms).toISOString(),
        finished_at: new Date(finished_at_epoch_ms).toISOString(),
        failed_entries: manifest.failed_entries,
        metrics: {
          logical_bytes_uploaded: manifest.bytes_uploaded,
          wire_bytes_uploaded,
          logical_throughput_bytes_per_sec,
          wire_throughput_bytes_per_sec: throughput_bytes_per_sec,
          phase_timings: {
            prepare_ms: Math.max(1, started_at_epoch_ms - phase_started_epoch_ms),
            manifest_ms: manifest_duration_ms,
            archive_ms: archive_duration_ms,
            transfer_ms: transfer_duration_ms,
            extract_ms: extract_duration_ms,
            checksum_ms: checksum_duration_ms,
            total_ms: total_duration_ms,
          },
        },
        handshake: {
          backend: "ssh_pct",
          transport: "ssh",
          task_id: undefined,
          user: ssh_shell.username,
          endpoint: `ssh://${params.node_connection.host}:${ssh_shell.port ?? 22}`,
        },
      };
    } catch (error) {
      throw MapUploadDirectoryError({
        error,
        timeout_ms: params.upload_input.timeout_ms,
      });
    } finally {
      if (temporary_container_archive_path) {
        try {
          await ExecuteUploadCommand({
            client,
            command: BuildPctExecShellCommand({
              container_id: params.upload_input.container_id,
              shell_command: `rm -f -- ${ShellEscapeToken(temporary_container_archive_path)}`,
            }),
            timeout_ms: Math.min(params.upload_input.timeout_ms, 10000),
          });
        } catch {
          // no-op
        }
      }
      if (temporary_node_archive_path) {
        try {
          await ExecuteUploadCommand({
            client,
            command: `/bin/sh -lc ${ShellEscapeToken(`rm -f -- ${ShellEscapeToken(temporary_node_archive_path)}`)}`,
            timeout_ms: Math.min(params.upload_input.timeout_ms, 10000),
          });
        } catch {
          // no-op
        }
      }
      try {
        client.end();
      } catch {
        // no-op
      }
      if (local_temp_directory_path !== undefined) {
        try {
          await rm(local_temp_directory_path, {
            recursive: true,
            force: true,
          });
        } catch {
          // no-op
        }
      }
    }
  }

  public async openInteractiveSession(params: {
    node_connection: proxmox_node_connection_i;
    session_input: proxmox_lxc_shell_backend_open_input_i;
  }): Promise<proxmox_lxc_terminal_session_t> {
    const ssh_shell = ResolveSshShellConfig(params.node_connection);
    const client = await ConnectSshClient({
      node_connection: params.node_connection,
      ssh_shell,
    });
    const session_id = BuildSshSessionId({
      node_id: params.session_input.node_id,
      container_id: params.session_input.container_id,
    });
    const session: proxmox_lxc_terminal_session_t = {
      session_id,
      node_id: params.session_input.node_id,
      container_id: params.session_input.container_id,
      command: params.session_input.command,
      columns: params.session_input.columns,
      rows: params.session_input.rows,
      opened_at: new Date().toISOString(),
      status: "opening",
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        task_id: undefined,
        user: ssh_shell.username,
        endpoint: `ssh://${params.node_connection.host}:${ssh_shell.port ?? 22}`,
      },
    };
    const events: proxmox_lxc_terminal_event_t[] = [];
    let close_resolve: () => void = (): void => undefined;
    const close_promise = new Promise<void>((resolve) => {
      close_resolve = resolve;
    });

    const channel = await OpenSshPtySession({
      client,
      command: `pct exec ${ShellEscapeToken(params.session_input.container_id)} -- /bin/sh -il`,
      columns: params.session_input.columns,
      rows: params.session_input.rows,
      timeout_ms: params.session_input.timeout_ms ?? ssh_shell.connect_timeout_ms ?? DEFAULT_CONNECT_TIMEOUT_MS,
    });

    const append_event = (event: proxmox_lxc_terminal_event_t): void => {
      events.push(event);
    };
    append_event({
      session_id,
      event_type: "open",
      timestamp_iso: new Date().toISOString(),
    });
    session.status = "open";

    channel.on("data", (chunk: Buffer | string) => {
      append_event({
        session_id,
        event_type: "output",
        output_chunk: NormalizeChunk(chunk),
        timestamp_iso: new Date().toISOString(),
      });
    });
    channel.stderr.on("data", (chunk: Buffer | string) => {
      append_event({
        session_id,
        event_type: "output",
        output_chunk: NormalizeChunk(chunk),
        timestamp_iso: new Date().toISOString(),
      });
    });
    channel.on("error", (error: Error) => {
      session.status = "error";
      append_event({
        session_id,
        event_type: "error",
        error_message: error.message,
        timestamp_iso: new Date().toISOString(),
      });
    });
    channel.on("close", () => {
      if (session.status !== "error") {
        session.status = "closed";
      }
      session.closed_at = new Date().toISOString();
      const runtime = this.interactive_sessions.get(session_id);
      if (runtime && !runtime.close_event_recorded) {
        runtime.close_event_recorded = true;
        append_event({
          session_id,
          event_type: "close",
          close_code: 1000,
          close_reason: "ssh_channel_closed",
          timestamp_iso: session.closed_at,
        });
      }
      close_resolve();
      client.end();
    });
    client.on("error", (error: Error) => {
      if (session.status === "closed") {
        return;
      }
      session.status = "error";
      append_event({
        session_id,
        event_type: "error",
        error_message: error.message,
        timestamp_iso: new Date().toISOString(),
      });
    });
    client.on("close", () => {
      if (session.status === "closed") {
        return;
      }
      session.status = "closed";
      session.closed_at = new Date().toISOString();
      const runtime = this.interactive_sessions.get(session_id);
      if (runtime && !runtime.close_event_recorded) {
        runtime.close_event_recorded = true;
        append_event({
          session_id,
          event_type: "close",
          close_code: 1000,
          close_reason: "ssh_connection_closed",
          timestamp_iso: session.closed_at,
        });
      }
      close_resolve();
    });

    this.interactive_sessions.set(session_id, {
      client,
      channel,
      session,
      events,
      close_promise,
      close_resolve,
      close_event_recorded: false,
    });
    return { ...session };
  }

  public async sendInput(params: {
    session_id: string;
    input_text: string;
  }): Promise<void> {
    const runtime = this.resolveInteractiveRuntime(params.session_id);
    const normalized_input_text = NormalizeInteractiveInputText(params.input_text);
    await new Promise<void>((resolve, reject) => {
      runtime.channel.write(normalized_input_text, (error?: Error | null) => {
        if (error) {
          reject(new ProxmoxSshShellError({
            code: "proxmox.ssh.session_io_failed",
            message: "Failed to write to SSH interactive session.",
            details: {
              field: "ssh.channel.write",
              value: params.session_id,
            },
            cause: error,
          }));
          return;
        }
        resolve();
      });
    });
  }

  public async resize(params: {
    session_id: string;
    columns: number;
    rows: number;
  }): Promise<void> {
    const runtime = this.resolveInteractiveRuntime(params.session_id);
    runtime.channel.setWindow(params.rows, params.columns, 0, 0);
    runtime.session.columns = params.columns;
    runtime.session.rows = params.rows;
  }

  public async readEvents(params: {
    session_id: string;
    max_events?: number;
  }): Promise<proxmox_lxc_terminal_event_t[]> {
    const runtime = this.resolveInteractiveRuntime(params.session_id);
    const max_events = params.max_events === undefined
      ? runtime.events.length
      : Math.max(0, Math.floor(params.max_events));
    if (max_events === 0) {
      return [];
    }
    const selected_events = runtime.events.slice(0, max_events);
    runtime.events.splice(0, selected_events.length);
    return selected_events;
  }

  public async close(params: {
    session_id: string;
    reason?: string;
    code?: number;
  }): Promise<void> {
    const runtime = this.resolveInteractiveRuntime(params.session_id);
    const close_reason = params.reason ?? "client_requested_close";
    try {
      runtime.channel.end("exit\n");
      runtime.channel.close();
    } catch {
      // no-op
    }
    const closed_at = runtime.session.closed_at ?? new Date().toISOString();
    runtime.session.status = "closed";
    runtime.session.closed_at = closed_at;
    if (!runtime.close_event_recorded) {
      runtime.close_event_recorded = true;
      runtime.events.push({
        session_id: params.session_id,
        event_type: "close",
        close_code: params.code ?? 1000,
        close_reason,
        timestamp_iso: closed_at,
      });
    }
    runtime.close_resolve();
    runtime.client.end();
    this.interactive_sessions.delete(params.session_id);
    await Promise.resolve(runtime.close_promise);
  }

  public getSession(params: { session_id: string }): proxmox_lxc_terminal_session_t | undefined {
    const runtime = this.interactive_sessions.get(params.session_id);
    if (!runtime) {
      return undefined;
    }
    return { ...runtime.session };
  }

  public ownsSession(session_id: string): boolean {
    return this.interactive_sessions.has(session_id);
  }

  private resolveInteractiveRuntime(session_id: string): ssh_interactive_session_runtime_i {
    const runtime = this.interactive_sessions.get(session_id);
    if (!runtime) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "SSH interactive session was not found.",
        details: {
          field: "session_id",
          value: session_id,
        },
      });
    }
    return runtime;
  }
}

async function ConnectSshClient(params: {
  node_connection: proxmox_node_connection_i;
  ssh_shell: proxmox_ssh_shell_t;
}): Promise<Client> {
  const connect_config = await BuildConnectConfig(params);
  const client = new Client();
  return new Promise<Client>((resolve, reject) => {
    let resolved = false;
    client.on("ready", () => {
      resolved = true;
      resolve(client);
    });
    client.on("error", (error: Error) => {
      if (resolved) {
        return;
      }
      reject(MapSshConnectError(error));
    });
    client.on("close", () => {
      if (!resolved) {
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.connection_failed",
          message: "SSH connection closed before becoming ready.",
          details: {
            field: "ssh.connection",
            value: params.node_connection.node_id,
          },
        }));
      }
    });
    client.connect(connect_config);
  });
}

async function OpenSshPtySession(params: {
  client: Client;
  command: string;
  columns: number;
  rows: number;
  timeout_ms: number;
}): Promise<ClientChannel> {
  return new Promise<ClientChannel>((resolve, reject) => {
    let timed_out = false;
    const timeout_handle = setTimeout(() => {
      timed_out = true;
      reject(new ProxmoxSshShellError({
        code: "proxmox.ssh.session_open_failed",
        message: "Timed out while opening SSH PTY session.",
        details: {
          field: "ssh.exec.timeout_ms",
          value: String(params.timeout_ms),
        },
      }));
    }, Math.max(250, params.timeout_ms));
    params.client.exec(params.command, {
      pty: {
        cols: params.columns,
        rows: params.rows,
        term: "xterm-256color",
      },
    }, (error, channel) => {
      if (timed_out) {
        return;
      }
      clearTimeout(timeout_handle);
      if (error) {
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.session_open_failed",
          message: "Failed to open SSH PTY session.",
          details: {
            field: "ssh.exec",
          },
          cause: error,
        }));
        return;
      }
      resolve(channel);
    });
  });
}

async function ExecuteSshCommand(params: {
  client: Client;
  command: string;
  timeout_ms: number;
  max_output_bytes: number;
  stdin_text?: string;
  pty: boolean;
}): Promise<{
  stdout: string;
  stderr: string;
  exit_code?: number;
  truncated_output: boolean;
  timed_out: boolean;
}> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let exit_code: number | undefined;
    let truncated_output = false;
    let resolved = false;
    let timed_out = false;
    const timeout_handle = setTimeout(() => {
      timed_out = true;
      reject(new ProxmoxCommandTimeoutError({
        code: "proxmox.lxc.command_timeout",
        message: "SSH command timed out.",
        details: {
          field: "ssh.command.timeout_ms",
          value: String(params.timeout_ms),
        },
      }));
    }, Math.max(250, params.timeout_ms));

    const on_exec = (error: Error | undefined, channel: ClientChannel): void => {
      if (error) {
        clearTimeout(timeout_handle);
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.session_open_failed",
          message: "SSH command channel could not be opened.",
          details: {
            field: "ssh.exec",
          },
          cause: error,
        }));
        return;
      }

      const append_chunk = (target: "stdout" | "stderr", chunk: Buffer | string): void => {
        const chunk_text = NormalizeChunk(chunk);
        if (!chunk_text) {
          return;
        }
        const current_total = stdout.length + stderr.length;
        if (current_total >= params.max_output_bytes) {
          truncated_output = true;
          return;
        }
        const remaining = params.max_output_bytes - current_total;
        const selected_chunk = chunk_text.length > remaining
          ? chunk_text.slice(0, remaining)
          : chunk_text;
        if (selected_chunk.length < chunk_text.length) {
          truncated_output = true;
        }
        if (target === "stdout") {
          stdout += selected_chunk;
          return;
        }
        stderr += selected_chunk;
      };

      channel.on("data", (chunk: Buffer | string) => {
        append_chunk("stdout", chunk);
      });
      channel.stderr.on("data", (chunk: Buffer | string) => {
        append_chunk("stderr", chunk);
      });
      channel.on("exit", (code: number | null) => {
        if (typeof code === "number") {
          exit_code = code;
        }
      });
      channel.on("close", () => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout_handle);
        resolve({
          stdout,
          stderr,
          exit_code,
          truncated_output,
          timed_out,
        });
      });
      channel.on("error", (channel_error: Error) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout_handle);
        reject(new ProxmoxSshShellError({
          code: "proxmox.ssh.session_io_failed",
          message: "SSH command channel reported an I/O error.",
          details: {
            field: "ssh.channel",
          },
          cause: channel_error,
        }));
      });

      if (params.stdin_text !== undefined && params.stdin_text.length > 0) {
        channel.write(params.stdin_text);
      }
      channel.end();
    };
    if (params.pty) {
      params.client.exec(params.command, {
        pty: {
          cols: 120,
          rows: 30,
          term: "xterm-256color",
        },
      }, on_exec);
      return;
    }
    params.client.exec(params.command, on_exec);
  });
}

async function BuildConnectConfig(params: {
  node_connection: proxmox_node_connection_i;
  ssh_shell: proxmox_ssh_shell_t;
}): Promise<ConnectConfig> {
  const host = params.ssh_shell.host ?? params.node_connection.host;
  const port = params.ssh_shell.port ?? 22;
  const username = params.ssh_shell.username;
  const ready_timeout = params.ssh_shell.connect_timeout_ms ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const config: ConnectConfig = {
    host,
    port,
    username,
    readyTimeout: ready_timeout,
    keepaliveInterval: Math.min(30000, params.ssh_shell.idle_timeout_ms ?? DEFAULT_IDLE_TIMEOUT_MS),
    keepaliveCountMax: 3,
  };

  if (params.ssh_shell.password_auth !== undefined) {
    config.password = await ResolveSecretFromAuth(params.ssh_shell.password_auth, "ssh.password_auth");
  }
  if (params.ssh_shell.private_key_auth !== undefined) {
    const private_key = await ResolveSecretFromAuth(params.ssh_shell.private_key_auth, "ssh.private_key_auth");
    config.privateKey = NormalizePrivateKeyValue(private_key);
  }
  if (params.ssh_shell.private_key_passphrase_auth !== undefined) {
    config.passphrase = await ResolveSecretFromAuth(
      params.ssh_shell.private_key_passphrase_auth,
      "ssh.private_key_passphrase_auth",
    );
  }

  const strict_host_key = params.ssh_shell.strict_host_key === true;
  const expected_fingerprint = NormalizeFingerprint(params.ssh_shell.host_fingerprint_sha256);
  if (strict_host_key && expected_fingerprint.length === 0) {
    throw new ProxmoxSshShellError({
      code: "proxmox.ssh.host_verification_failed",
      message: "strict_host_key is enabled but host_fingerprint_sha256 is missing.",
      details: {
        field: "ssh_shell.host_fingerprint_sha256",
        value: params.node_connection.node_id,
      },
    });
  }
  if (expected_fingerprint.length > 0) {
    config.hostHash = "sha256";
    config.hostVerifier = (key_hash: string): boolean => {
      const normalized_remote_hash = NormalizeFingerprint(key_hash);
      const allowed = normalized_remote_hash === expected_fingerprint;
      if (!allowed && strict_host_key) {
        throw new ProxmoxSshShellError({
          code: "proxmox.ssh.host_verification_failed",
          message: "SSH host fingerprint did not match configured fingerprint.",
          details: {
            field: "ssh_shell.host_fingerprint_sha256",
            value: params.node_connection.node_id,
          },
        });
      }
      return allowed || !strict_host_key;
    };
  }

  return config;
}

function ResolveSshShellConfig(node_connection: proxmox_node_connection_i): proxmox_ssh_shell_t {
  if (node_connection.ssh_shell === undefined) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "SSH shell backend is not configured for this node.",
      details: {
        field: "node.ssh_shell",
        value: node_connection.node_id,
      },
    });
  }
  return node_connection.ssh_shell;
}

async function ResolveSecretFromAuth(auth: proxmox_auth_t, field_name: string): Promise<string> {
  if (auth.provider === "env") {
    if (!auth.env_var || auth.env_var.trim().length === 0) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "env auth provider requires env_var for SSH secret.",
        details: {
          field: `${field_name}.env_var`,
        },
      });
    }
    const env_value = process.env[auth.env_var];
    if (!env_value || env_value.trim().length === 0) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "SSH secret env variable was missing or empty.",
        details: {
          field: auth.env_var,
        },
      });
    }
    return env_value;
  }

  if (auth.provider === "file") {
    if (!auth.file_path || auth.file_path.trim().length === 0) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "file auth provider requires file_path for SSH secret.",
        details: {
          field: `${field_name}.file_path`,
        },
      });
    }
    try {
      return readFileSync(auth.file_path, "utf8");
    } catch (error) {
      throw new ProxmoxSshShellError({
        code: "proxmox.ssh.auth_failed",
        message: "Could not read SSH secret file.",
        details: {
          field: auth.file_path,
        },
        cause: error,
      });
    }
  }

  if (auth.provider === "vault") {
    return ResolveVaultToken({
      secret_ref: auth.secret_ref ?? "",
    });
  }

  if (auth.provider === "sops") {
    return ResolveSopsToken({
      secret_ref: auth.secret_ref ?? "",
    });
  }

  throw new ProxmoxSshShellError({
    code: "proxmox.ssh.auth_failed",
    message: "Unsupported SSH auth provider.",
    details: {
      field: `${field_name}.provider`,
      value: String(auth.provider),
    },
  });
}

function BuildContainerCommand(params: proxmox_lxc_shell_backend_command_input_i): string {
  let command = params.shell_mode
    ? (params.shell_command ?? "")
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

function BuildSafeCommandPreview(params: {
  command_argv: string[];
  shell_mode: boolean;
  shell_command?: string;
}): string {
  if (params.shell_mode) {
    return "[shell_command_redacted]";
  }
  return params.command_argv.join(" ");
}

function ShellEscapeToken(raw_token: string): string {
  const token = String(raw_token);
  return `'${token.replace(/'/g, `'\"'\"'`)}'`;
}

function BuildSshSessionId(params: {
  node_id: string;
  container_id: string;
}): string {
  const random_suffix = createHash("sha256")
    .update(`${params.node_id}:${params.container_id}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  return `sshpct:${params.node_id}:${params.container_id}:${random_suffix}`;
}

function BuildSshUploadSessionId(params: {
  node_id: string;
  container_id: string;
  target_file_path: string;
}): string {
  const random_suffix = createHash("sha256")
    .update(`${params.node_id}:${params.container_id}:${params.target_file_path}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  return `sshpct-upload:${params.node_id}:${params.container_id}:${random_suffix}`;
}

function BuildSshUploadDirectorySessionId(params: {
  node_id: string;
  container_id: string;
  target_directory_path: string;
}): string {
  const random_suffix = createHash("sha256")
    .update(`${params.node_id}:${params.container_id}:${params.target_directory_path}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 12);
  return `sshpct-upload-dir:${params.node_id}:${params.container_id}:${random_suffix}`;
}

async function ResolveLocalUploadSourceStat(params: {
  source_file_path: string;
}): Promise<{ size: number }> {
  let source_stat: Awaited<ReturnType<typeof stat>>;
  try {
    source_stat = await stat(params.source_file_path);
  } catch (error) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_source_invalid",
      message: "Source file for upload could not be read.",
      details: {
        field: "source_file_path",
      },
      cause: error,
    });
  }
  if (!source_stat.isFile()) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_source_invalid",
      message: "Source upload path must point to a regular file.",
      details: {
        field: "source_file_path",
      },
    });
  }
  return {
    size: source_stat.size,
  };
}

async function ResolveLocalUploadDirectoryStat(params: {
  source_directory_path: string;
}): Promise<{ is_directory: boolean }> {
  let source_stat: Awaited<ReturnType<typeof stat>>;
  try {
    source_stat = await stat(params.source_directory_path);
  } catch (error) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_directory_source_invalid",
      message: "Source directory for upload could not be read.",
      details: {
        field: "source_directory_path",
      },
      cause: error,
    });
  }
  if (!source_stat.isDirectory()) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_directory_source_invalid",
      message: "Source upload path must point to a directory.",
      details: {
        field: "source_directory_path",
      },
    });
  }
  return {
    is_directory: true,
  };
}

async function BuildDirectoryUploadManifest(params: {
  source_directory_path: string;
  include_patterns?: string[];
  exclude_patterns?: string[];
  pattern_mode: "regex" | "glob";
  symlink_policy: "skip" | "dereference" | "preserve";
  include_hidden: boolean;
}): Promise<proxmox_directory_upload_manifest_record_i> {
  const source_root_real_path = await realpath(params.source_directory_path);
  const include_matchers = BuildPatternMatchers({
    raw_patterns: params.include_patterns,
    pattern_mode: params.pattern_mode,
  });
  const exclude_matchers = BuildPatternMatchers({
    raw_patterns: params.exclude_patterns,
    pattern_mode: params.pattern_mode,
  });
  const manifest: proxmox_directory_upload_manifest_record_i = {
    relative_paths: [],
    files_uploaded: 0,
    directories_created: 0,
    bytes_uploaded: 0,
    skipped_count: 0,
    failed_count: 0,
    failed_entries: [],
  };
  const visited_real_paths = new Set<string>([source_root_real_path]);
  const max_directory_depth = 128;

  const visit_directory = async (params_visit: {
    relative_directory_path: string;
    absolute_directory_path: string;
    depth: number;
  }): Promise<void> => {
    if (params_visit.depth > max_directory_depth) {
      manifest.failed_count += 1;
      manifest.failed_entries.push({
        relative_path: params_visit.relative_directory_path || ".",
        reason: "max_directory_depth_exceeded",
      });
      return;
    }
    let directory_entries: Dirent<string>[];
    try {
      directory_entries = await readdir(params_visit.absolute_directory_path, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch (error) {
      manifest.failed_count += 1;
      manifest.failed_entries.push({
        relative_path: params_visit.relative_directory_path || ".",
        reason: `directory_read_failed:${RenderDirectoryUploadReason(error)}`,
      });
      return;
    }

    for (const directory_entry of directory_entries) {
      const candidate_relative_path = params_visit.relative_directory_path.length === 0
        ? directory_entry.name
        : `${params_visit.relative_directory_path}/${directory_entry.name}`;
      const normalized_relative_path = NormalizeArchiveRelativePath(candidate_relative_path);
      if (!params.include_hidden && HasHiddenPathSegment(normalized_relative_path)) {
        manifest.skipped_count += 1;
        continue;
      }
      const absolute_entry_path = path.join(
        params_visit.absolute_directory_path,
        directory_entry.name,
      );

      if (directory_entry.isDirectory()) {
        if (IsExcludedByMatchers({
          relative_path: normalized_relative_path,
          exclude_matchers,
        })) {
          manifest.skipped_count += 1;
          continue;
        }
        const directory_real_path = await ResolveDirectoryRealPath({
          absolute_directory_path: absolute_entry_path,
          relative_path: normalized_relative_path,
          source_root_real_path,
          manifest,
        });
        if (directory_real_path === undefined) {
          continue;
        }
        if (visited_real_paths.has(directory_real_path)) {
          manifest.failed_count += 1;
          manifest.failed_entries.push({
            relative_path: normalized_relative_path,
            reason: "directory_loop_detected",
          });
          continue;
        }
        visited_real_paths.add(directory_real_path);
        manifest.relative_paths.push(normalized_relative_path);
        manifest.directories_created += 1;
        await visit_directory({
          relative_directory_path: normalized_relative_path,
          absolute_directory_path: absolute_entry_path,
          depth: params_visit.depth + 1,
        });
        continue;
      }

      if (!MatchesPatternSet({
        relative_path: normalized_relative_path,
        include_matchers,
        exclude_matchers,
      })) {
        manifest.skipped_count += 1;
        continue;
      }

      if (directory_entry.isSymbolicLink()) {
        if (params.symlink_policy === "skip") {
          manifest.skipped_count += 1;
          continue;
        }
        const symlink_target = await ReadSymlinkTarget({
          absolute_entry_path,
          relative_path: normalized_relative_path,
          manifest,
        });
        if (symlink_target === undefined) {
          continue;
        }
        if (params.symlink_policy === "preserve") {
          if (!IsSymlinkTargetSafeForPreserve(symlink_target)) {
            manifest.failed_count += 1;
            manifest.failed_entries.push({
              relative_path: normalized_relative_path,
              reason: "symlink_target_unsafe_for_preserve",
            });
            continue;
          }
          manifest.relative_paths.push(normalized_relative_path);
          manifest.files_uploaded += 1;
          continue;
        }
        const dereferenced_real_path = await ResolveSymlinkRealPath({
          absolute_entry_path,
          relative_path: normalized_relative_path,
          source_root_real_path,
          manifest,
        });
        if (dereferenced_real_path === undefined) {
          continue;
        }
        try {
          const dereferenced_stat = await stat(dereferenced_real_path);
          if (dereferenced_stat.isDirectory()) {
            if (visited_real_paths.has(dereferenced_real_path)) {
              manifest.failed_count += 1;
              manifest.failed_entries.push({
                relative_path: normalized_relative_path,
                reason: "symlink_directory_loop_detected",
              });
              continue;
            }
            visited_real_paths.add(dereferenced_real_path);
            manifest.relative_paths.push(normalized_relative_path);
            manifest.directories_created += 1;
            await visit_directory({
              relative_directory_path: normalized_relative_path,
              absolute_directory_path: dereferenced_real_path,
              depth: params_visit.depth + 1,
            });
            continue;
          }
          if (!dereferenced_stat.isFile()) {
            manifest.skipped_count += 1;
            continue;
          }
          manifest.relative_paths.push(normalized_relative_path);
          manifest.files_uploaded += 1;
          manifest.bytes_uploaded += dereferenced_stat.size;
          continue;
        } catch (error) {
          manifest.failed_count += 1;
          manifest.failed_entries.push({
            relative_path: normalized_relative_path,
            reason: `symlink_dereference_failed:${RenderDirectoryUploadReason(error)}`,
          });
          continue;
        }
      }

      if (directory_entry.isFile()) {
        let file_stat: Awaited<ReturnType<typeof lstat>>;
        try {
          file_stat = await lstat(absolute_entry_path);
        } catch (error) {
          manifest.failed_count += 1;
          manifest.failed_entries.push({
            relative_path: normalized_relative_path,
            reason: `file_stat_failed:${RenderDirectoryUploadReason(error)}`,
          });
          continue;
        }
        manifest.relative_paths.push(normalized_relative_path);
        manifest.files_uploaded += 1;
        manifest.bytes_uploaded += file_stat.size;
        continue;
      }

      manifest.skipped_count += 1;
    }
  };

  await visit_directory({
    relative_directory_path: "",
    absolute_directory_path: params.source_directory_path,
    depth: 0,
  });
  return manifest;
}

async function CreateTarArchiveFromManifest(params: {
  source_directory_path: string;
  archive_file_path: string;
  relative_paths: string[];
  symlink_policy: "skip" | "dereference" | "preserve";
  timeout_ms: number;
}): Promise<void> {
  if (params.relative_paths.length === 0) {
    return;
  }
  const tar_arguments = ["--format=posix"];
  if (params.symlink_policy === "dereference") {
    tar_arguments.push("--dereference");
  }
  tar_arguments.push(
    "-cf",
    params.archive_file_path,
    "-C",
    params.source_directory_path,
    "--null",
    "--files-from",
    "-",
  );
  await new Promise<void>((resolve, reject) => {
    const tar_process = spawn("tar", tar_arguments, {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr_excerpt = "";
    const timeout_handle = setTimeout(() => {
      tar_process.kill("SIGKILL");
      reject(new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_timeout",
        message: "Timed out while creating local directory upload archive.",
        details: {
          field: "upload_directory.archive.timeout_ms",
          value: String(params.timeout_ms),
        },
      }));
    }, Math.max(250, params.timeout_ms));
    tar_process.stderr.on("data", (chunk: Buffer | string) => {
      stderr_excerpt += NormalizeChunk(chunk);
      if (stderr_excerpt.length > 320) {
        stderr_excerpt = `${stderr_excerpt.slice(0, 317)}...`;
      }
    });
    tar_process.on("error", (error: Error) => {
      clearTimeout(timeout_handle);
      reject(new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_directory_archive_failed",
        message: "Could not start local tar process for directory upload.",
        details: {
          field: "upload_directory.archive",
        },
        cause: error,
      }));
    });
    tar_process.on("close", (code: number | null) => {
      clearTimeout(timeout_handle);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_directory_archive_failed",
        message: "Local tar process failed while preparing directory upload.",
        details: {
          field: "upload_directory.archive",
          value: BuildCommandExcerpt(stderr_excerpt),
        },
      }));
    });
    for (const relative_path of params.relative_paths) {
      tar_process.stdin.write(`${relative_path}\0`);
    }
    tar_process.stdin.end();
  });
}

async function CreateNodeTempFile(params: {
  client: Client;
  timeout_ms: number;
}): Promise<string> {
  const temp_result = await ExecuteRequiredUploadCommand({
    client: params.client,
    command: "/bin/sh -lc 'umask 077 && mktemp /tmp/proxmoxlib-upload-XXXXXX'",
    timeout_ms: params.timeout_ms,
    error_code: "proxmox.lxc.upload_temp_write_failed",
    error_message: "Could not allocate temporary node file for upload.",
    details_field: "upload_file.node_temp_path",
  });
  const node_temp_path = temp_result.stdout.trim().split(/\s+/)[0];
  if (!node_temp_path || !node_temp_path.startsWith("/")) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_temp_write_failed",
      message: "Upload temporary node file path was invalid.",
      details: {
        field: "upload_file.node_temp_path",
      },
    });
  }
  return node_temp_path;
}

async function StreamLocalFileToNode(params: {
  client: Client;
  source_file_path: string;
  destination_file_path: string;
  timeout_ms: number;
  chunk_size_bytes: number;
  high_water_mark_bytes: number;
}): Promise<void> {
  const sftp_client = await OpenSftpClient({
    client: params.client,
  });
  const source_read_stream = createReadStream(params.source_file_path, {
    highWaterMark: params.chunk_size_bytes,
  });
  const destination_write_stream = sftp_client.createWriteStream(params.destination_file_path, {
    flags: "w",
    mode: 0o600,
    highWaterMark: params.high_water_mark_bytes,
  });

  try {
    await RunPromiseWithTimeout({
      timeout_ms: params.timeout_ms,
      operation_label: "upload_file.stream_transfer",
      promise_factory: async (): Promise<void> => {
        await pipeline(source_read_stream, destination_write_stream);
      },
    });
  } catch (error) {
    source_read_stream.destroy();
    destination_write_stream.destroy();
    throw new ProxmoxLxcUploadError({
      code: error instanceof ProxmoxCommandTimeoutError
        ? "proxmox.lxc.upload_timeout"
        : "proxmox.lxc.upload_transfer_failed",
      message: error instanceof ProxmoxCommandTimeoutError
        ? "Timed out while streaming upload file to node."
        : "Failed while streaming upload file to node.",
      details: {
        field: "upload_file.stream_transfer",
      },
      cause: error,
    });
  } finally {
    try {
      sftp_client.end();
    } catch {
      // no-op
    }
  }
}

async function OpenSftpClient(params: {
  client: Client;
}): Promise<SFTPWrapper> {
  return new Promise<SFTPWrapper>((resolve, reject) => {
    params.client.sftp((error, sftp_client) => {
      if (error || !sftp_client) {
        reject(new ProxmoxLxcUploadError({
          code: "proxmox.lxc.upload_transfer_failed",
          message: "Could not open SFTP client for file upload.",
          details: {
            field: "upload_file.sftp",
          },
          cause: error,
        }));
        return;
      }
      resolve(sftp_client);
    });
  });
}

async function ExecuteUploadCommand(params: {
  client: Client;
  command: string;
  timeout_ms: number;
}): Promise<{
  stdout: string;
  stderr: string;
  exit_code?: number;
}> {
  const result = await ExecuteSshCommand({
    client: params.client,
    command: params.command,
    timeout_ms: params.timeout_ms,
    max_output_bytes: DEFAULT_UPLOAD_COMMAND_OUTPUT_BYTES,
    pty: false,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exit_code,
  };
}

async function ExecuteRequiredUploadCommand(params: {
  client: Client;
  command: string;
  timeout_ms: number;
  error_code:
    | "proxmox.lxc.upload_temp_write_failed"
    | "proxmox.lxc.upload_push_failed";
  error_message: string;
  details_field: string;
}): Promise<{
  stdout: string;
  stderr: string;
  exit_code?: number;
}> {
  const command_result = await ExecuteUploadCommand({
    client: params.client,
    command: params.command,
    timeout_ms: params.timeout_ms,
  });
  if (command_result.exit_code === 0) {
    return command_result;
  }
  throw BuildUploadCommandFailure({
    error_code: params.error_code,
    error_message: params.error_message,
    details_field: params.details_field,
    command_result,
  });
}

function BuildUploadCommandFailure(params: {
  error_code: "proxmox.lxc.upload_temp_write_failed" | "proxmox.lxc.upload_push_failed";
  error_message: string;
  details_field: string;
  command_result: {
    stdout: string;
    stderr: string;
    exit_code?: number;
  };
}): ProxmoxLxcUploadError {
  const effective_error_code = IsPermissionDeniedText(params.command_result.stderr)
    ? "proxmox.lxc.upload_permission_denied"
    : params.error_code;
  return new ProxmoxLxcUploadError({
    code: effective_error_code,
    message: params.error_message,
    details: {
      field: params.details_field,
      value: String(params.command_result.exit_code ?? "unknown"),
    },
    cause: BuildSafeCommandFailureCause(params.command_result),
  });
}

function BuildPctPushCommand(params: {
  container_id: string;
  source_path: string;
  target_path: string;
}): string {
  return `pct push ${ShellEscapeToken(params.container_id)} ${ShellEscapeToken(params.source_path)} ${ShellEscapeToken(params.target_path)}`;
}

function BuildPctExecShellCommand(params: {
  container_id: string;
  shell_command: string;
}): string {
  return `pct exec ${ShellEscapeToken(params.container_id)} -- /bin/sh -lc ${ShellEscapeToken(params.shell_command)}`;
}

function BuildOwnershipTarget(params: {
  owner_user?: string;
  owner_group?: string;
}): string | undefined {
  if (params.owner_user === undefined && params.owner_group === undefined) {
    return undefined;
  }
  if (params.owner_user !== undefined && params.owner_group !== undefined) {
    return `${params.owner_user}:${params.owner_group}`;
  }
  if (params.owner_user !== undefined) {
    return params.owner_user;
  }
  return `:${params.owner_group!}`;
}

async function ComputeLocalSha256(params: {
  source_file_path: string;
}): Promise<string> {
  const digest = createHash("sha256");
  const source_read_stream = createReadStream(params.source_file_path, {
    highWaterMark: 256 * 1024,
  });
  for await (const source_chunk of source_read_stream) {
    digest.update(source_chunk as Buffer);
  }
  return digest.digest("hex");
}

function ParseSha256FromOutput(raw_output: string): string {
  const first_token = raw_output.trim().split(/\s+/)[0] ?? "";
  return /^[a-fA-F0-9]{64}$/.test(first_token) ? first_token.toLowerCase() : "";
}

function BuildPatternMatchers(params: {
  raw_patterns: string[] | undefined;
  pattern_mode: "regex" | "glob";
}): RegExp[] {
  if (params.raw_patterns === undefined || params.raw_patterns.length === 0) {
    return [];
  }
  const matchers: RegExp[] = [];
  for (const raw_pattern of params.raw_patterns) {
    if (params.pattern_mode === "glob") {
      matchers.push(ConvertGlobPatternToRegex(raw_pattern));
      continue;
    }
    matchers.push(new RegExp(raw_pattern));
  }
  return matchers;
}

function ConvertGlobPatternToRegex(raw_pattern: string): RegExp {
  const normalized_pattern = raw_pattern.replace(/\\/g, "/");
  let regex_source = "";
  let index = 0;
  while (index < normalized_pattern.length) {
    const character = normalized_pattern[index];
    if (character === "*") {
      const next_character = normalized_pattern[index + 1];
      if (next_character === "*") {
        regex_source += ".*";
        index += 2;
        continue;
      }
      regex_source += "[^/]*";
      index += 1;
      continue;
    }
    if (character === "?") {
      regex_source += "[^/]";
      index += 1;
      continue;
    }
    if (character === "[") {
      const closing_index = normalized_pattern.indexOf("]", index + 1);
      if (closing_index > index + 1) {
        regex_source += normalized_pattern.slice(index, closing_index + 1);
        index = closing_index + 1;
        continue;
      }
      regex_source += "\\[";
      index += 1;
      continue;
    }
    regex_source += EscapeRegexCharacter(character);
    index += 1;
  }
  return new RegExp(`^${regex_source}$`);
}

function EscapeRegexCharacter(character: string): string {
  const regex_special_characters = "^$.*+?()[]{}|\\";
  if (regex_special_characters.includes(character)) {
    return `\\${character}`;
  }
  return character;
}

function MatchesPatternSet(params: {
  relative_path: string;
  include_matchers: RegExp[];
  exclude_matchers: RegExp[];
}): boolean {
  if (params.include_matchers.length > 0) {
    const matches_include = params.include_matchers.some((matcher) => matcher.test(params.relative_path));
    if (!matches_include) {
      return false;
    }
  }
  const matches_exclude = params.exclude_matchers.some((matcher) => matcher.test(params.relative_path));
  if (matches_exclude) {
    return false;
  }
  return true;
}

function IsExcludedByMatchers(params: {
  relative_path: string;
  exclude_matchers: RegExp[];
}): boolean {
  return params.exclude_matchers.some((matcher) => matcher.test(params.relative_path));
}

function HasHiddenPathSegment(relative_path: string): boolean {
  return relative_path.split("/").some((segment) => segment.startsWith("."));
}

function NormalizeArchiveRelativePath(raw_relative_path: string): string {
  const normalized = raw_relative_path.replace(/\\/g, "/").trim();
  if (normalized.length === 0) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_directory_path_unsafe",
      message: "Directory upload contains an empty relative archive path.",
      details: {
        field: "upload_directory.relative_path",
      },
    });
  }
  if (normalized.startsWith("/") || normalized.includes("\0")) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_directory_path_unsafe",
      message: "Directory upload contains an unsafe relative archive path.",
      details: {
        field: "upload_directory.relative_path",
      },
    });
  }
  const path_segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (
    path_segments.length === 0
    || path_segments.includes(".")
    || path_segments.includes("..")
  ) {
    throw new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_directory_path_unsafe",
      message: "Directory upload contains unsafe relative traversal segments.",
      details: {
        field: "upload_directory.relative_path",
      },
    });
  }
  return path_segments.join("/");
}

function RenderDirectoryUploadReason(error: unknown): string {
  if (error instanceof Error) {
    return BuildCommandExcerpt(error.message);
  }
  return BuildCommandExcerpt(String(error));
}

async function ReadSymlinkTarget(params: {
  absolute_entry_path: string;
  relative_path: string;
  manifest: proxmox_directory_upload_manifest_record_i;
}): Promise<string | undefined> {
  try {
    return await readlink(params.absolute_entry_path, {
      encoding: "utf8",
    });
  } catch (error) {
    params.manifest.failed_count += 1;
    params.manifest.failed_entries.push({
      relative_path: params.relative_path,
      reason: `symlink_read_failed:${RenderDirectoryUploadReason(error)}`,
    });
    return undefined;
  }
}

function IsSymlinkTargetSafeForPreserve(symlink_target: string): boolean {
  const normalized_target = symlink_target.replace(/\\/g, "/").trim();
  if (normalized_target.length === 0) {
    return false;
  }
  if (normalized_target.startsWith("/")) {
    return false;
  }
  const target_segments = normalized_target.split("/").filter((segment) => segment.length > 0);
  if (target_segments.includes("..")) {
    return false;
  }
  return true;
}

async function ResolveSymlinkRealPath(params: {
  absolute_entry_path: string;
  relative_path: string;
  source_root_real_path: string;
  manifest: proxmox_directory_upload_manifest_record_i;
}): Promise<string | undefined> {
  let resolved_real_path: string;
  try {
    resolved_real_path = await realpath(params.absolute_entry_path);
  } catch (error) {
    params.manifest.failed_count += 1;
    params.manifest.failed_entries.push({
      relative_path: params.relative_path,
      reason: `symlink_realpath_failed:${RenderDirectoryUploadReason(error)}`,
    });
    return undefined;
  }
  if (!IsPathWithinRoot({
    candidate_real_path: resolved_real_path,
    root_real_path: params.source_root_real_path,
  })) {
    params.manifest.failed_count += 1;
    params.manifest.failed_entries.push({
      relative_path: params.relative_path,
      reason: "symlink_target_outside_source_root",
    });
    return undefined;
  }
  return resolved_real_path;
}

async function ResolveDirectoryRealPath(params: {
  absolute_directory_path: string;
  relative_path: string;
  source_root_real_path: string;
  manifest: proxmox_directory_upload_manifest_record_i;
}): Promise<string | undefined> {
  let resolved_real_path: string;
  try {
    resolved_real_path = await realpath(params.absolute_directory_path);
  } catch (error) {
    params.manifest.failed_count += 1;
    params.manifest.failed_entries.push({
      relative_path: params.relative_path,
      reason: `directory_realpath_failed:${RenderDirectoryUploadReason(error)}`,
    });
    return undefined;
  }
  if (!IsPathWithinRoot({
    candidate_real_path: resolved_real_path,
    root_real_path: params.source_root_real_path,
  })) {
    params.manifest.failed_count += 1;
    params.manifest.failed_entries.push({
      relative_path: params.relative_path,
      reason: "directory_outside_source_root",
    });
    return undefined;
  }
  return resolved_real_path;
}

function IsPathWithinRoot(params: {
  candidate_real_path: string;
  root_real_path: string;
}): boolean {
  const normalized_root = params.root_real_path.replace(/\/+$/, "");
  const normalized_candidate = params.candidate_real_path.replace(/\/+$/, "");
  return (
    normalized_candidate === normalized_root
    || normalized_candidate.startsWith(`${normalized_root}/`)
  );
}

function BuildSafeCommandFailureCause(params: {
  stdout: string;
  stderr: string;
  exit_code?: number;
}): Record<string, unknown> {
  return {
    exit_code: params.exit_code,
    stderr_excerpt: BuildCommandExcerpt(params.stderr),
    stdout_excerpt: BuildCommandExcerpt(params.stdout),
  };
}

function BuildCommandExcerpt(raw_text: string): string {
  const normalized = raw_text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157)}...`;
}

async function RunPromiseWithTimeout<T>(params: {
  timeout_ms: number;
  operation_label: string;
  promise_factory: () => Promise<T>;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout_handle = setTimeout(() => {
      reject(new ProxmoxCommandTimeoutError({
        code: "proxmox.lxc.command_timeout",
        message: `Timed out while running ${params.operation_label}.`,
        details: {
          field: params.operation_label,
          value: String(params.timeout_ms),
        },
      }));
    }, Math.max(250, params.timeout_ms));
    params.promise_factory()
      .then((result) => {
        clearTimeout(timeout_handle);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout_handle);
        reject(error);
      });
  });
}

function MapUploadError(params: {
  error: unknown;
  timeout_ms: number;
}): ProxmoxLxcUploadError {
  if (params.error instanceof ProxmoxLxcUploadError) {
    return params.error;
  }
  if (params.error instanceof ProxmoxCommandTimeoutError) {
    return new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_timeout",
      message: "LXC upload operation timed out.",
      details: {
        field: "upload_file.timeout_ms",
        value: String(params.timeout_ms),
      },
      cause: params.error,
    });
  }
  if (params.error instanceof ProxmoxSshShellError) {
    const likely_permission_denied = IsPermissionDeniedText(params.error.message);
    return new ProxmoxLxcUploadError({
      code: likely_permission_denied
        ? "proxmox.lxc.upload_permission_denied"
        : "proxmox.lxc.upload_transfer_failed",
      message: likely_permission_denied
        ? "LXC upload failed due to permission denial."
        : "LXC upload failed due to SSH transport error.",
      details: {
        field: "upload_file.ssh",
      },
      cause: params.error,
    });
  }
  return new ProxmoxLxcUploadError({
    code: "proxmox.lxc.upload_transfer_failed",
    message: "Unexpected upload failure occurred.",
    details: {
      field: "upload_file",
    },
    cause: params.error,
  });
}

function MapUploadDirectoryError(params: {
  error: unknown;
  timeout_ms: number;
}): ProxmoxLxcUploadError {
  if (params.error instanceof ProxmoxLxcUploadError) {
    return params.error;
  }
  if (params.error instanceof ProxmoxCommandTimeoutError) {
    return new ProxmoxLxcUploadError({
      code: "proxmox.lxc.upload_timeout",
      message: "LXC directory upload operation timed out.",
      details: {
        field: "upload_directory.timeout_ms",
        value: String(params.timeout_ms),
      },
      cause: params.error,
    });
  }
  if (params.error instanceof ProxmoxSshShellError) {
    const likely_permission_denied = IsPermissionDeniedText(params.error.message);
    return new ProxmoxLxcUploadError({
      code: likely_permission_denied
        ? "proxmox.lxc.upload_permission_denied"
        : "proxmox.lxc.upload_transfer_failed",
      message: likely_permission_denied
        ? "LXC directory upload failed due to permission denial."
        : "LXC directory upload failed due to SSH transport error.",
      details: {
        field: "upload_directory.ssh",
      },
      cause: params.error,
    });
  }
  return new ProxmoxLxcUploadError({
    code: "proxmox.lxc.upload_directory_extract_failed",
    message: "Unexpected directory upload failure occurred.",
    details: {
      field: "upload_directory",
    },
    cause: params.error,
  });
}

function IsPermissionDeniedText(raw_text: string): boolean {
  return raw_text.toLowerCase().includes("permission denied");
}

function NormalizeChunk(chunk: Buffer | string): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  return chunk.toString("utf8");
}

function NormalizeInteractiveInputText(raw_input_text: string): string {
  if (raw_input_text.length === 0) {
    return raw_input_text;
  }
  return raw_input_text.replace(/\r?\n/g, "\r\n");
}

function NormalizePrivateKeyValue(private_key: string): string {
  if (private_key.includes("\n")) {
    return private_key;
  }
  return private_key.replace(/\\n/g, "\n");
}

function NormalizeFingerprint(raw_fingerprint: string | undefined): string {
  if (!raw_fingerprint) {
    return "";
  }
  const trimmed = raw_fingerprint.trim();
  if (trimmed.toLowerCase().startsWith("sha256:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function MapSshConnectError(error: Error): ProxmoxSshShellError {
  const lowered_message = error.message.toLowerCase();
  if (
    lowered_message.includes("all configured authentication methods failed")
    || lowered_message.includes("permission denied")
    || lowered_message.includes("authentication")
  ) {
    return new ProxmoxSshShellError({
      code: "proxmox.ssh.auth_failed",
      message: "SSH authentication failed.",
      details: {
        field: "ssh.auth",
      },
      cause: error,
    });
  }
  if (lowered_message.includes("host verification failed") || lowered_message.includes("host fingerprint")) {
    return new ProxmoxSshShellError({
      code: "proxmox.ssh.host_verification_failed",
      message: "SSH host verification failed.",
      details: {
        field: "ssh.host_verification",
      },
      cause: error,
    });
  }
  return new ProxmoxSshShellError({
    code: "proxmox.ssh.connection_failed",
    message: "SSH connection to node failed.",
    details: {
      field: "ssh.connection",
    },
    cause: error,
  });
}
