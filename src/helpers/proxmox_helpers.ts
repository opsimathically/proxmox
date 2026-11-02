import {
  proxmox_lxc_migration_with_preflight_input_i,
  proxmox_lxc_migration_with_preflight_response_t,
  proxmox_lxc_cluster_preflight_input_i,
  proxmox_lxc_cluster_preflight_response_t,
  proxmox_lxc_helper_bulk_create_input_i,
  proxmox_lxc_helper_bulk_create_response_t,
  proxmox_lxc_helper_bulk_destroy_input_i,
  proxmox_lxc_helper_bulk_destroy_response_t,
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
  proxmox_lxc_helper_destroy_input_i,
  proxmox_lxc_helper_destroy_response_t,
  proxmox_lxc_placement_plan_input_i,
  proxmox_lxc_placement_plan_response_t,
  proxmox_vm_migration_with_preflight_input_i,
  proxmox_vm_migration_with_preflight_response_t,
  proxmox_vm_placement_plan_input_i,
  proxmox_vm_placement_plan_response_t,
  proxmox_node_maintenance_prepare_input_i,
  proxmox_node_maintenance_plan_response_t,
  proxmox_node_drain_input_i,
  proxmox_node_drain_response_t,
} from "../types/proxmox_service_types";
import { ClusterOrchestrationHelper } from "./cluster_orchestration_helper";
import { LxcBulkHelper } from "./lxc_bulk_helper";
import { LxcClusterPreflightHelper } from "./lxc_cluster_preflight_helper";
import { LxcHelper } from "./lxc_helper";
import { LxcDestroyHelper } from "./lxc_destroy_helper";
import { NodeMaintenanceHelper } from "./node_maintenance_helper";

export interface proxmox_helpers_input_i {
  lxc_helper: LxcHelper;
  lxc_destroy_helper: LxcDestroyHelper;
  lxc_bulk_helper: LxcBulkHelper;
  lxc_cluster_preflight_helper: LxcClusterPreflightHelper;
  cluster_orchestration_helper: ClusterOrchestrationHelper;
  node_maintenance_helper: NodeMaintenanceHelper;
}

export class ProxmoxHelpers {
  public readonly lxc_helper: LxcHelper;
  public readonly lxc_destroy_helper: LxcDestroyHelper;
  public readonly lxc_bulk_helper: LxcBulkHelper;
  public readonly lxc_cluster_preflight_helper: LxcClusterPreflightHelper;
  public readonly cluster_orchestration_helper: ClusterOrchestrationHelper;
  public readonly node_maintenance_helper: NodeMaintenanceHelper;

  constructor(params: proxmox_helpers_input_i) {
    this.lxc_helper = params.lxc_helper;
    this.lxc_destroy_helper = params.lxc_destroy_helper;
    this.lxc_bulk_helper = params.lxc_bulk_helper;
    this.lxc_cluster_preflight_helper = params.lxc_cluster_preflight_helper;
    this.cluster_orchestration_helper = params.cluster_orchestration_helper;
    this.node_maintenance_helper = params.node_maintenance_helper;
  }

  public async createLxcContainer(
    params: proxmox_lxc_helper_create_input_i,
  ): Promise<proxmox_lxc_helper_create_response_t> {
    return this.lxc_helper.createLxcContainer(params);
  }

  public async teardownAndDestroyLxcContainer(
    params: proxmox_lxc_helper_destroy_input_i,
  ): Promise<proxmox_lxc_helper_destroy_response_t> {
    return this.lxc_destroy_helper.teardownAndDestroyLxcContainer(params);
  }

  public async createLxcContainersBulk(
    params: proxmox_lxc_helper_bulk_create_input_i,
  ): Promise<proxmox_lxc_helper_bulk_create_response_t> {
    return this.lxc_bulk_helper.createLxcContainersBulk(params);
  }

  public async teardownAndDestroyLxcContainersBulk(
    params: proxmox_lxc_helper_bulk_destroy_input_i,
  ): Promise<proxmox_lxc_helper_bulk_destroy_response_t> {
    return this.lxc_bulk_helper.teardownAndDestroyLxcContainersBulk(params);
  }

  public async preflightLxcCreateCluster(
    params: proxmox_lxc_cluster_preflight_input_i,
  ): Promise<proxmox_lxc_cluster_preflight_response_t> {
    return this.lxc_cluster_preflight_helper.preflightLxcCreateCluster(params);
  }

  public async planLxcPlacement(
    params: proxmox_lxc_placement_plan_input_i,
  ): Promise<proxmox_lxc_placement_plan_response_t> {
    return this.cluster_orchestration_helper.planLxcPlacement(params);
  }

  public async planVmPlacement(
    params: proxmox_vm_placement_plan_input_i,
  ): Promise<proxmox_vm_placement_plan_response_t> {
    return this.cluster_orchestration_helper.planVmPlacement(params);
  }

  public async migrateLxcWithPreflight(
    params: proxmox_lxc_migration_with_preflight_input_i,
  ): Promise<proxmox_lxc_migration_with_preflight_response_t> {
    return this.cluster_orchestration_helper.migrateLxcWithPreflight(params);
  }

  public async migrateVmWithPreflight(
    params: proxmox_vm_migration_with_preflight_input_i,
  ): Promise<proxmox_vm_migration_with_preflight_response_t> {
    return this.cluster_orchestration_helper.migrateVmWithPreflight(params);
  }

  public async prepareNodeMaintenance(
    params: proxmox_node_maintenance_prepare_input_i,
  ): Promise<proxmox_node_maintenance_plan_response_t> {
    return this.node_maintenance_helper.prepareNodeMaintenance(params);
  }

  public async drainNode(
    params: proxmox_node_drain_input_i,
  ): Promise<proxmox_node_drain_response_t> {
    return this.node_maintenance_helper.drainNode(params);
  }
}
