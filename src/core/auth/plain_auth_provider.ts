import { createHash } from "node:crypto";
import { ProxmoxAuthError } from "../../errors/proxmox_error";
import { proxmox_auth_provider_i } from "./auth_provider_i";

export interface plain_auth_provider_input_i {
  token_id: string;
  plain_text: string;
}

export class PlainAuthProvider implements proxmox_auth_provider_i {
  public readonly token_id: string;
  public readonly plain_text: string;

  constructor(params: plain_auth_provider_input_i) {
    this.token_id = params.token_id;
    this.plain_text = params.plain_text;
  }

  public async getAuthHeader(): Promise<string> {
    const token = this.resolveToken();
    return `PVEAPIToken ${this.token_id}=${token}`;
  }

  public async getTokenFingerprint(): Promise<string> {
    const token = this.resolveToken();
    return createHash("sha256").update(token).digest("hex").slice(0, 12);
  }

  private resolveToken(): string {
    const normalized_plain_text = this.plain_text.trim();
    if (!normalized_plain_text) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.missing_token",
        message: "plain auth provider requires plain_text.",
        details: {
          field: "auth.plain_text",
        },
      });
    }
    return normalized_plain_text;
  }
}
