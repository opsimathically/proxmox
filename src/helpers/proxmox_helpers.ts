import {
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
} from "../types/proxmox_service_types";
import { LxcHelper } from "./lxc_helper";

export interface proxmox_helpers_input_i {
  lxc_helper: LxcHelper;
}

export class ProxmoxHelpers {
  public readonly lxc_helper: LxcHelper;

  constructor(params: proxmox_helpers_input_i) {
    this.lxc_helper = params.lxc_helper;
  }

  public async createLxcContainer(
    params: proxmox_lxc_helper_create_input_i,
  ): Promise<proxmox_lxc_helper_create_response_t> {
    return this.lxc_helper.createLxcContainer(params);
  }
}
