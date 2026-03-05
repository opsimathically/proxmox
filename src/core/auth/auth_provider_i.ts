export interface proxmox_auth_provider_i {
  GetAuthHeader(): Promise<string>;
  GetTokenFingerprint(): Promise<string>;
}
