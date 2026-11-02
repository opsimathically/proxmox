import { createHash } from "node:crypto";
import { ProxmoxAuthError } from "../../errors/proxmox_error";
import { proxmox_auth_provider_i } from "./auth_provider_i";

export interface environment_auth_provider_input_i {
  token_id: string;
  env_var: string;
}

export class EnvironmentAuthProvider implements proxmox_auth_provider_i {
  public readonly token_id: string;
  public readonly env_var: string;

  constructor(params: environment_auth_provider_input_i) {
    this.token_id = params.token_id;
    this.env_var = params.env_var;
  }

  public async getAuthHeader(): Promise<string> {
    const secret = process.env[this.env_var];
    if (!secret || !secret.trim()) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.missing_token",
        message: "Environment auth var is missing or empty.",
        details: {
          field: "env_var",
          value: this.env_var,
        },
      });
    }
    return `PVEAPIToken ${this.token_id}=${secret.trim()}`;
  }

  public async getTokenFingerprint(): Promise<string> {
    const secret = process.env[this.env_var];
    if (!secret) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.missing_token",
        message: "Environment auth var is missing or empty.",
        details: {
          field: "env_var",
          value: this.env_var,
        },
      });
    }
    return createHash("sha256").update(secret).digest("hex").slice(0, 12);
  }
}
