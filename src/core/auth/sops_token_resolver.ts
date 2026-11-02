import { execFileSync } from "node:child_process";
import { ProxmoxAuthError } from "../../errors/proxmox_error";

const sops_exec_timeout_ms = 10000;
const sops_exec_max_buffer_bytes = 1024 * 1024;

export interface sops_token_resolver_input_i {
  secret_ref: string;
}

export function ResolveSopsToken(params: sops_token_resolver_input_i): string {
  const secret_ref = params.secret_ref.trim();
  if (!secret_ref) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.missing_token",
      message: "Auth provider sops requires secret_ref.",
      details: {
        field: "auth.secret_ref",
        value: "missing_secret_ref",
      },
    });
  }

  let raw_token: string;
  try {
    raw_token = execFileSync(
      "sops",
      ["-d", "--output-type", "binary", secret_ref],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: sops_exec_timeout_ms,
        maxBuffer: sops_exec_max_buffer_bytes,
        windowsHide: true,
      },
    );
  } catch (error) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Could not decrypt auth token using SOPS.",
      details: {
        field: "auth.secret_ref",
        value: "decrypt_failed",
      },
      cause: error,
    });
  }

  const token = raw_token.trim();
  if (!token) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "SOPS decrypted token was empty.",
      details: {
        field: "auth.secret_ref",
        value: "empty_token",
      },
    });
  }

  return token;
}
