import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ProxmoxAuthError } from "../../errors/proxmox_error";
import { proxmox_auth_provider_i } from "./auth_provider_i";

export interface file_auth_provider_input_i {
  token_id: string;
  file_path: string;
}

export class FileAuthProvider implements proxmox_auth_provider_i {
  public readonly token_id: string;
  public readonly file_path: string;

  constructor(params: file_auth_provider_input_i) {
    this.token_id = params.token_id;
    this.file_path = params.file_path;
  }

  public async getAuthHeader(): Promise<string> {
    return `PVEAPIToken ${this.token_id}=${this.resolveToken()}`;
  }

  public async getTokenFingerprint(): Promise<string> {
    const token = this.resolveToken();
    return createHash("sha256").update(token).digest("hex").slice(0, 12);
  }

  private resolveToken(): string {
    let raw_token: string;
    try {
      raw_token = readFileSync(this.file_path, "utf8");
    } catch (error) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.invalid_token",
        message: "Could not read auth token from file path.",
        details: {
          field: "file_path",
          value: this.file_path,
        },
        cause: error,
      });
    }

    const token = raw_token.trim();
    if (!token) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.invalid_token",
        message: "Auth token file was empty.",
        details: {
          field: "file_path",
          value: this.file_path,
        },
      });
    }

    return token;
  }
}
