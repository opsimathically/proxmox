import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import {
  LoadConfig,
  ProxmoxAuthError,
  ProxmoxClient,
  ProxmoxError,
  ProxmoxHttpError,
  ProxmoxLxcExecError,
  ProxmoxLxcUploadError,
  ProxmoxTimeoutError,
  ProxmoxValidationError,
  ResolveProfile
} from './src/index';

function NormalizeBoolean(raw_value: string | undefined): boolean {
  if (raw_value === undefined) {
    return false;
  }
  const normalized_value = raw_value.trim().toLowerCase();
  return (
    normalized_value === '1' ||
    normalized_value === 'true' ||
    normalized_value === 'yes' ||
    normalized_value === 'on'
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

function ResolveContainerId(raw_value: string | undefined): number {
  const default_container_id = 100;
  const resolved_container_id = ResolveOptionalPositiveInteger({
    raw_value,
    field_name: 'PROXMOX_EXAMPLE_UPLOAD_CONTAINER_ID'
  });
  return resolved_container_id ?? default_container_id;
}

function ResolveNodeRecordId(node_record: {
  node?: string;
  name?: string;
  id?: string;
}): string | undefined {
  if (typeof node_record.node === 'string' && node_record.node.trim().length > 0) {
    return node_record.node;
  }
  if (typeof node_record.name === 'string' && node_record.name.trim().length > 0) {
    return node_record.name;
  }
  if (typeof node_record.id === 'string' && node_record.id.trim().length > 0) {
    return node_record.id;
  }
  return undefined;
}

function RenderUnknown(input: unknown): string {
  if (input instanceof Error) {
    return `${input.name}: ${input.message}`;
  }
  if (typeof input === 'string') {
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
    depth <= 6 &&
    current_error instanceof Error &&
    'cause' in current_error &&
    current_error.cause !== undefined
  ) {
    const cause = current_error.cause;
    console.error(`[example] cause_${depth}=${RenderUnknown(cause)}`);
    current_error = cause;
    depth += 1;
  }
}

async function WriteDeterministicBinaryFile(params: {
  file_path: string;
  total_bytes: number;
  chunk_size_bytes: number;
}): Promise<void> {
  const output_stream = createWriteStream(params.file_path, {
    flags: 'w',
    mode: 0o600
  });
  let bytes_remaining = params.total_bytes;
  let sequence_offset = 0;
  try {
    while (bytes_remaining > 0) {
      const chunk_length = Math.min(params.chunk_size_bytes, bytes_remaining);
      const chunk_buffer = Buffer.allocUnsafe(chunk_length);
      for (let index = 0; index < chunk_length; index += 1) {
        chunk_buffer[index] = (sequence_offset + index) % 251;
      }
      sequence_offset = (sequence_offset + chunk_length) % 251;
      if (!output_stream.write(chunk_buffer)) {
        await once(output_stream, 'drain');
      }
      bytes_remaining -= chunk_length;
    }
    output_stream.end();
    await once(output_stream, 'finish');
  } catch (error) {
    output_stream.destroy();
    throw error;
  }
}

async function CreateDirectorySmokeFixture(params: {
  root_directory_path: string;
  marker_value: string;
}): Promise<{
  marker_relative_path: string;
  symlink_relative_path: string;
  expected_file_count: number;
}> {
  await mkdir(`${params.root_directory_path}/nested/deeper`, {
    recursive: true,
    mode: 0o700
  });
  await writeFile(
    `${params.root_directory_path}/root.txt`,
    `ROOT_FILE_${params.marker_value}\n`,
    {
      encoding: 'utf8',
      mode: 0o600
    }
  );
  await writeFile(
    `${params.root_directory_path}/nested/deeper/marker.txt`,
    `${params.marker_value}\n`,
    {
      encoding: 'utf8',
      mode: 0o600
    }
  );
  await writeFile(
    `${params.root_directory_path}/nested/config.json`,
    `{"marker":"${params.marker_value}","kind":"upload_dir_smoke"}\n`,
    {
      encoding: 'utf8',
      mode: 0o600
    }
  );
  await writeFile(
    `${params.root_directory_path}/nested/deeper/.hidden-smoke`,
    `HIDDEN_${params.marker_value}\n`,
    {
      encoding: 'utf8',
      mode: 0o600
    }
  );
  await symlink(
    '../../root.txt',
    `${params.root_directory_path}/nested/deeper/link_root.txt`
  );
  return {
    marker_relative_path: 'nested/deeper/marker.txt',
    symlink_relative_path: 'nested/deeper/link_root.txt',
    expected_file_count: 4
  };
}

function ParseCsvPatterns(raw_value: string | undefined): string[] | undefined {
  if (raw_value === undefined) {
    return undefined;
  }
  const parsed_values = raw_value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed_values.length > 0 ? parsed_values : undefined;
}

async function Main(): Promise<void> {
  const resolved_config_path =
    '/home/tourist/environment_files/proxmoxlib/proxmoxlib.json';
  const selected_profile_name =
    process.env.PROXMOXLIB_PROFILE?.trim() || undefined;
  const upload_node_id =
    process.env.PROXMOX_EXAMPLE_UPLOAD_NODE_ID?.trim() || 'g75';
  const upload_container_id = ResolveContainerId(
    process.env.PROXMOX_EXAMPLE_UPLOAD_CONTAINER_ID
  );
  const upload_target_file_path =
    process.env.PROXMOX_EXAMPLE_UPLOAD_TARGET_FILE_PATH?.trim() ||
    '/tmp/proxmox-sdk-upload-smoke.txt';
  const upload_verify_checksum =
    process.env.PROXMOX_EXAMPLE_UPLOAD_VERIFY_CHECKSUM === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_VERIFY_CHECKSUM);
  const upload_overwrite =
    process.env.PROXMOX_EXAMPLE_UPLOAD_OVERWRITE === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_OVERWRITE);
  const upload_cleanup_remote = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_UPLOAD_CLEANUP_REMOTE
  );
  const upload_timeout_ms =
    ResolveOptionalPositiveInteger({
      raw_value: process.env.PROXMOX_EXAMPLE_UPLOAD_TIMEOUT_MS,
      field_name: 'PROXMOX_EXAMPLE_UPLOAD_TIMEOUT_MS'
    }) ?? 30000;
  const upload_source_file_override =
    process.env.PROXMOX_EXAMPLE_UPLOAD_SOURCE_FILE_PATH?.trim() || undefined;
  const upload_benchmark_run =
    process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_RUN === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_RUN);
  const upload_benchmark_size_mb =
    ResolveOptionalPositiveInteger({
      raw_value: process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_SIZE_MB,
      field_name: 'PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_SIZE_MB'
    }) ?? 100;
  const upload_benchmark_target_file_path =
    process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_TARGET_FILE_PATH?.trim() ||
    '/tmp/proxmox-sdk-upload-benchmark.bin';
  const upload_benchmark_verify_checksum =
    process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_VERIFY_CHECKSUM === undefined
      ? false
      : NormalizeBoolean(
          process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_VERIFY_CHECKSUM
        );
  const upload_benchmark_overwrite =
    process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_OVERWRITE === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_OVERWRITE);
  const upload_benchmark_cleanup_remote =
    process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_CLEANUP_REMOTE === undefined
      ? true
      : NormalizeBoolean(
          process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_CLEANUP_REMOTE
        );
  const upload_benchmark_timeout_ms =
    ResolveOptionalPositiveInteger({
      raw_value: process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_TIMEOUT_MS,
      field_name: 'PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_TIMEOUT_MS'
    }) ?? 180000;
  const upload_benchmark_chunk_size_bytes = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_CHUNK_SIZE_BYTES,
    field_name: 'PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_CHUNK_SIZE_BYTES'
  });
  const upload_benchmark_high_water_mark_bytes =
    ResolveOptionalPositiveInteger({
      raw_value:
        process.env.PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_HIGH_WATER_MARK_BYTES,
      field_name: 'PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_HIGH_WATER_MARK_BYTES'
    });
  const upload_dir_smoke_run =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_SMOKE_RUN === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_SMOKE_RUN);
  const upload_dir_source_path_override =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_SOURCE_PATH?.trim() || undefined;
  const upload_dir_target_path =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_TARGET_PATH?.trim() ||
    '/tmp/proxmox-sdk-upload-dir-smoke';
  const upload_dir_overwrite =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_OVERWRITE === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_OVERWRITE);
  const upload_dir_verify_checksum =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_VERIFY_CHECKSUM === undefined
      ? false
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_VERIFY_CHECKSUM);
  const upload_dir_cleanup_remote =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_CLEANUP_REMOTE === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_CLEANUP_REMOTE);
  const upload_dir_timeout_ms =
    ResolveOptionalPositiveInteger({
      raw_value: process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_TIMEOUT_MS,
      field_name: 'PROXMOX_EXAMPLE_UPLOAD_DIR_TIMEOUT_MS'
    }) ?? 180000;
  const upload_dir_pattern_mode =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_PATTERN_MODE?.trim().toLowerCase() ===
    'glob'
      ? 'glob'
      : 'regex';
  const upload_dir_symlink_policy_raw =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_SYMLINK_POLICY?.trim().toLowerCase() ||
    'skip';
  const upload_dir_symlink_policy =
    upload_dir_symlink_policy_raw === 'dereference' ||
    upload_dir_symlink_policy_raw === 'preserve'
      ? upload_dir_symlink_policy_raw
      : 'skip';
  const upload_dir_strict_level =
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_STRICT_LEVEL?.trim().toLowerCase() ===
    'strict'
      ? 'strict'
      : 'basic';
  const upload_dir_include_patterns =
    ParseCsvPatterns(process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_INCLUDE_PATTERNS) ||
    (upload_dir_pattern_mode === 'glob'
      ? ['nested/**', 'root.txt']
      : ['^(nested/.*|root\\.txt)$']);
  const upload_dir_exclude_patterns = ParseCsvPatterns(
    process.env.PROXMOX_EXAMPLE_UPLOAD_DIR_EXCLUDE_PATTERNS
  );

  console.info(`[example] config_path=${resolved_config_path}`);
  if (selected_profile_name !== undefined) {
    console.info(`[example] requested_profile=${selected_profile_name}`);
  }

  const config = LoadConfig({ config_path: resolved_config_path });
  const selected_profile = ResolveProfile({
    config,
    profile_name: selected_profile_name
  });
  console.info(`[example] selected_profile=${selected_profile.name}`);

  const proxmox_client = ProxmoxClient.fromPath({
    config_path: resolved_config_path,
    profile_name: selected_profile.name
  });

  console.info(
    `[example] upload_target node=${upload_node_id} container_id=${upload_container_id} target_file_path=${upload_target_file_path} verify_checksum=${upload_verify_checksum} overwrite=${upload_overwrite}`
  );

  const nodes_response = await proxmox_client.node_service.listNodes();
  const target_node_exists = nodes_response.data.some((node_record) => {
    const node_record_id = ResolveNodeRecordId(node_record);
    if (node_record_id === undefined) {
      return false;
    }
    return node_record_id.toLowerCase() === upload_node_id.toLowerCase();
  });
  if (!target_node_exists) {
    throw new Error(`Upload smoke target node not found: ${upload_node_id}`);
  }

  const container_response = await proxmox_client.lxc_service.getContainer({
    node_id: upload_node_id,
    container_id: upload_container_id
  });
  console.info(
    `[example] upload_target_container status=${container_response.data.status ?? 'unknown'} name=${container_response.data.name ?? 'unknown'}`
  );

  const upload_source_file_path =
    upload_source_file_override ??
    `/tmp/proxmox-sdk-upload-smoke-${Date.now()}.txt`;
  const upload_source_generated = upload_source_file_override === undefined;
  const upload_marker = upload_source_generated
    ? `SDK_UPLOAD_SMOKE_OK_${Date.now()}`
    : undefined;

  if (upload_source_generated) {
    await writeFile(upload_source_file_path, `${upload_marker ?? 'SDK_UPLOAD_SMOKE_OK'}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
  }

  try {
    const upload_result = await proxmox_client.lxc_service.uploadFile({
      node_id: upload_node_id,
      container_id: upload_container_id,
      source_file_path: upload_source_file_path,
      target_file_path: upload_target_file_path,
      verify_checksum: upload_verify_checksum,
      overwrite: upload_overwrite,
      create_parent_directories: true,
      timeout_ms: upload_timeout_ms
    });
    console.info(
      `[example] upload_result session_id=${upload_result.session_id} bytes_uploaded=${upload_result.bytes_uploaded} elapsed_ms=${upload_result.elapsed_ms} throughput_bytes_per_sec=${upload_result.throughput_bytes_per_sec} verify_checksum=${upload_result.verify_checksum} target_file_path=${upload_result.target_file_path}`
    );

    const exists_check_result = await proxmox_client.lxc_service.runCommand({
      node_id: upload_node_id,
      container_id: upload_container_id,
      command_argv: ['test', '-f', upload_target_file_path],
      timeout_ms: upload_timeout_ms,
      max_output_bytes: 64 * 1024,
      fail_on_non_zero_exit: false
    });
    const upload_exists = exists_check_result.exit_code === 0;

    let marker_found = false;
    if (upload_marker !== undefined) {
      const marker_check_result = await proxmox_client.lxc_service.runCommand({
        node_id: upload_node_id,
        container_id: upload_container_id,
        command_argv: ['grep', '-F', upload_marker, upload_target_file_path],
        timeout_ms: upload_timeout_ms,
        max_output_bytes: 64 * 1024,
        fail_on_non_zero_exit: false
      });
      marker_found = marker_check_result.exit_code === 0;
    }
    console.info(
      `[example] upload_verify exists=${upload_exists} marker_checked=${upload_marker !== undefined} marker_found=${marker_found}`
    );

    if (!upload_exists) {
      throw new Error(
        `Upload verification failed: file not found at ${upload_target_file_path}`
      );
    }
    if (upload_marker !== undefined && !marker_found) {
      throw new Error(
        `Upload verification failed: marker not found at ${upload_target_file_path}`
      );
    }

    if (upload_cleanup_remote) {
      await proxmox_client.lxc_service.runCommand({
        node_id: upload_node_id,
        container_id: upload_container_id,
        command_argv: ['rm', '-f', upload_target_file_path],
        timeout_ms: upload_timeout_ms,
        max_output_bytes: 64 * 1024,
        fail_on_non_zero_exit: true
      });
      console.info(
        `[example] upload_cleanup_remote removed=true target_file_path=${upload_target_file_path}`
      );
    } else {
      console.info(
        '[example] upload_cleanup_remote skipped reason=PROXMOX_EXAMPLE_UPLOAD_CLEANUP_REMOTE_not_true'
      );
    }

    if (!upload_benchmark_run) {
      console.info(
        '[example] upload_benchmark_skipped reason=PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_RUN_disabled'
      );
    } else {
      const upload_benchmark_total_bytes = upload_benchmark_size_mb * 1024 * 1024;
      const upload_benchmark_source_file_path = `/tmp/proxmox-sdk-upload-benchmark-${Date.now()}.bin`;
      console.info(
        `[example] upload_benchmark_prepare source_file_path=${upload_benchmark_source_file_path} target_file_path=${upload_benchmark_target_file_path} bytes_planned=${upload_benchmark_total_bytes}`
      );
      await WriteDeterministicBinaryFile({
        file_path: upload_benchmark_source_file_path,
        total_bytes: upload_benchmark_total_bytes,
        chunk_size_bytes: upload_benchmark_chunk_size_bytes ?? 1024 * 1024
      });

      try {
        const benchmark_upload_result = await proxmox_client.lxc_service.uploadFile({
          node_id: upload_node_id,
          container_id: upload_container_id,
          source_file_path: upload_benchmark_source_file_path,
          target_file_path: upload_benchmark_target_file_path,
          verify_checksum: upload_benchmark_verify_checksum,
          overwrite: upload_benchmark_overwrite,
          create_parent_directories: true,
          timeout_ms: upload_benchmark_timeout_ms,
          ...(upload_benchmark_chunk_size_bytes === undefined
            ? {}
            : { chunk_size_bytes: upload_benchmark_chunk_size_bytes }),
          ...(upload_benchmark_high_water_mark_bytes === undefined
            ? {}
            : { high_water_mark_bytes: upload_benchmark_high_water_mark_bytes })
        });

        const elapsed_seconds =
          benchmark_upload_result.elapsed_ms > 0
            ? benchmark_upload_result.elapsed_ms / 1000
            : 0;
        const derived_mib_per_sec =
          elapsed_seconds > 0
            ? benchmark_upload_result.bytes_uploaded /
              elapsed_seconds /
              (1024 * 1024)
            : 0;
        const derived_mbps =
          elapsed_seconds > 0
            ? (benchmark_upload_result.bytes_uploaded * 8) /
              elapsed_seconds /
              1_000_000
            : 0;
        console.info(
          `[example] upload_benchmark_result bytes_uploaded=${benchmark_upload_result.bytes_uploaded} elapsed_ms=${benchmark_upload_result.elapsed_ms} throughput_bytes_per_sec=${benchmark_upload_result.throughput_bytes_per_sec} derived_mib_per_sec=${derived_mib_per_sec.toFixed(2)} derived_mbps=${derived_mbps.toFixed(2)} verify_checksum=${benchmark_upload_result.verify_checksum} target_file_path=${benchmark_upload_result.target_file_path}`
        );

        const remote_size_check_result =
          await proxmox_client.lxc_service.runCommand({
            node_id: upload_node_id,
            container_id: upload_container_id,
            command_argv: ['wc', '-c', upload_benchmark_target_file_path],
            timeout_ms: upload_benchmark_timeout_ms,
            max_output_bytes: 64 * 1024,
            fail_on_non_zero_exit: true
          });
        const remote_size_token =
          remote_size_check_result.stdout.trim().split(/\s+/)[0] ?? '';
        const remote_size_bytes = Number.parseInt(remote_size_token, 10);
        const remote_size_valid =
          Number.isInteger(remote_size_bytes) &&
          remote_size_bytes === benchmark_upload_result.bytes_uploaded;
        console.info(
          `[example] upload_benchmark_verify remote_size_bytes=${Number.isInteger(remote_size_bytes) ? remote_size_bytes : 'invalid'} expected_bytes=${benchmark_upload_result.bytes_uploaded} size_match=${remote_size_valid}`
        );
        if (!remote_size_valid) {
          throw new Error(
            `Upload benchmark verification failed: size mismatch at ${upload_benchmark_target_file_path}`
          );
        }

        if (upload_benchmark_cleanup_remote) {
          await proxmox_client.lxc_service.runCommand({
            node_id: upload_node_id,
            container_id: upload_container_id,
            command_argv: ['rm', '-f', upload_benchmark_target_file_path],
            timeout_ms: upload_benchmark_timeout_ms,
            max_output_bytes: 64 * 1024,
            fail_on_non_zero_exit: true
          });
          console.info(
            `[example] upload_benchmark_cleanup_remote removed=true target_file_path=${upload_benchmark_target_file_path}`
          );
        } else {
          console.info(
            '[example] upload_benchmark_cleanup_remote skipped reason=PROXMOX_EXAMPLE_UPLOAD_BENCHMARK_CLEANUP_REMOTE_not_true'
          );
        }
      } finally {
        try {
          await unlink(upload_benchmark_source_file_path);
        } catch {
          console.warn(
            '[example] upload_benchmark_cleanup_local_warning reason=temporary_benchmark_source_unlink_failed'
          );
        }
      }
    }

    if (!upload_dir_smoke_run) {
      console.info(
        '[example] upload_dir_smoke_skipped reason=PROXMOX_EXAMPLE_UPLOAD_DIR_SMOKE_RUN_disabled'
      );
    } else {
      const upload_dir_source_path =
        upload_dir_source_path_override ??
        `/tmp/proxmox-sdk-upload-dir-smoke-${Date.now()}`;
      const upload_dir_source_generated = upload_dir_source_path_override === undefined;
      const upload_dir_marker = `SDK_UPLOAD_DIR_SMOKE_${Date.now()}`;
      let marker_relative_path = 'nested/deeper/marker.txt';
      let symlink_relative_path = 'nested/deeper/link_root.txt';
      let expected_file_count = 0;
      if (upload_dir_source_generated) {
        const fixture_result = await CreateDirectorySmokeFixture({
          root_directory_path: upload_dir_source_path,
          marker_value: upload_dir_marker
        });
        marker_relative_path = fixture_result.marker_relative_path;
        symlink_relative_path = fixture_result.symlink_relative_path;
        expected_file_count = fixture_result.expected_file_count;
      }
      try {
        const upload_dir_result = await proxmox_client.lxc_service.uploadDirectory({
          node_id: upload_node_id,
          container_id: upload_container_id,
          source_directory_path: upload_dir_source_path,
          target_directory_path: upload_dir_target_path,
          overwrite: upload_dir_overwrite,
          verify_checksum: upload_dir_verify_checksum,
          create_parent_directories: true,
          timeout_ms: upload_dir_timeout_ms,
          pattern_mode: upload_dir_pattern_mode,
          include_patterns: upload_dir_include_patterns,
          exclude_patterns: upload_dir_exclude_patterns,
          include_hidden: false,
          symlink_policy: upload_dir_symlink_policy,
          chunk_size_bytes: upload_benchmark_chunk_size_bytes,
          high_water_mark_bytes: upload_benchmark_high_water_mark_bytes
        });
        const upload_dir_metrics_suffix =
          upload_dir_result.metrics === undefined
            ? ''
            : ` logical_bps=${upload_dir_result.metrics.logical_throughput_bytes_per_sec} wire_bps=${upload_dir_result.metrics.wire_throughput_bytes_per_sec} phase_manifest_ms=${upload_dir_result.metrics.phase_timings.manifest_ms} phase_archive_ms=${upload_dir_result.metrics.phase_timings.archive_ms} phase_transfer_ms=${upload_dir_result.metrics.phase_timings.transfer_ms} phase_extract_ms=${upload_dir_result.metrics.phase_timings.extract_ms}`;
        console.info(
          `[example] upload_dir_result session_id=${upload_dir_result.session_id} files_uploaded=${upload_dir_result.files_uploaded} directories_created=${upload_dir_result.directories_created} bytes_uploaded=${upload_dir_result.bytes_uploaded} elapsed_ms=${upload_dir_result.elapsed_ms} throughput_bytes_per_sec=${upload_dir_result.throughput_bytes_per_sec} skipped_count=${upload_dir_result.skipped_count} failed_count=${upload_dir_result.failed_count} verify_checksum=${upload_dir_result.verify_checksum} target_directory_path=${upload_dir_result.target_directory_path} pattern_mode=${upload_dir_pattern_mode} symlink_policy=${upload_dir_symlink_policy}${upload_dir_metrics_suffix}`
        );

        const marker_target_path = `${upload_dir_target_path.replace(/\/+$/, '')}/${marker_relative_path}`;
        const marker_check_result = await proxmox_client.lxc_service.runCommand({
          node_id: upload_node_id,
          container_id: upload_container_id,
          command_argv: ['grep', '-F', upload_dir_marker, marker_target_path],
          timeout_ms: upload_dir_timeout_ms,
          max_output_bytes: 64 * 1024,
          fail_on_non_zero_exit: false
        });
        const marker_found = marker_check_result.exit_code === 0;
        const remote_file_count_result = await proxmox_client.lxc_service.runCommand({
          node_id: upload_node_id,
          container_id: upload_container_id,
          command_argv: ['find', upload_dir_target_path, '-type', 'f'],
          timeout_ms: upload_dir_timeout_ms,
          max_output_bytes: 64 * 1024,
          fail_on_non_zero_exit: true
        });
        const remote_file_count = remote_file_count_result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0).length;
        const file_count_valid =
          Number.isInteger(remote_file_count) &&
          remote_file_count >= expected_file_count - 1;
        let symlink_check_passed = true;
        const symlink_target_path = `${upload_dir_target_path.replace(/\/+$/, '')}/${symlink_relative_path}`;
        if (upload_dir_symlink_policy === 'preserve') {
          const symlink_check_result = await proxmox_client.lxc_service.runCommand({
            node_id: upload_node_id,
            container_id: upload_container_id,
            command_argv: ['test', '-L', symlink_target_path],
            timeout_ms: upload_dir_timeout_ms,
            max_output_bytes: 64 * 1024,
            fail_on_non_zero_exit: false
          });
          symlink_check_passed = symlink_check_result.exit_code === 0;
        }
        if (upload_dir_symlink_policy === 'skip') {
          const symlink_check_result = await proxmox_client.lxc_service.runCommand({
            node_id: upload_node_id,
            container_id: upload_container_id,
            command_argv: ['test', '!', '-e', symlink_target_path],
            timeout_ms: upload_dir_timeout_ms,
            max_output_bytes: 64 * 1024,
            fail_on_non_zero_exit: false
          });
          symlink_check_passed = symlink_check_result.exit_code === 0;
        }
        console.info(
          `[example] upload_dir_verify marker_found=${marker_found} remote_file_count=${Number.isInteger(remote_file_count) ? remote_file_count : 'invalid'} expected_file_count_min=${expected_file_count - 1} file_count_valid=${file_count_valid} symlink_check_passed=${symlink_check_passed} strict_level=${upload_dir_strict_level}`
        );
        if (!marker_found || !file_count_valid) {
          throw new Error(
            `Directory upload verification failed at ${upload_dir_target_path}`
          );
        }
        if (
          upload_dir_strict_level === 'strict' &&
          (!symlink_check_passed ||
            upload_dir_result.failed_count > 0 ||
            (upload_dir_result.metrics?.phase_timings.extract_ms ?? 0) <= 0)
        ) {
          throw new Error(
            `Directory upload strict verification failed at ${upload_dir_target_path}`
          );
        }

        if (upload_dir_cleanup_remote) {
          await proxmox_client.lxc_service.runCommand({
            node_id: upload_node_id,
            container_id: upload_container_id,
            command_argv: ['rm', '-rf', upload_dir_target_path],
            timeout_ms: upload_dir_timeout_ms,
            max_output_bytes: 64 * 1024,
            fail_on_non_zero_exit: true
          });
          console.info(
            `[example] upload_dir_cleanup_remote removed=true target_directory_path=${upload_dir_target_path}`
          );
        } else {
          console.info(
            '[example] upload_dir_cleanup_remote skipped reason=PROXMOX_EXAMPLE_UPLOAD_DIR_CLEANUP_REMOTE_not_true'
          );
        }
      } finally {
        if (upload_dir_source_generated) {
          try {
            await rm(upload_dir_source_path, {
              recursive: true,
              force: true
            });
          } catch {
            console.warn(
              '[example] upload_dir_cleanup_local_warning reason=temporary_directory_cleanup_failed'
            );
          }
        }
      }
    }
  } finally {
    if (upload_source_generated) {
      try {
        await unlink(upload_source_file_path);
      } catch {
        console.warn(
          '[example] upload_cleanup_local_warning reason=temporary_source_unlink_failed'
        );
      }
    }
  }
}

if (require.main === module) {
  void Main().catch((error: unknown) => {
    if (
      error instanceof ProxmoxLxcUploadError ||
      error instanceof ProxmoxLxcExecError
    ) {
      console.error(
        `[example] lxc_upload_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxValidationError) {
      console.error(
        `[example] validation_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxAuthError) {
      console.error(
        `[example] auth_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxTimeoutError) {
      console.error(
        `[example] timeout_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxHttpError) {
      console.error(
        `[example] http_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxError) {
      console.error(
        `[example] proxmox_error code=${error.code} message=${error.message}`
      );
      if (error.details !== undefined) {
        console.error(`[example] details=${JSON.stringify(error.details)}`);
      }
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof Error) {
      console.error(`[example] unexpected_error message=${error.message}`);
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    console.error('[example] unexpected_non_error_throw');
    process.exitCode = 1;
  });
}
