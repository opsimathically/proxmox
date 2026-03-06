import { TaskPoller } from "../core/task/task_poller";
import { FetchHttpTransport } from "../core/http/fetch_http_transport";
import { ProxmoxApiParser, proxmox_api_parser_i } from "../core/parser/proxmox_api_parser";
import { prox_mox_http_transport_i } from "../core/http/proxmox_http_transport_i";
import {
  proxmox_request_client_i,
  ProxmoxRequestClient,
  BuildRequestClientNode,
} from "../core/request/proxmox_request_client";
import {
  LoadConfig,
  ResolveProfile,
  ResolveConfigPath,
  EmitStartupDiagnostics,
  proxmox_config_diagnostic_logging_i,
} from "../config/proxmox_config";
import {
  proxmoxlib_resolved_config_t,
  proxmox_cluster_t,
  proxmox_node_t,
  proxmox_profile_resolved_t,
} from "../types/proxmox_config_types";
import { DatacenterService } from "../services/datacenter_service";
import { ClusterService } from "../services/cluster_service";
import { NodeService } from "../services/node_service";
import { VmService } from "../services/vm_service";
import { LxcService } from "../services/lxc_service";
import { AccessService } from "../services/access_service";
import { StorageService } from "../services/storage_service";
import { PoolService } from "../services/pool_service";
import { LxcHelper } from "../helpers/lxc_helper";
import { ProxmoxHelpers } from "../helpers/proxmox_helpers";
import { ProxmoxError } from "../errors/proxmox_error";

export interface proxmox_client_input_i {
  config: proxmoxlib_resolved_config_t;
  profile_name?: string;
  transport?: prox_mox_http_transport_i;
  parser?: proxmox_api_parser_i;
  task_poller?: TaskPoller;
}

export interface proxmox_client_factory_i {
  config_path?: string;
  profile_name?: string;
  transport?: prox_mox_http_transport_i;
  parser?: proxmox_api_parser_i;
  task_poller?: TaskPoller;
  emit_startup_diagnostics?: boolean;
  diagnostics_logger?: proxmox_config_diagnostic_logging_i;
}

export class ProxmoxClient {
  public readonly config: proxmoxlib_resolved_config_t;
  public readonly profile_name: string;
  public readonly profile: proxmox_profile_resolved_t;
  public readonly cluster: proxmox_cluster_t;
  public readonly request_client: proxmox_request_client_i;
  public readonly transport: prox_mox_http_transport_i;
  public readonly parser: proxmox_api_parser_i;
  public readonly task_poller?: TaskPoller;
  public readonly datacenter_service: DatacenterService;
  public readonly cluster_service: ClusterService;
  public readonly node_service: NodeService;
  public readonly vm_service: VmService;
  public readonly lxc_service: LxcService;
  public readonly access_service: AccessService;
  public readonly storage_service: StorageService;
  public readonly pool_service: PoolService;
  public readonly helpers: ProxmoxHelpers;

  constructor(params: proxmox_client_input_i) {
    this.config = params.config;
    this.profile_name = params.profile_name ?? this.config.active_profile;
    this.profile = ResolveProfile({
      config: this.config,
      profile_name: this.profile_name,
    });
    this.cluster = this.resolveCluster({
      profile: this.profile,
      config: this.config,
    });
    this.transport = params.transport
      ?? new FetchHttpTransport({
        keep_alive_ms_default: this.profile.transport.keep_alive_ms,
        verify_tls_default: this.profile.transport.verify_tls,
        request_timeout_ms_default: this.profile.transport.request_timeout_ms,
      });
    this.parser = params.parser ?? new ProxmoxApiParser();
    this.request_client = this.buildRequestClient();
    this.task_poller = params.task_poller ?? this.buildTaskPoller();

    this.datacenter_service = new DatacenterService({
      request_client: this.request_client,
    });
    this.cluster_service = new ClusterService({
      request_client: this.request_client,
    });
    this.pool_service = new PoolService({
      request_client: this.request_client,
    });
    this.node_service = new NodeService({
      request_client: this.request_client,
      task_poller: this.task_poller,
      task_polling_enabled: this.profile.task_poller.enabled,
      task_poll_options: {
        interval_ms: this.profile.task_poller.poll_interval_ms,
        timeout_ms: this.profile.task_poller.poll_timeout_ms,
        max_poll_failures: this.profile.task_poller.max_poll_failures,
      },
    });
    this.vm_service = new VmService({
      request_client: this.request_client,
      task_poller: this.task_poller,
      task_polling_enabled: this.profile.task_poller.enabled,
      task_poll_options: {
        interval_ms: this.profile.task_poller.poll_interval_ms,
        timeout_ms: this.profile.task_poller.poll_timeout_ms,
        max_poll_failures: this.profile.task_poller.max_poll_failures,
      },
    });
    this.lxc_service = new LxcService({
      request_client: this.request_client,
      task_poller: this.task_poller,
      task_polling_enabled: this.profile.task_poller.enabled,
      task_poll_options: {
        interval_ms: this.profile.task_poller.poll_interval_ms,
        timeout_ms: this.profile.task_poller.poll_timeout_ms,
        max_poll_failures: this.profile.task_poller.max_poll_failures,
      },
    });
    this.access_service = new AccessService({
      request_client: this.request_client,
    });
    this.storage_service = new StorageService({
      request_client: this.request_client,
      access_service: this.access_service,
    });
    this.helpers = new ProxmoxHelpers({
      lxc_helper: new LxcHelper({
        request_client: this.request_client,
        lxc_service: this.lxc_service,
        node_service: this.node_service,
        datacenter_service: this.datacenter_service,
        pool_service: this.pool_service,
      }),
    });
  }

  public static fromPath(params: proxmox_client_factory_i = {}): ProxmoxClient {
    const config_path = ResolveConfigPath(params.config_path);
    const diagnostics_requested = params.emit_startup_diagnostics === true
      || ["1", "true", "yes", "on"].includes((process.env.PROXMOXLIB_STARTUP_DIAGNOSTICS ?? "").toLowerCase());
    const config = LoadConfig({
      config_path,
    });
    if (diagnostics_requested) {
      EmitStartupDiagnostics({
        config,
        profile_name: params.profile_name,
        config_path,
        logger: params.diagnostics_logger,
      });
    }
    return new ProxmoxClient({
      config,
      profile_name: params.profile_name,
      transport: params.transport,
      parser: params.parser,
      task_poller: params.task_poller,
    });
  }

  private resolveCluster(params: {
    profile: proxmox_profile_resolved_t;
    config: proxmoxlib_resolved_config_t;
  }): proxmox_cluster_t {
    const cluster = params.config.clusters.find((proxmox_cluster) => proxmox_cluster.id === params.profile.cluster_id);
    if (!cluster) {
      throw new ProxmoxError({
        code: "proxmox.config.cluster_not_found",
        message: "Resolved profile cluster_id is missing.",
        details: {
          field: "profile.cluster_id",
          value: params.profile.cluster_id,
        },
      });
    }
    return cluster;
  }

  private buildTaskPoller(): TaskPoller | undefined {
    if (!this.profile.task_poller.enabled) {
      return undefined;
    }

    return new TaskPoller({
      transport: this.transport,
      parser: this.parser,
    });
  }

  private buildRequestClient(): proxmox_request_client_i {
    const nodes = this.cluster.nodes.map((proxmox_node: proxmox_node_t) => {
      const verify_tls = proxmox_node.verify_tls ?? this.profile.transport.verify_tls;
      const ca_bundle_path = proxmox_node.ca_bundle_path ?? this.profile.transport.ca_bundle_path;
      return BuildRequestClientNode({
        node_id: proxmox_node.id,
        host: proxmox_node.host,
        protocol: proxmox_node.protocol ?? "https",
        port: proxmox_node.port,
        verify_tls,
        ca_bundle_path,
        auth: proxmox_node.auth,
        token_id: proxmox_node.token_id,
      });
    });

    const default_node_id = this.cluster.default_node ?? (nodes.length > 0 ? nodes[0].node_id : undefined);

    return new ProxmoxRequestClient({
      transport: this.transport,
      parser: this.parser,
      nodes,
      retry_policy: this.profile.retry_policy,
      default_node_id,
      request_timeout_ms: this.profile.transport.request_timeout_ms,
      keep_alive_ms: this.profile.transport.keep_alive_ms,
      default_headers: {
        "User-Agent": this.profile.transport.user_agent,
      },
    });
  }
}
