import { createHash } from "node:crypto";
import { ProxmoxAuthError } from "../../errors/proxmox_error";
import { proxmox_auth_provider_i } from "./auth_provider_i";
import { ResolveVaultToken } from "./vault_token_resolver";

export interface vault_auth_provider_input_i {
  token_id: string;
  secret_ref: string;
}

export class VaultAuthProvider implements proxmox_auth_provider_i {
  public readonly token_id: string;
  public readonly secret_ref: string;

  constructor(params: vault_auth_provider_input_i) {
    this.token_id = params.token_id;
    this.secret_ref = params.secret_ref;
  }

  public async getAuthHeader(): Promise<string> {
    const token = await this.resolveToken();
    return `PVEAPIToken ${this.token_id}=${token}`;
  }

  public async getTokenFingerprint(): Promise<string> {
    const token = await this.resolveToken();
    return createHash("sha256").update(token).digest("hex").slice(0, 12);
  }

  private async resolveToken(): Promise<string> {
    try {
      return await ResolveVaultToken({
        secret_ref: this.secret_ref,
      });
    } catch (error) {
      if (error instanceof ProxmoxAuthError) {
        throw error;
      }

      throw new ProxmoxAuthError({
        code: "proxmox.auth.invalid_token",
        message: "Could not resolve token from Vault.",
        details: {
          field: "auth.secret_ref",
        },
        cause: error,
      });
    }
  }
}
