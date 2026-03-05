import { createHash } from "node:crypto";
import { ProxmoxAuthError } from "../../errors/proxmox_error";
import { proxmox_auth_provider_i } from "./auth_provider_i";
import { ResolveSopsToken } from "./sops_token_resolver";

export interface sops_auth_provider_input_i {
  token_id: string;
  secret_ref: string;
}

export class SopsAuthProvider implements proxmox_auth_provider_i {
  public readonly token_id: string;
  public readonly secret_ref: string;

  constructor(params: sops_auth_provider_input_i) {
    this.token_id = params.token_id;
    this.secret_ref = params.secret_ref;
  }

  public async GetAuthHeader(): Promise<string> {
    const token = this.ResolveToken();
    return `PVEAPIToken ${this.token_id}=${token}`;
  }

  public async GetTokenFingerprint(): Promise<string> {
    const token = this.ResolveToken();
    return createHash("sha256").update(token).digest("hex").slice(0, 12);
  }

  private ResolveToken(): string {
    try {
      return ResolveSopsToken({
        secret_ref: this.secret_ref,
      });
    } catch (error) {
      if (error instanceof ProxmoxAuthError) {
        throw error;
      }

      throw new ProxmoxAuthError({
        code: "proxmox.auth.invalid_token",
        message: "Could not resolve token from SOPS.",
        details: {
          field: "auth.secret_ref",
        },
        cause: error,
      });
    }
  }
}
