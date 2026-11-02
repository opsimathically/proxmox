export interface proxmox_auth_provider_i {
  getAuthHeader(): Promise<string>;
  getTokenFingerprint(): Promise<string>;
}
