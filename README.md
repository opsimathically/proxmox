# Proxmox SDK (TypeScript)

Typed Proxmox VE SDK for cluster, node, VM, LXC, storage, access, HA, task orchestration, DR readiness, helper workflows, SSH-backed LXC shell control, upload pipelines, in-container telemetry, and single-file HTML reporting.

## 1) Project overview

This SDK provides:

- Strict TypeScript request/response contracts.
- Centralized config/auth/transport/retry/task-polling behavior.
- Service-oriented APIs for Proxmox domains.
- SSH-based LXC execution/terminal/upload/introspection/report generation.
- Higher-level helper workflows for placement, migration, drain, and LXC lifecycle operations.

High-level architecture:

- `config` layer: schema validation, profile resolution, secret-source wiring.
- `transport` layer: HTTP execution, retry/timeout, typed error mapping.
- `services` layer: domain APIs (`datacenter`, `cluster`, `node`, `vm`, `lxc`, etc.).
- `helpers` layer: multi-step orchestration utilities.
- `lxc_expect_service`: expect-style interactive terminal automation.

## 2) Installation and prerequisites

Requirements:

- Node.js 18+ (Node.js 20 LTS recommended).
- TypeScript runtime/build setup for your project.
- Proxmox API access (token/user with required ACLs).
- SSH reachability to target nodes for LXC shell/upload/report telemetry flows.
- TLS trust configured for Proxmox API endpoints.

Install:

```bash
npm install @opsimathically/proxmox
```

## 3) Configuration deep dive

The SDK uses `proxmoxlib.json` with these core blocks:

- `defaults`: transport/retry/task poller defaults.
- `profiles`: runtime profile selection and cluster mapping.
- `clusters`: one or more clusters containing nodes.
- `nodes`: API auth config + optional SSH shell backend config.

Auth providers currently supported:

- `env`
- `file`
- `vault`
- `sops`
- `plain` (disabled by default unless `security.allow_plaintext_api_key_in_file=true`)

`plain` provider example (use only in controlled dev/test contexts):

```json
{
  "security": {
    "allow_plaintext_api_key_in_file": true
  },
  "clusters": [
    {
      "id": "example-cluster",
      "name": "example-cluster",
      "environment": "dev",
      "nodes": [
        {
          "id": "node-a",
          "hostname": "node-a.local",
          "host": "192.0.2.10",
          "token_id": "root@pam!sdk",
          "auth": {
            "provider": "plain",
            "plain_text": "REPLACE_WITH_TOKEN_SECRET"
          }
        }
      ]
    }
  ]
}
```

LXC shell backend:

- `shell_backend`: currently `ssh_pct`
- `ssh_shell`: SSH auth/host verification/timeouts for shell/upload/telemetry/report collection

Secret sourcing guidance:

- Keep API token and SSH secret material in env/files/secret providers.
- Prefer `env`, `vault`, or `sops` in production.
- Use `plain` only for controlled development/testing and never commit real secrets.
- Do not hardcode credentials in source or committed config.

### Minimal config example

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
            "known_hosts_path": "/home/user/.ssh/known_hosts"
          },
          "verify_tls": true
        }
      ]
    }
  ]
}
```

### Production-oriented config notes

- Set `verify_tls: true` and use `ca_bundle_path` where needed.
- Use `strict_host_key` + `known_hosts_path` or pinned fingerprint.
- Keep `request_timeout_ms`, `connect_timeout_ms`, and retry policy explicit.
- Tune `task_poller` defaults for long-running operations.

### Config path/profile selection behavior

`ProxmoxClient.fromPath(...)` resolves config path in this order:

1. explicit `config_path` argument
2. `PROXMOXLIB_CONFIG_PATH`
3. `~/environment_files/proxmoxlib.json`

Profile selection:

- explicit `profile_name` argument
- otherwise active profile from config

## 4) Client bootstrap patterns

### From config path + profile

```ts
import { ProxmoxClient } from "@opsimathically/proxmox";

const client = ProxmoxClient.fromPath({
  config_path: process.env.PROXMOXLIB_CONFIG_PATH,
  profile_name: process.env.PROXMOXLIB_PROFILE ?? "default",
});
```

### Direct config object

```ts
import { LoadConfig, ProxmoxClient } from "@opsimathically/proxmox";

const config = LoadConfig({ config_path: "/home/user/environment_files/proxmoxlib.json" });
const client = new ProxmoxClient({
  config,
  profile_name: "default",
});
```

### Startup diagnostics (safe metadata logger)

```ts
import { ProxmoxClient } from "@opsimathically/proxmox";

const client = ProxmoxClient.fromPath({
  profile_name: "default",
  emit_startup_diagnostics: true,
  diagnostics_logger: {
    info: (message, payload) => {
      console.info(message, payload);
    },
    warn: (message, payload) => {
      console.warn(message, payload);
    },
    error: (message, payload) => {
      console.error(message, payload);
    },
  },
});
```

## 5) Services reference (full library)

### DatacenterService (`client.datacenter_service`)

Purpose: cluster-level read APIs.

Methods:

- `getSummary`
- `getVersion`
- `listStorage`

Example:

```ts
const version = await client.datacenter_service.getVersion();
const summary = await client.datacenter_service.getSummary();
```

### ClusterService (`client.cluster_service`)

Purpose: cluster membership, node listing, compatibility checks, ID allocation.

Methods:

- `getStatus`
- `getMembership`
- `listNodes`
- `allocateNextId`
- `checkStorageCompatibility`
- `checkBridgeCompatibility`

Example:

```ts
const next_id = await client.cluster_service.allocateNextId();
const bridge_check = await client.cluster_service.checkBridgeCompatibility({
  node_ids: ["g75"],
  bridge: "vmbr0",
});
```

### NodeService (`client.node_service`)

Purpose: node status/network/capacity/services/metrics/reboot.

Methods:

- `listNodes`
- `getNodeStatus`
- `listNetworkInterfaces`
- `listBridges`
- `getNetworkInterface`
- `getNodeCpuCapacity`
- `canAllocateCores`
- `getNodeMemoryCapacity`
- `getNodeMemoryAllocations`
- `canAllocateMemory`
- `getServices`
- `getNodeMetrics`
- `rebootNode`

Example:

```ts
const status = await client.node_service.getNodeStatus({ node_id: "g75" });
const core_preflight = await client.node_service.canAllocateCores({
  node_id: "g75",
  requested_cores: 2,
  mode: "logical",
});
```

### VmService (`client.vm_service`)

Purpose: VM lifecycle, migration, and task tracking.

Methods:

- `listVms`
- `getVm`
- `createVm`
- `updateVm`
- `cloneVm`
- `deleteVm`
- `startVm`
- `stopVm`
- `restartVm`
- `migrateVm`
- `waitForTask`

Example (non-destructive):

```ts
const vm_list = await client.vm_service.listVms({ node_id: "g75" });
const vm = await client.vm_service.getVm({ node_id: "g75", vm_id: 100 });
```

### LxcService (`client.lxc_service`)

Purpose: LXC lifecycle plus SSH shell/terminal/expect support/upload/introspection/reporting.

Methods:

- `listContainers`
- `getContainer`
- `createContainer`
- `updateContainer`
- `deleteContainer`
- `startContainer`
- `stopContainer`
- `migrateContainer`
- `snapshotContainer`
- `restoreContainer`
- `runCommand`
- `getSystemInfo`
- `getCronJobs`
- `getProcessList`
- `getOpenTcpPorts`
- `getOpenUdpPorts`
- `getServicesAndDaemons`
- `getHardwareInventory`
- `getDiskAndBlockDevices`
- `getMemoryInfo`
- `getCpuInfo`
- `getUsersAndGroups`
- `getFirewallInfo`
- `getDevelopmentToolingInfo`
- `generateSystemReportHtml`
- `generateSystemReportFile`
- `uploadFile`
- `uploadDirectory`
- `openTerminalSession`
- `sendTerminalInput`
- `resizeTerminal`
- `readTerminalEvents`
- `closeTerminalSession`
- `getTerminalSession`
- `getCommandResult`
- `waitForTask`

Example:

```ts
const exec_result = await client.lxc_service.runCommand({
  node_id: "g75",
  container_id: 100,
  command_argv: ["hostname"],
  timeout_ms: 30000,
});
```

### LxcExpectService (`client.lxc_expect_service`)

Purpose: expect-style deterministic automation over LXC interactive sessions.

Methods:

- `waitFor`
- `sendAndExpect`
- `step`
- `runScript`

Matcher kinds:

- `string`
- `regex`
- `callback` (runtime code matcher; not JSON-serializable)

Example:

```ts
const session = await client.lxc_service.openTerminalSession({
  node_id: "g75",
  container_id: 100,
  shell_mode: false,
});

await client.lxc_expect_service.sendAndExpect({
  session_id: session.session_id,
  send_input: "printf \"SDK_OK\\n\"\n",
  expect: [{ kind: "string", value: "SDK_OK" }],
  timeout_ms: 10000,
});
```

### AccessService (`client.access_service`)

Purpose: permission and privilege checks for current/target identity.

Methods:

- `getCurrentPermissions`
- `getIdentityPermissions`
- `hasCurrentPrivilege`
- `hasIdentityPrivilege`

Example:

```ts
const can_allocate = await client.access_service.hasCurrentPrivilege({
  path: "/storage/local",
  privilege: "Datastore.AllocateSpace",
});
```

### StorageService (`client.storage_service`)

Purpose: storage content listing + upload/download/delete + privilege helpers.

Methods:

- `listStorageContent`
- `listBackups`
- `listIsoImages`
- `listCtTemplates`
- `listTemplateCatalog`
- `deleteContent`
- `uploadContent`
- `downloadContent`
- `canAuditStorage`
- `canAllocateTemplate`
- `canAllocateSpace`
- `canModifyPermissions`

Example (non-destructive):

```ts
const backups = await client.storage_service.listBackups({
  node_id: "g75",
  storage: "local",
});
```

### PoolService (`client.pool_service`)

Purpose: pool inventory and pool resource listing.

Methods:

- `listPools`
- `getPool`
- `listPoolResources`

Example:

```ts
const pools = await client.pool_service.listPools();
```

### HaService (`client.ha_service`)

Purpose: HA resource/group read and mutation operations.

Methods:

- `listResources`
- `addResource`
- `updateResource`
- `removeResource`
- `listGroups`

Example (read-only):

```ts
const ha_resources = await client.ha_service.listResources({});
const ha_groups = await client.ha_service.listGroups({});
```

### TaskService (`client.task_service`)

Purpose: wait/poll multiple tasks with fail-fast or collect-all behavior.

Methods:

- `waitForTasks`

Example:

```ts
const task_results = await client.task_service.waitForTasks({
  tasks: [
    { node_id: "g75", task_id: "UPID:g75:..." },
  ],
  fail_fast: false,
  timeout_ms: 60000,
});
```

### DrService (`client.dr_service`)

Purpose: replication/backup capability discovery and DR readiness checks.

Methods:

- `discoverReplicationCapabilities`
- `discoverBackupCapabilities`
- `checkDrReadiness`

Example:

```ts
const dr_readiness = await client.dr_service.checkDrReadiness({
  node_id: "g75",
  require_replication_jobs: false,
  require_backup_storage: true,
  minimum_backup_storage_count: 1,
});
```

## 6) Helpers reference (full library)

The client exposes `client.helpers` (`ProxmoxHelpers`) as a facade over helper classes.

### ClusterOrchestrationHelper

Typical use: placement and migration preflight orchestration.

Facade methods:

- `planLxcPlacement`
- `planVmPlacement`
- `migrateLxcWithPreflight`
- `migrateVmWithPreflight`

Example:

```ts
const placement = await client.helpers.planLxcPlacement({
  required_storage_id: "local-lvm",
  required_bridge: "vmbr0",
  candidate_node_ids: ["g75"],
  scoring_mode: "balanced",
  strict_permissions: false,
});
```

### NodeMaintenanceHelper

Typical use: maintenance plan and controlled drain.

Facade methods:

- `prepareNodeMaintenance`
- `drainNode`

Example:

```ts
const maintenance_plan = await client.helpers.prepareNodeMaintenance({
  node_id: "g75",
  include_stopped: false,
  scoring_mode: "balanced",
});
```

### LxcHelper

Typical use: higher-level LXC create flow with typed preflight and optional dry-run.

Facade method:

- `createLxcContainer`

Example:

```ts
const preview = await client.helpers.createLxcContainer({
  general: {
    node_id: "g75",
    container_id: 1900,
    hostname: "sdk-preview.local",
    unprivileged_container: true,
  },
  template: {
    storage: "local",
    template: "ubuntu-24.04-standard_24.04-1_amd64.tar.zst",
  },
  disks: {
    storage: "local-lvm",
    disk_size_gib: 8,
  },
  network: {
    bridge: "vmbr0",
  },
  dry_run: true,
  wait_for_task: true,
});
```

### LxcBulkHelper

Typical use: bulk create/destroy with controlled concurrency and per-item outcomes.

Facade methods:

- `createLxcContainersBulk`
- `teardownAndDestroyLxcContainersBulk`

Example:

```ts
const bulk_preview = await client.helpers.createLxcContainersBulk({
  base_input: {
    general: {
      node_id: "g75",
      container_id: 2000,
      hostname: "bulk-2000.local",
    },
    template: {
      storage: "local",
      template: "ubuntu-24.04-standard_24.04-1_amd64.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 4,
    },
    network: {
      bridge: "vmbr0",
    },
  },
  count: 2,
  dry_run: true,
  continue_on_error: true,
});
```

### LxcClusterPreflightHelper

Typical use: node candidate preflight/ranking before create.

Facade method:

- `preflightLxcCreateCluster`

Example:

```ts
const preflight = await client.helpers.preflightLxcCreateCluster({
  create_input: {
    general: {
      node_id: "g75",
      container_id: 2100,
      hostname: "preflight.local",
    },
    template: {
      storage: "local",
      template: "ubuntu-24.04-standard_24.04-1_amd64.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 8,
    },
    network: {
      bridge: "vmbr0",
    },
    dry_run: true,
  },
  candidate_node_ids: ["g75"],
  strict_permissions: false,
});
```

### LxcDestroyHelper

Typical use: stop/delete with guardrails and no-op handling.

Facade method:

- `teardownAndDestroyLxcContainer`

Example:

```ts
const destroy_preview = await client.helpers.teardownAndDestroyLxcContainer({
  node_id: "g75",
  container_id: 2100,
  dry_run: true,
  ignore_not_found: true,
  wait_for_tasks: true,
});
```

### ProxmoxHelpers

Facade covering all helper workflows:

- `createLxcContainer`
- `teardownAndDestroyLxcContainer`
- `createLxcContainersBulk`
- `teardownAndDestroyLxcContainersBulk`
- `preflightLxcCreateCluster`
- `planLxcPlacement`
- `planVmPlacement`
- `migrateLxcWithPreflight`
- `migrateVmWithPreflight`
- `prepareNodeMaintenance`
- `drainNode`

## 7) LXC subsystem documentation (full)

### SSH-only execution model

- LXC shell backend is `ssh_pct`.
- One-off commands use `pct exec`.
- Interactive sessions use `pct enter`.
- Terminal proxy/VNC/websocket paths are not part of active runtime flow.

### `runCommand`

Supports:

- argv mode (`command_argv`) and shell mode (`shell_mode` + `shell_command`).
- env/cwd/user controls.
- deterministic `stdout_text`, `stderr_text`, `exit_code`.
- timeout and max output limits.

### Terminal lifecycle APIs

- `openTerminalSession`
- `sendTerminalInput`
- `readTerminalEvents`
- `resizeTerminal`
- `closeTerminalSession`
- `getTerminalSession`
- `getCommandResult`

### Expect workflows

- `waitFor`
- `sendAndExpect`
- `step`
- `runScript`

Matcher kinds:

- `string`
- `regex`
- `callback` (async callback with timeout support; runtime-code matcher only)

### Uploads

- `uploadFile`
- `uploadDirectory`

Directory upload controls:

- `pattern_mode`: `regex | glob`
- include/exclude precedence: include pass first, exclude pass second, exclude wins
- `symlink_policy`: `skip | preserve | dereference`
- transfer/memory tuning: `chunk_size_bytes`, `high_water_mark_bytes`

### Telemetry suite

- `getSystemInfo`
- `getCronJobs`
- `getProcessList`
- `getOpenTcpPorts`
- `getOpenUdpPorts`
- `getServicesAndDaemons`
- `getHardwareInventory`
- `getDiskAndBlockDevices`
- `getMemoryInfo`
- `getCpuInfo`
- `getUsersAndGroups`
- `getFirewallInfo`
- `getDevelopmentToolingInfo`

Notable tuning flags:

- process env mode: `none | keys_only | sanitized_values`
- service detail mode: `summary_only | standard | full`
- service process enrichment mode: `none | main_pid_only | full`
- identity privilege detail mode: `signals_only | sudoers_expanded`
- filesystem scope: `all | device_backed_only | persistent_only`
- optional distro package enrichment for devtools (off by default)

### Report generation

- `generateSystemReportHtml`
- `generateSystemReportFile`

Section controls:

- `sections.include_*` toggles for all report sections
- per-section status in metadata: `success | partial | failed | disabled`
- per-section warning/error/truncated counts

Single-file output guarantees:

- inline CSS
- inline JavaScript
- no external assets/CDN

Report file example:

```ts
const report = await client.lxc_service.generateSystemReportFile({
  node_id: "g75",
  container_id: 100,
  output_dir: "/tmp",
  file_name_prefix: "proxmox-lxc-report",
  overwrite: true,
});

console.log(report.report_path, report.bytes_written, report.metadata.section_status_counts);
```

## 8) Error model and handling

Core exported error classes include:

- `ProxmoxError`
- `ProxmoxValidationError`
- `ProxmoxAuthError`
- `ProxmoxHttpError`
- `ProxmoxTransportError`
- `ProxmoxTimeoutError`
- `ProxmoxRateLimitError`
- `ProxmoxNotFoundError`
- `ProxmoxConflictError`
- `ProxmoxTaskError`
- `ProxmoxLxcExecError`
- `ProxmoxLxcUploadError`
- `ProxmoxSshShellError`
- `ProxmoxTerminalSessionError`
- expect-specific typed errors

Typed handling pattern:

```ts
import {
  ProxmoxError,
  ProxmoxValidationError,
  ProxmoxAuthError,
  ProxmoxLxcUploadError,
} from "@opsimathically/proxmox";

try {
  await client.lxc_service.uploadFile({
    node_id: "g75",
    container_id: 100,
    source_file_path: "/tmp/input.bin",
    target_file_path: "/tmp/input.bin",
  });
} catch (error) {
  if (error instanceof ProxmoxValidationError) {
    console.error("validation", error.code, error.message);
  } else if (error instanceof ProxmoxAuthError) {
    console.error("auth", error.code, error.status_code);
  } else if (error instanceof ProxmoxLxcUploadError) {
    console.error("upload", error.code, error.message);
  } else if (error instanceof ProxmoxError) {
    console.error("proxmox", error.code, error.message);
  } else if (error instanceof Error) {
    console.error("unexpected", error.message);
  }
}
```

Retry guidance:

- Safe to retry selected read-only operations.
- Do not blindly retry non-idempotent/mutating operations.
- Use operation-specific timeout and retry policy settings.

## 9) Security guidance

- Keep all credentials out of source control.
- Prefer env/file/vault/sops secret providers.
- Treat `plain` provider as a controlled exception; keep it disabled unless explicitly needed.
- Keep diagnostics/logging metadata-only.
- Use least-privilege API token and SSH credentials.
- Keep TLS verification enabled and CA trust explicit.
- Enable strict SSH host key verification for production.
- Avoid broad environment capture unless required.

## 10) Performance and scalability guidance

Use per-call limits/timeouts aggressively:

- `timeout_ms`
- `max_output_bytes`
- `process_limit`
- `listener_limit`
- `service_limit`
- `device_limit`
- `filesystem_limit`
- `rule_limit` / `finding_limit`
- module/package inventory limits

Operational behavior:

- Many introspection methods expose `scan_errors`, `parse_warnings`, and `truncated`.
- Treat `truncated=true` as partial data.
- Use lower-cost detail modes for large containers.

Recommended defaults for large targets:

- service: `detail_level: "summary_only"` or `"standard"`
- service: `process_enrichment_mode: "none"` or `"main_pid_only"`
- process/tcp/udp: `environment_mode: "none"` or `"keys_only"`
- devtools distro package enrichment: keep disabled unless needed

## 11) Example scripts guide

- `example.ts`
  - broad SDK/service/helper coverage
  - includes optional mutation blocks gated by env flags
- `example_uploading.ts`
  - focused upload smoke + benchmark + directory upload flow
- `example_linux_container_os_info.ts`
  - focused telemetry smoke + HTML report generation

Common live config behavior:

- uses `PROXMOXLIB_CONFIG_PATH` when set
- uses profile selection from env/default
- expects SSH password via `PROXMOX_NODE_SSH_PASSWORD` when password auth is configured

Key report toggles:

- `PROXMOX_EXAMPLE_REPORT_RUN`
- `PROXMOX_EXAMPLE_REPORT_OUTPUT_DIR`
- `PROXMOX_EXAMPLE_REPORT_FILENAME_PREFIX`

## 12) API quick-reference tables

### Services

| Service | Primary methods (non-exhaustive) | Typical use |
|---|---|---|
| `datacenter_service` | `getSummary`, `getVersion`, `listStorage` | cluster-level overview |
| `cluster_service` | `listNodes`, `allocateNextId`, `checkStorageCompatibility`, `checkBridgeCompatibility` | placement preflight inputs |
| `node_service` | `getNodeStatus`, `listBridges`, `canAllocateCores`, `canAllocateMemory`, `getNodeMetrics`, `rebootNode` | node capacity and operations |
| `vm_service` | `listVms`, `getVm`, lifecycle methods, `migrateVm`, `waitForTask` | VM lifecycle |
| `lxc_service` | lifecycle + shell + uploads + telemetry + report APIs | LXC automation |
| `lxc_expect_service` | `waitFor`, `sendAndExpect`, `runScript` | interactive automation |
| `access_service` | permission and privilege checks | ACL-aware workflows |
| `storage_service` | list/upload/download/delete content + permission checks | storage workflows |
| `pool_service` | `listPools`, `getPool`, `listPoolResources` | pool inventory |
| `ha_service` | list/add/update/remove resources, list groups | HA controls |
| `task_service` | `waitForTasks` | multi-task convergence |
| `dr_service` | replication/backup discovery + readiness | DR posture checks |

### Helper facade (`client.helpers`)

| Helper method | Typical use |
|---|---|
| `createLxcContainer` | create orchestration with preflight |
| `teardownAndDestroyLxcContainer` | stop/delete orchestration |
| `createLxcContainersBulk` | batch create |
| `teardownAndDestroyLxcContainersBulk` | batch destroy |
| `preflightLxcCreateCluster` | candidate validation/ranking |
| `planLxcPlacement` | LXC placement recommendation |
| `planVmPlacement` | VM placement recommendation |
| `migrateLxcWithPreflight` | safe LXC migration orchestration |
| `migrateVmWithPreflight` | safe VM migration orchestration |
| `prepareNodeMaintenance` | drain planning |
| `drainNode` | controlled drain execution |

### LXC report section IDs

| Section ID |
|---|
| `system_info` |
| `cron_jobs` |
| `processes` |
| `tcp_ports` |
| `udp_ports` |
| `services` |
| `hardware` |
| `disk` |
| `memory` |
| `cpu` |
| `identity` |
| `firewall` |
| `devtools` |

## 13) Known limitations and caveats

- LXC telemetry reflects container-visible namespaces/cgroups, not always full host visibility.
- Tooling commands vary by distro/image and may be partially unavailable.
- Firewall posture/security findings are best-effort interpretation, not formal policy proof.
- Procfs-based collection can return partial results due to permissions/races.
- High-detail enrichment can be expensive on large systems if limits are not tuned.

## 14) Canonical exports

Use [`src/index.ts`](src/index.ts) as the source of truth for exported classes/types/functions.

Primary exported classes:

- `ProxmoxClient`
- `DatacenterService`
- `ClusterService`
- `NodeService`
- `VmService`
- `LxcService`
- `LxcExpectService`
- `AccessService`
- `StorageService`
- `PoolService`
- `HaService`
- `TaskService`
- `DrService`
- `ClusterOrchestrationHelper`
- `NodeMaintenanceHelper`
- `LxcHelper`
- `LxcBulkHelper`
- `LxcClusterPreflightHelper`
- `LxcDestroyHelper`
- `ProxmoxHelpers`

## Disclaimer

This project is for personal, evolving use. Stability is not guaranteed, behavior and interfaces may change at any time, and usage is at your own risk.
