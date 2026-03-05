import { proxmox_http_request_t, proxmox_http_response_t } from "../../types/proxmox_http_types";

export interface prox_mox_http_transport_i {
  Request(
    params: {
      request: proxmox_http_request_t;
      context: {
        base_url: string;
        verify_tls: boolean;
        keep_alive_ms: number;
        ca_bundle_path?: string;
        request_timeout_ms?: number;
      };
    },
  ): Promise<proxmox_http_response_t>;
}
