import { proxmox_auth_t } from "../../types/proxmox_config_types";
import { EnvironmentAuthProvider } from "./environment_auth_provider";
import { FileAuthProvider } from "./file_auth_provider";
import { VaultAuthProvider } from "./vault_auth_provider";
import { SopsAuthProvider } from "./sops_auth_provider";
import { ProxmoxAuthError } from "../../errors/proxmox_error";
import { proxmox_auth_provider_i } from "./auth_provider_i";

export function BuildAuthProvider(params: {
  token_id: string;
  auth: proxmox_auth_t;
}): proxmox_auth_provider_i {
  switch (params.auth.provider) {
    case "env":
      if (!params.auth.env_var) {
        throw new ProxmoxAuthError({
          code: "proxmox.auth.missing_token",
          message: "Auth provider env requires env_var.",
          details: {
            field: "auth.env_var",
          },
        });
      }
      return new EnvironmentAuthProvider({
        token_id: params.token_id,
        env_var: params.auth.env_var,
      });
    case "file":
      if (!params.auth.file_path) {
        throw new ProxmoxAuthError({
          code: "proxmox.auth.missing_token",
          message: "Auth provider file requires file_path.",
          details: {
            field: "auth.file_path",
          },
        });
      }
      return new FileAuthProvider({
        token_id: params.token_id,
        file_path: params.auth.file_path,
      });
    case "vault":
      if (!params.auth.secret_ref || !params.auth.secret_ref.trim()) {
        throw new ProxmoxAuthError({
          code: "proxmox.auth.missing_token",
          message: "Auth provider vault requires secret_ref.",
          details: {
            field: "auth.secret_ref",
          },
        });
      }
      return new VaultAuthProvider({
        token_id: params.token_id,
        secret_ref: params.auth.secret_ref.trim(),
      });
    case "sops":
      if (!params.auth.secret_ref || !params.auth.secret_ref.trim()) {
        throw new ProxmoxAuthError({
          code: "proxmox.auth.missing_token",
          message: "Auth provider sops requires secret_ref.",
          details: {
            field: "auth.secret_ref",
          },
        });
      }
      return new SopsAuthProvider({
        token_id: params.token_id,
        secret_ref: params.auth.secret_ref.trim(),
      });
    default:
      throw new ProxmoxAuthError({
        code: "proxmox.auth.unsupported_provider",
        message: "Unsupported auth provider.",
        details: {
          field: "auth.provider",
          value: params.auth.provider,
        },
      });
  }
}
