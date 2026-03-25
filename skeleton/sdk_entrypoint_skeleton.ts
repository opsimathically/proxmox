/**
 * Proxmox SDK application skeleton (fill-in-the-blanks starter).
 *
 * Purpose:
 * - Give developers a simple TypeScript entrypoint they can copy and modify.
 * - Demonstrate inline configuration (no proxmoxlib.json parsing required).
 * - Show safe, non-destructive starter code paths across relevant SDK services.
 *
 * Security notes:
 * - This file intentionally uses fake placeholder values.
 * - Replace placeholder values before running in a real environment.
 * - This skeleton defaults to `plain` provider for fast local experimentation.
 * - For production, switch to env/vault/sops and never hardcode real secrets.
 */

import { writeFile, unlink } from "node:fs/promises";
import {
  ProxmoxClient,
  ValidateConfig,
  ResolveProfile,
  ProxmoxError,
  ProxmoxAuthError,
  ProxmoxValidationError,
  ProxmoxTimeoutError,
  ProxmoxHttpError,
  ProxmoxLxcExecError,
  ProxmoxLxcUploadError,
  ProxmoxTerminalSessionError,
  type proxmoxlib_config_t,
} from "../src";

/**
 * Small helper for boolean environment toggles.
 * Accepted truthy values: 1, true, yes, on
 */
function NormalizeBoolean(raw_value: string | undefined, default_value: boolean): boolean {
  if (raw_value === undefined) {
    return default_value;
  }
  const normalized_value = raw_value.trim().toLowerCase();
  return normalized_value === "1"
    || normalized_value === "true"
    || normalized_value === "yes"
    || normalized_value === "on";
}

/**
 * Keep log output metadata-only and short.
 */
function BuildExcerpt(raw_text: string, max_chars: number = 120): string {
  const single_line = raw_text.replace(/\s+/g, " ").trim();
  if (single_line.length <= max_chars) {
    return single_line;
  }
  return `${single_line.slice(0, max_chars)}...`;
}

/**
 * Inline config skeleton with FAKE values.
 *
 * Replace these placeholder fields before real usage:
 * - host / hostname / node id
 * - token_id
 * - auth env var names
 * - ssh username and ssh password env var name
 */
const inline_config: proxmoxlib_config_t = {
  schema_version: 1,
  active_profile: "dev",
  security: {
    // Required when using provider: "plain" for node API auth.
    // Keep this false in production and use env/vault/sops providers instead.
    allow_plaintext_api_key_in_file: true,
  },
  defaults: {
    request_timeout_ms: 30000,
    connect_timeout_ms: 8000,
    keep_alive_ms: 30000,
    user_agent: "my-proxmox-app/0.1.0",
    max_concurrency: 8,
  },
  profiles: [
    {
      name: "dev",
      description: "Starter profile. Replace values for your environment.",
      cluster_id: "primary",
      transport_overrides: {
        verify_tls: true,
      },
    },
  ],
  clusters: [
    {
      id: "primary",
      name: "Primary Proxmox Cluster (placeholder)",
      environment: "dev",
      default_node: "pve1",
      nodes: [
        {
          id: "pve1",
          hostname: "pve1.example.internal",
          host: "pve1.example.internal",
          protocol: "https",
          port: 8006,
          token_id: "root@pam!sdk-placeholder",
          auth: {
            // Fast-start default for local/dev skeleton usage.
            // Replace with a real token only in local scratch contexts.
            provider: "plain",
            plain_text: "REPLACE_WITH_PROXMOX_API_TOKEN_SECRET",
          },
          shell_backend: "ssh_pct",
          ssh_shell: {
            username: "root",
            password_auth: {
              // Optional: keep as plain here for consistency in this quick-start skeleton.
              // In production, prefer provider: "env" with env_var.
              provider: "plain",
              plain_text: "REPLACE_WITH_PROXMOX_NODE_SSH_PASSWORD",
            },
            strict_host_key: true,
            // Optional but recommended for stronger host verification:
            // host_fingerprint_sha256: "SHA256:REPLACE_WITH_REAL_FINGERPRINT",
          },
          verify_tls: true,
        },
      ],
    },
  ],
};

async function Main(): Promise<void> {
  /**
   * Replace these with your real target node/container.
   *
   * Tip:
   * - Keep these in env vars in automation pipelines.
   * - The defaults here are placeholders for readability.
   */
  const node_id = process.env.PROXMOX_EXAMPLE_NODE_ID?.trim() || "pve1";
  const container_id = Number.parseInt(
    process.env.PROXMOX_EXAMPLE_CONTAINER_ID?.trim() || "100",
    10,
  );

  if (!Number.isInteger(container_id) || container_id <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Container ID must be a positive integer.",
      details: {
        field: "PROXMOX_EXAMPLE_CONTAINER_ID",
        value: process.env.PROXMOX_EXAMPLE_CONTAINER_ID,
      },
    });
  }

  /**
   * Optional blocks (all safe/non-destructive by default).
   * Set env var to true/false to enable or disable each block.
   */
  const run_terminal_demo = NormalizeBoolean(process.env.PROXMOX_SKELETON_RUN_TERMINAL, false);
  const run_expect_demo = NormalizeBoolean(process.env.PROXMOX_SKELETON_RUN_EXPECT, false);
  const run_upload_demo = NormalizeBoolean(process.env.PROXMOX_SKELETON_RUN_UPLOAD, false);
  const run_helper_create_demo = NormalizeBoolean(process.env.PROXMOX_SKELETON_RUN_HELPER_CREATE, false);
  const run_helper_bulk_demo = NormalizeBoolean(process.env.PROXMOX_SKELETON_RUN_HELPER_BULK_CREATE, false);
  const run_telemetry_demo = NormalizeBoolean(process.env.PROXMOX_SKELETON_RUN_TELEMETRY, false);
  const run_report_demo = NormalizeBoolean(process.env.PROXMOX_SKELETON_RUN_REPORT, true);
  const helper_dry_run = NormalizeBoolean(process.env.PROXMOX_SKELETON_HELPER_DRY_RUN, true);

  const helper_target_storage = process.env.PROXMOX_SKELETON_HELPER_STORAGE?.trim() || "local-lvm";
  const helper_template_storage = process.env.PROXMOX_SKELETON_HELPER_TEMPLATE_STORAGE?.trim() || "local";
  const helper_template_volume = process.env.PROXMOX_SKELETON_HELPER_TEMPLATE_VOLUME?.trim()
    || "local:vztmpl/ubuntu-24.04-standard_24.04-1_amd64.tar.zst";
  const helper_bridge = process.env.PROXMOX_SKELETON_HELPER_BRIDGE?.trim() || "vmbr0";
  const helper_container_id_base = Number.parseInt(
    process.env.PROXMOX_SKELETON_HELPER_CONTAINER_ID_BASE?.trim() || "9000",
    10,
  );
  if (!Number.isInteger(helper_container_id_base) || helper_container_id_base <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Helper container ID base must be a positive integer.",
      details: {
        field: "PROXMOX_SKELETON_HELPER_CONTAINER_ID_BASE",
        value: process.env.PROXMOX_SKELETON_HELPER_CONTAINER_ID_BASE,
      },
    });
  }

  /**
   * STEP 1: Validate inline config.
   *
   * Why this exists:
   * - Validates config shape early.
   * - Applies defaults and returns the resolved config shape expected by ProxmoxClient.
   */
  const resolved_config = ValidateConfig({
    config: inline_config,
  });

  const selected_profile = ResolveProfile({
    config: resolved_config,
    profile_name: resolved_config.active_profile,
  });

  console.info(`[skeleton] selected_profile=${selected_profile.name} cluster_id=${selected_profile.cluster_id}`);

  /**
   * STEP 2: Create client from resolved config object.
   *
   * This is the direct object path (no file read).
   */
  const proxmox_client = new ProxmoxClient({
    config: resolved_config,
    profile_name: selected_profile.name,
  });

  /**
   * STEP 3: Basic connectivity + service handles.
   *
   * This block shows where core service facades live.
   * You can call any of these as needed in your app.
   */
  const nodes_response = await proxmox_client.node_service.listNodes();
  console.info(`[skeleton] nodes_discovered=${nodes_response.data.length}`);

  const datacenter_summary = await proxmox_client.datacenter_service.getSummary();
  console.info(`[skeleton] datacenter_summary_entries=${datacenter_summary.data.length}`);

  const container_response = await proxmox_client.lxc_service.getContainer({
    node_id,
    container_id,
  });
  console.info(
    `[skeleton] target_container name=${String(container_response.data.name ?? "unknown")} status=${String(container_response.data.status ?? "unknown")}`,
  );

  /**
   * STEP 4: Safe one-off command example.
   *
   * This is often the easiest way to start automation:
   * - run a command
   * - inspect exit code and output
   */
  const command_result = await proxmox_client.lxc_service.runCommand({
    node_id,
    container_id,
    command_argv: ["hostname"],
    timeout_ms: 30000,
    max_output_bytes: 64 * 1024,
    fail_on_non_zero_exit: true,
  });
  console.info(
    `[skeleton] run_command exit_code=${String(command_result.exit_code ?? "unknown")} stdout_excerpt=${BuildExcerpt(command_result.stdout)}`,
  );

  /**
   * STEP 5 (optional): Interactive terminal lifecycle.
   *
   * Enable with: PROXMOX_SKELETON_RUN_TERMINAL=true
   */
  if (run_terminal_demo) {
    const terminal_session = await proxmox_client.lxc_service.openTerminalSession({
      node_id,
      container_id,
      shell_mode: false,
      columns: 120,
      rows: 30,
      timeout_ms: 30000,
    });

    await proxmox_client.lxc_service.sendTerminalInput({
      session_id: terminal_session.session_id,
      input_text: "echo SDK_TERMINAL_SKELETON_OK\n",
    });

    const terminal_events = await proxmox_client.lxc_service.readTerminalEvents({
      session_id: terminal_session.session_id,
      max_events: 100,
    });

    const combined_output = terminal_events
      .filter((event_record) => event_record.event_type === "output")
      .map((event_record) => event_record.output_chunk ?? "")
      .join("\n");

    console.info(
      `[skeleton] terminal_events=${terminal_events.length} output_excerpt=${BuildExcerpt(combined_output)}`,
    );

    await proxmox_client.lxc_service.closeTerminalSession({
      session_id: terminal_session.session_id,
      reason: "skeleton_terminal_demo_complete",
      code: 1000,
    });
  }

  /**
   * STEP 6 (optional): Expect-style scripted interaction.
   *
   * Enable with: PROXMOX_SKELETON_RUN_EXPECT=true
   */
  if (run_expect_demo) {
    const expect_result = await proxmox_client.lxc_expect_service.runScript({
      target: {
        open_terminal_input: {
          node_id,
          container_id,
          shell_mode: false,
          columns: 120,
          rows: 30,
          timeout_ms: 30000,
        },
        close_on_finish: true,
      },
      script: {
        default_timeout_ms: 30000,
        default_poll_interval_ms: 100,
        max_buffer_bytes: 128 * 1024,
        steps: [
          {
            step_id: "expect_prompt",
            send_input: "\n",
            expect: [{ matcher_id: "prompt", kind: "string", value: "#" }],
            fail_on_timeout: true,
          },
          {
            step_id: "expect_marker",
            send_input: "printf \"SDK_EXPECT_SKELETON_OK\\n\"\n",
            expect: [{ matcher_id: "marker", kind: "string", value: "SDK_EXPECT_SKELETON_OK" }],
            fail_on_timeout: true,
          },
        ],
      },
    });

    console.info(
      `[skeleton] expect_succeeded=${expect_result.succeeded} steps=${expect_result.step_results.length} transcript_truncated=${expect_result.transcript.truncated}`,
    );
  }

  /**
   * STEP 7 (optional): File upload demo.
   *
   * Enable with: PROXMOX_SKELETON_RUN_UPLOAD=true
   *
   * This writes a harmless temp file to /tmp inside the container.
   */
  if (run_upload_demo) {
    const local_temp_path = `/tmp/proxmox-sdk-skeleton-${Date.now()}.txt`;
    const remote_target_path = "/tmp/proxmox-sdk-skeleton-upload.txt";
    await writeFile(local_temp_path, "SDK_UPLOAD_SKELETON_OK\n", {
      encoding: "utf8",
      mode: 0o600,
    });

    try {
      const upload_result = await proxmox_client.lxc_service.uploadFile({
        node_id,
        container_id,
        source_file_path: local_temp_path,
        target_file_path: remote_target_path,
        overwrite: true,
        verify_checksum: true,
        create_parent_directories: true,
        timeout_ms: 30000,
      });

      console.info(
        `[skeleton] upload_result bytes_uploaded=${upload_result.bytes_uploaded} elapsed_ms=${upload_result.elapsed_ms} throughput_bytes_per_sec=${upload_result.throughput_bytes_per_sec}`,
      );
    } finally {
      await unlink(local_temp_path).catch(() => undefined);
    }
  }

  /**
   * STEP 8 (optional): Helper-based container provisioning demos.
   *
   * Enable with:
   * - PROXMOX_SKELETON_RUN_HELPER_CREATE=true
   * - PROXMOX_SKELETON_RUN_HELPER_BULK_CREATE=true
   *
   * Safety:
   * - By default, helper calls run with dry_run=true.
   * - To execute real create tasks, set PROXMOX_SKELETON_HELPER_DRY_RUN=false.
   *
   * These helper methods are useful when you want:
   * - placement planning across cluster nodes
   * - preflight checks before create
   * - normalized create workflows
   * - bulk create workflows
   */
  if (run_helper_create_demo || run_helper_bulk_demo) {
    const helper_create_input = {
      general: {
        node_id,
        container_id: String(helper_container_id_base),
        hostname: "sdk-skeleton-lxc-9000",
        // Optional placeholders:
        // resource_pool: "my-pool",
        // password: "REPLACE_ME",
        // ssh_public_keys: "ssh-ed25519 AAAA... replace_me",
        unprivileged_container: true,
        nesting: true,
        add_to_ha: false,
        tags: ["sdk", "skeleton", "example"],
      },
      template: {
        storage: helper_template_storage,
        template: helper_template_volume,
      },
      disks: {
        storage: helper_target_storage,
        disk_size_gib: 8,
      },
      cpu: {
        cores: 2,
      },
      memory: {
        memory_mib: 1024,
        swap_mib: 512,
      },
      network: {
        bridge: helper_bridge,
        ipv4_mode: "dhcp" as const,
        ipv6_mode: "none" as const,
      },
      preflight: {
        enabled: true,
        enforce: false,
      },
      start_after_created: false,
      wait_for_task: true,
      dry_run: helper_dry_run,
    };

    if (run_helper_create_demo) {
      const placement_plan = await proxmox_client.helpers.planLxcPlacement({
        required_storage_id: helper_target_storage,
        template_storage_id: helper_template_storage,
        required_bridge: helper_bridge,
        requested_cores: helper_create_input.cpu.cores,
        requested_memory_bytes: (helper_create_input.memory.memory_mib ?? 0) * 1024 * 1024,
        strict_permissions: false,
      });
      console.info(
        `[skeleton] helper_plan allowed_nodes=${placement_plan.data.allowed_node_count} recommended_node_id=${placement_plan.data.recommended_node_id ?? "none"}`,
      );

      const cluster_preflight = await proxmox_client.helpers.preflightLxcCreateCluster({
        create_input: helper_create_input,
        strict_permissions: false,
      });
      console.info(
        `[skeleton] helper_cluster_preflight checked=${cluster_preflight.data.checked_node_count} allowed=${cluster_preflight.data.allowed_node_count} denied=${cluster_preflight.data.denied_node_count}`,
      );

      const helper_create_result = await proxmox_client.helpers.createLxcContainer(helper_create_input);
      console.info(
        `[skeleton] helper_create dry_run=${helper_create_result.data.dry_run} node_id=${helper_create_result.data.node_id} container_id=${helper_create_result.data.container_id} preflight_failed_checks=${helper_create_result.data.preflight.failed_checks}`,
      );
    }

    if (run_helper_bulk_demo) {
      const bulk_create_result = await proxmox_client.helpers.createLxcContainersBulk({
        base_input: helper_create_input,
        count: 2,
        container_id_start: helper_container_id_base,
        container_id_step: 1,
        hostname_strategy: {
          prefix: "sdk-skeleton-lxc",
          separator: "-",
          start_index: 1,
        },
        dry_run: helper_dry_run,
        wait_for_tasks: true,
        concurrency_limit: 2,
        continue_on_error: true,
      });
      console.info(
        `[skeleton] helper_bulk_create dry_run=${bulk_create_result.data.dry_run} requested=${bulk_create_result.data.summary.requested} attempted=${bulk_create_result.data.summary.attempted} succeeded=${bulk_create_result.data.summary.succeeded} failed=${bulk_create_result.data.summary.failed}`,
      );
    }
  }

  /**
   * STEP 9 (optional): Telemetry demo.
   *
   * Enable with: PROXMOX_SKELETON_RUN_TELEMETRY=true
   *
   * These calls are read-only and useful for inventory/observability automation.
   */
  if (run_telemetry_demo) {
    const system_info = await proxmox_client.lxc_service.getSystemInfo({ node_id, container_id });
    const cron_info = await proxmox_client.lxc_service.getCronJobs({ node_id, container_id });
    const process_info = await proxmox_client.lxc_service.getProcessList({ node_id, container_id });
    const tcp_info = await proxmox_client.lxc_service.getOpenTcpPorts({ node_id, container_id });
    const udp_info = await proxmox_client.lxc_service.getOpenUdpPorts({ node_id, container_id });

    console.info(
      `[skeleton] telemetry_summary distro=${system_info.distribution_pretty_name ?? "unknown"} cron_jobs=${cron_info.jobs.length} processes=${process_info.summary.total_process_count} tcp_listeners=${tcp_info.summary.total_listeners} udp_listeners=${udp_info.summary.total_listeners}`,
    );

    // Additional telemetry APIs (same pattern):
    // - getServicesAndDaemons
    // - getHardwareInventory
    // - getDiskAndBlockDevices
    // - getMemoryInfo
    // - getCpuInfo
    // - getUsersAndGroups
    // - getFirewallInfo
    // - getDevelopmentToolingInfo
  }

  /**
   * STEP 10 (optional): HTML report generation.
   *
   * Enable with: PROXMOX_SKELETON_RUN_REPORT=true
   *
   * This generates a single-file HTML report to /tmp by default.
   */
  if (run_report_demo) {
    const report_result = await proxmox_client.lxc_service.generateSystemReportFile({
      node_id,
      container_id,
      output_dir: "/tmp",
      file_name_prefix: "proxmox-sdk-skeleton-report",
    });

    console.info(
      `[skeleton] report path=${report_result.report_path} bytes=${report_result.bytes_written} section_status=${JSON.stringify(report_result.metadata.section_status_counts)}`,
    );
  }

  /**
   * Service/helper reference map for developers.
   *
   * You can call these from proxmox_client as your app grows:
   * - proxmox_client.datacenter_service
   * - proxmox_client.cluster_service
   * - proxmox_client.node_service
   * - proxmox_client.vm_service
   * - proxmox_client.lxc_service
   * - proxmox_client.lxc_expect_service
   * - proxmox_client.access_service
   * - proxmox_client.storage_service
   * - proxmox_client.pool_service
   * - proxmox_client.ha_service
   * - proxmox_client.task_service
   * - proxmox_client.dr_service
   * - proxmox_client.helpers
   *
   * Common helper methods for LXC creation workflows:
   * - proxmox_client.helpers.planLxcPlacement
   * - proxmox_client.helpers.preflightLxcCreateCluster
   * - proxmox_client.helpers.createLxcContainer
   * - proxmox_client.helpers.createLxcContainersBulk
   */

  console.info("[skeleton] complete");
}

if (require.main === module) {
  void Main().catch((error: unknown) => {
    if (error instanceof ProxmoxAuthError) {
      console.error(`[skeleton] auth_error code=${error.code} message=${error.message}`);
      process.exitCode = 1;
      return;
    }

    if (
      error instanceof ProxmoxValidationError
      || error instanceof ProxmoxTimeoutError
      || error instanceof ProxmoxHttpError
      || error instanceof ProxmoxLxcExecError
      || error instanceof ProxmoxLxcUploadError
      || error instanceof ProxmoxTerminalSessionError
      || error instanceof ProxmoxError
    ) {
      console.error(`[skeleton] proxmox_error code=${error.code} message=${error.message}`);
      process.exitCode = 1;
      return;
    }

    if (error instanceof Error) {
      console.error(`[skeleton] error message=${error.message}`);
      process.exitCode = 1;
      return;
    }

    console.error("[skeleton] unknown_error");
    process.exitCode = 1;
  });
}
