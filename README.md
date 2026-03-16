# Proxmox SDK (TypeScript)

TypeScript SDK for Proxmox VE with typed services, strict config validation, SSH-backed LXC shell control, upload workflows, deep in-container telemetry, and single-file HTML report generation.

## What changed

- LXC shell execution is SSH-only via `ssh_pct` (`pct exec` and `pct enter`).
- Expect-style interactive scripting is available through `LxcExpectService`.
- LXC file and directory uploads are first-class (`uploadFile`, `uploadDirectory`).
- LXC telemetry now includes OS, cron, processes, TCP/UDP listeners, services, hardware, disk, memory, CPU, identity, firewall, and development tooling.
- HTML report generation is first-class (`generateSystemReportHtml`, `generateSystemReportFile`) with section-level status metadata.

## Architecture overview

- Config/auth/transport are centralized and typed.
- `ProxmoxClient` exposes service instances (`*_service`) and helper workflows.
- LXC command/terminal/upload/telemetry/report features live under `lxc_service`.
- `lxc_expect_service` composes on top of `lxc_service` terminal session APIs.
- Example scripts are smoke/demo consumers of SDK APIs, not internal SDK logic.

## Install

```bash
npm install @opsimathically/proxmox
```

## Configuration (minimal secure example)

Use env/file secret sources. Do not hardcode tokens/passwords.

```json
{
  "schema_version": 1,
  "active_profile": "default",
  "profiles": [
    {
      "name": "default",
      "cluster_id": "cluster-g75"
    }
  ],
  "clusters": [
    {
      "id": "cluster-g75",
      "name": "g75-cluster",
      "environment": "prod",
      "default_node": "g75",
      "nodes": [
        {
          "id": "g75",
          "hostname": "g75.local",
          "host": "192.168.11.252",
          "protocol": "https",
          "port": 8006,
          "token_id": "root@pam!sdk",
          "auth": {
            "provider": "env",
            "env_var": "PROXMOX_API_TOKEN"
          },
          "shell_backend": "ssh_pct",
          "ssh_shell": {
            "username": "root",
            "password_auth": {
              "provider": "env",
              "env_var": "PROXMOX_NODE_SSH_PASSWORD"
            },
            "strict_host_key": true,
            "known_hosts_path": "/home/user/.ssh/known_hosts",
            "connect_timeout_ms": 8000,
            "command_timeout_ms": 30000
          },
          "verify_tls": true
        }
      ]
    }
  ]
}
```

## Client bootstrap

```ts
import { LoadConfig, ResolveProfile, ProxmoxClient } from "@opsimathically/proxmox";

const config_path = process.env.PROXMOXLIB_CONFIG_PATH ?? "/home/user/environment_files/proxmoxlib.json";
const selected_profile_name = process.env.PROXMOXLIB_PROFILE ?? "default";

const config = LoadConfig({ config_path });
const profile = ResolveProfile({ config, profile_name: selected_profile_name });

const client = ProxmoxClient.fromPath({
  config_path,
  profile_name: profile.name,
});
```

## Core LXC shell capabilities

### One-off command execution (`runCommand`)

```ts
const result = await client.lxc_service.runCommand({
  node_id: "g75",
  container_id: 100,
  command_argv: ["uname", "-a"],
  timeout_ms: 30000,
  max_output_bytes: 256 * 1024,
  fail_on_non_zero_exit: false,
});

console.log(result.exit_code, result.stdout_text, result.stderr_text);
```

### Interactive terminal lifecycle

```ts
const session = await client.lxc_service.openTerminalSession({
  node_id: "g75",
  container_id: 100,
  shell_mode: false,
  columns: 120,
  rows: 32,
});

await client.lxc_service.sendTerminalInput({
  session_id: session.session_id,
  input_text: "id -u\n",
});

const events = await client.lxc_service.readTerminalEvents({
  session_id: session.session_id,
  max_events: 64,
});

await client.lxc_service.resizeTerminal({
  session_id: session.session_id,
  columns: 140,
  rows: 40,
});

await client.lxc_service.closeTerminalSession({
  session_id: session.session_id,
  reason: "done",
});
```

### Expect-style workflows (`LxcExpectService`)

Valid matcher kinds:
- `string`
- `regex`
- `callback` (runtime function, not JSON-serializable)

```ts
const expect_result = await client.lxc_expect_service.runScript({
  target: {
    open_terminal_input: {
      node_id: "g75",
      container_id: 100,
      shell_mode: false,
      columns: 120,
      rows: 32,
    },
    close_on_finish: true,
  },
  script: {
    default_timeout_ms: 15000,
    steps: [
      {
        step_id: "prompt",
        send_input: "\n",
        expect: [{ kind: "string", value: "#" }],
        fail_on_timeout: true,
      },
      {
        step_id: "callback_match",
        send_input: "printf \"SDK_EXPECT_OK\\n\"\n",
        expect: [
          {
            kind: "callback",
            callback_matcher: async ({ buffer_text }) => buffer_text.includes("SDK_EXPECT_OK"),
            timeout_ms: 500,
          },
        ],
        fail_on_timeout: true,
      },
    ],
  },
});
```

## Upload capabilities

### `uploadFile`

```ts
const file_upload = await client.lxc_service.uploadFile({
  node_id: "g75",
  container_id: 100,
  source_file_path: "/tmp/local.txt",
  target_file_path: "/tmp/remote.txt",
  create_parent_directories: true,
  overwrite: true,
  verify_checksum: true,
  timeout_ms: 30000,
});

console.log(file_upload.bytes_uploaded, file_upload.throughput_bytes_per_sec);
```

### `uploadDirectory`

Include/exclude precedence:
- include pass runs first (when include patterns are provided)
- exclude pass runs second
- exclude wins

`pattern_mode`:
- `regex`
- `glob`

`symlink_policy`:
- `skip`
- `preserve`
- `dereference`

```ts
const dir_upload = await client.lxc_service.uploadDirectory({
  node_id: "g75",
  container_id: 100,
  source_directory_path: "/tmp/app_bundle",
  target_directory_path: "/tmp/app_bundle",
  pattern_mode: "glob",
  include_patterns: ["**/*.js", "**/*.json"],
  exclude_patterns: ["**/node_modules/**", "**/*.log"],
  symlink_policy: "skip",
  include_hidden: false,
  overwrite: true,
  verify_checksum: false,
  timeout_ms: 180000,
});

console.log(dir_upload.files_uploaded, dir_upload.metrics?.wire_throughput_bytes_per_sec);
```

## LXC telemetry capabilities

Available methods on `lxc_service`:

- `getSystemInfo`
- `getCronJobs`
- `getProcessList`
- `getOpenTcpPorts` (includes interface correlation fields)
- `getOpenUdpPorts` (includes interface correlation fields)
- `getServicesAndDaemons` (`detail_level`, `process_enrichment_mode`)
- `getHardwareInventory`
- `getDiskAndBlockDevices` (`filesystem_scope`: `all|device_backed_only|persistent_only`)
- `getMemoryInfo` (supports optional bounded procfs RSS-component enrichment)
- `getCpuInfo`
- `getUsersAndGroups` (`privilege_detail_mode`, `status_source_confidence`)
- `getFirewallInfo` (best-effort posture inference)
- `getDevelopmentToolingInfo` (optional distro package enrichment + limits)

Example (safe, metadata-focused):

```ts
const node_id = "g75";
const container_id = 100;

const system_info = await client.lxc_service.getSystemInfo({ node_id, container_id });
const tcp = await client.lxc_service.getOpenTcpPorts({
  node_id,
  container_id,
  include_interfaces: true,
  include_loopback: true,
});
const services = await client.lxc_service.getServicesAndDaemons({
  node_id,
  container_id,
  detail_level: "standard",
  process_enrichment_mode: "main_pid_only",
});
const memory = await client.lxc_service.getMemoryInfo({
  node_id,
  container_id,
  include_process_breakdown: true,
  include_process_rss_components: true,
  process_limit: 200,
});

console.log(system_info.distribution_pretty_name, tcp.summary.total_listeners, services.summary.total_services, memory.summary.process_count);
```

## Report generation (first-class SDK capability)

Single-file HTML output:
- inline CSS + JS only
- no CDN/external assets
- dark theme
- per-section status/health metadata

### `generateSystemReportHtml`

```ts
const html_report = await client.lxc_service.generateSystemReportHtml({
  node_id: "g75",
  container_id: 100,
  sections: {
    include_system_info: true,
    include_cron_jobs: true,
    include_processes: true,
    include_tcp_ports: true,
    include_udp_ports: true,
    include_services: true,
    include_hardware: true,
    include_disk: true,
    include_memory: true,
    include_cpu: true,
    include_identity: true,
    include_firewall: true,
    include_devtools: true,
  },
  collection_options: {
    section_timeout_ms: 30000,
    process_limit: 200,
    listener_limit: 512,
  },
  render_options: {
    theme: "dark",
    report_title: "LXC Telemetry Report",
    include_raw_json: false,
    max_table_rows: 1000,
  },
});

console.log(html_report.metadata.section_status_counts);
```

### `generateSystemReportFile`

```ts
const file_report = await client.lxc_service.generateSystemReportFile({
  node_id: "g75",
  container_id: 100,
  output_dir: "/tmp",
  file_name_prefix: "proxmox-lxc-report",
  overwrite: true,
});

console.log(file_report.report_path, file_report.bytes_written, file_report.metadata.total_duration_ms);
```

Section statuses:
- `success`
- `partial`
- `failed`
- `disabled`

Each section metadata entry includes:
- `warning_count`
- `error_count`
- `truncated`
- `duration_ms`

## Example scripts

- `example.ts`
  - broad SDK coverage across services/helpers
  - includes LXC run/terminal/expect/upload smoke blocks
- `example_uploading.ts`
  - focused file upload, benchmark upload, and directory upload smoke
- `example_linux_container_os_info.ts`
  - focused telemetry + report generation smoke

Key report smoke toggles (`example_linux_container_os_info.ts`):
- `PROXMOX_EXAMPLE_REPORT_RUN` (default `true`)
- `PROXMOX_EXAMPLE_REPORT_OUTPUT_DIR` (default `/tmp`)
- `PROXMOX_EXAMPLE_REPORT_FILENAME_PREFIX` (default `proxmox-lxc-report`)

## Security notes

- Never store real secrets in source files.
- Use env/file secret providers for API tokens and SSH credentials.
- Keep logs metadata-only in automation pipelines.
- Environment/process inspection can expose sensitive data in target systems. Prefer `environment_mode: "none"` or `"keys_only"` unless you explicitly need sanitized values.
- Keep SSH host verification strict in production (`strict_host_key`, known_hosts/fingerprint).
- Prefer least-privilege API tokens and SSH credentials.

## Performance and limits guidance

- Set explicit `timeout_ms` for all long-running operations.
- Use limit fields (`process_limit`, `listener_limit`, `service_limit`, `device_limit`, `rule_limit`, `finding_limit`) to bound runtime and memory.
- Respect `truncated` flags and section warning/error counts in automation.
- Keep deeper enrichment modes opt-in:
  - service process enrichment: `main_pid_only` for lower overhead
  - devtools distro package enrichment: disabled by default
  - report `include_raw_json`: keep disabled unless needed

## Known limitations and caveats

- Container telemetry visibility is namespace/cgroup constrained and may not represent full host state.
- Tool availability varies by distro/container image (`ss`, `systemctl`, `lspci`, `lsusb`, package managers, etc.).
- Firewall posture and some security findings are best-effort interpretations, not formal policy proofs.
- Process/env/procfs reads can be partially unavailable due to permissions or runtime races.

## Exports overview

Primary exports include:
- `ProxmoxClient`
- `LxcService`
- `LxcExpectService`
- `DatacenterService`
- `ClusterService`
- `NodeService`
- `VmService`
- `AccessService`
- `StorageService`
- `PoolService`
- `HaService`
- `TaskService`
- `DrService`
- helper classes and shared config/service/expect types

See [`src/index.ts`](src/index.ts) for the canonical export surface.

## Disclaimer

This project is maintained for personal, evolving use. Stability is not guaranteed, interfaces may change, and behavior may be adjusted at any time to fit current needs. If you use this code, you do so at your own risk.
