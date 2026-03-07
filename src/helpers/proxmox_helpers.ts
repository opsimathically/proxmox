import {
  proxmox_lxc_helper_bulk_create_input_i,
  proxmox_lxc_helper_bulk_create_response_t,
  proxmox_lxc_helper_bulk_destroy_input_i,
  proxmox_lxc_helper_bulk_destroy_response_t,
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
  proxmox_lxc_helper_destroy_input_i,
  proxmox_lxc_helper_destroy_response_t,
} from "../types/proxmox_service_types";
import { LxcBulkHelper } from "./lxc_bulk_helper";
import { LxcHelper } from "./lxc_helper";
import { LxcDestroyHelper } from "./lxc_destroy_helper";

export interface proxmox_helpers_input_i {
  lxc_helper: LxcHelper;
  lxc_destroy_helper: LxcDestroyHelper;
  lxc_bulk_helper: LxcBulkHelper;
}

export class ProxmoxHelpers {
  public readonly lxc_helper: LxcHelper;
  public readonly lxc_destroy_helper: LxcDestroyHelper;
  public readonly lxc_bulk_helper: LxcBulkHelper;

  constructor(params: proxmox_helpers_input_i) {
    this.lxc_helper = params.lxc_helper;
    this.lxc_destroy_helper = params.lxc_destroy_helper;
    this.lxc_bulk_helper = params.lxc_bulk_helper;
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
}
