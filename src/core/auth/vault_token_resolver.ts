import { readFileSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { ProxmoxAuthError } from "../../errors/proxmox_error";

const vault_request_timeout_ms = 10000;
const vault_response_max_bytes = 1024 * 1024;

interface vault_secret_ref_i {
  path: string;
  field: string;
}

interface vault_environment_i {
  vault_addr: string;
  vault_token: string;
  vault_namespace?: string;
  vault_ca_bundle?: string;
  vault_skip_verify: boolean;
}

export interface vault_token_resolver_input_i {
  secret_ref: string;
}

export async function ResolveVaultToken(params: vault_token_resolver_input_i): Promise<string> {
  const secret_ref = ParseVaultSecretRef(params.secret_ref);
  const vault_environment = LoadVaultEnvironment();
  const vault_url = BuildVaultSecretUrl({
    vault_addr: vault_environment.vault_addr,
    vault_path: secret_ref.path,
  });

  const request_headers: Record<string, string> = {
    "X-Vault-Token": vault_environment.vault_token,
  };
  if (vault_environment.vault_namespace) {
    request_headers["X-Vault-Namespace"] = vault_environment.vault_namespace;
  }

  const response = await SendVaultRequest({
    url: vault_url,
    headers: request_headers,
    timeout_ms: vault_request_timeout_ms,
    max_response_bytes: vault_response_max_bytes,
    ca_bundle: vault_environment.vault_ca_bundle,
    skip_verify: vault_environment.vault_skip_verify,
  });

  if (response.status_code < 200 || response.status_code >= 300) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret lookup request failed.",
      details: {
        field: "auth.secret_ref",
        value: "vault_http_error",
      },
    });
  }

  let parsed_body: unknown;
  try {
    parsed_body = JSON.parse(response.body);
  } catch (error) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret response was not valid JSON.",
      details: {
        field: "auth.secret_ref",
        value: "vault_response_invalid_json",
      },
      cause: error,
    });
  }

  const token = ExtractVaultTokenFromResponse({
    parsed_body,
    field_name: secret_ref.field,
  });

  if (!token) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret token field was empty.",
      details: {
        field: "auth.secret_ref",
        value: "vault_empty_token",
      },
    });
  }

  return token;
}

function ParseVaultSecretRef(secret_ref_raw: string): vault_secret_ref_i {
  const secret_ref = secret_ref_raw.trim();
  if (!secret_ref) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.missing_token",
      message: "Auth provider vault requires secret_ref.",
      details: {
        field: "auth.secret_ref",
        value: "missing_secret_ref",
      },
    });
  }

  if (/\s/.test(secret_ref)) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret_ref contains invalid whitespace.",
      details: {
        field: "auth.secret_ref",
        value: "invalid_secret_ref",
      },
    });
  }

  const hash_index = secret_ref.indexOf("#");
  const raw_path = (hash_index >= 0 ? secret_ref.slice(0, hash_index) : secret_ref).replace(/^\/+/, "");
  const raw_field = hash_index >= 0 ? secret_ref.slice(hash_index + 1) : "token";

  if (!raw_path || !raw_path.startsWith("kv/data/") || raw_path.endsWith("/")) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret_ref must use kv/data/<path>#<field> format.",
      details: {
        field: "auth.secret_ref",
        value: "invalid_secret_ref",
      },
    });
  }

  if (raw_path.includes("..")) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret_ref path is invalid.",
      details: {
        field: "auth.secret_ref",
        value: "invalid_secret_ref_path",
      },
    });
  }

  const field = raw_field.trim() || "token";
  if (!/^[A-Za-z0-9_.-]+$/.test(field)) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret_ref field name is invalid.",
      details: {
        field: "auth.secret_ref",
        value: "invalid_secret_ref_field",
      },
    });
  }

  return {
    path: raw_path,
    field,
  };
}

function LoadVaultEnvironment(): vault_environment_i {
  const vault_addr = process.env.VAULT_ADDR?.trim();
  if (!vault_addr) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.missing_token",
      message: "VAULT_ADDR is required for vault auth provider.",
      details: {
        field: "VAULT_ADDR",
        value: "missing_vault_addr",
      },
    });
  }

  const vault_token = process.env.VAULT_TOKEN?.trim();
  if (!vault_token) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.missing_token",
      message: "VAULT_TOKEN is required for vault auth provider.",
      details: {
        field: "VAULT_TOKEN",
        value: "missing_vault_token",
      },
    });
  }

  const vault_namespace = process.env.VAULT_NAMESPACE?.trim();
  const vault_skip_verify = ParseBooleanString(process.env.VAULT_SKIP_VERIFY);

  const vault_cacert = process.env.VAULT_CACERT?.trim();
  let vault_ca_bundle: string | undefined;
  if (vault_cacert) {
    try {
      vault_ca_bundle = readFileSync(vault_cacert, "utf8");
    } catch (error) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.invalid_token",
        message: "Could not read Vault CA bundle file from VAULT_CACERT.",
        details: {
          field: "VAULT_CACERT",
          value: "invalid_vault_cacert",
        },
        cause: error,
      });
    }
  }

  return {
    vault_addr,
    vault_token,
    vault_namespace,
    vault_ca_bundle,
    vault_skip_verify,
  };
}

function BuildVaultSecretUrl(params: {
  vault_addr: string;
  vault_path: string;
}): string {
  const base_url = params.vault_addr.replace(/\/+$/, "");
  const full_url = `${base_url}/v1/${params.vault_path}`;

  let parsed_url: URL;
  try {
    parsed_url = new URL(full_url);
  } catch (error) {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "VAULT_ADDR is not a valid URL.",
      details: {
        field: "VAULT_ADDR",
        value: "invalid_vault_addr",
      },
      cause: error,
    });
  }

  if (parsed_url.protocol !== "https:" && parsed_url.protocol !== "http:") {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "VAULT_ADDR must use http or https protocol.",
      details: {
        field: "VAULT_ADDR",
        value: "invalid_vault_protocol",
      },
    });
  }

  return parsed_url.toString();
}

async function SendVaultRequest(params: {
  url: string;
  headers: Record<string, string>;
  timeout_ms: number;
  max_response_bytes: number;
  ca_bundle?: string;
  skip_verify: boolean;
}): Promise<{ status_code: number; body: string }> {
  const parsed_url = new URL(params.url);
  const request_module = parsed_url.protocol === "https:" ? https : http;

  const request_options: https.RequestOptions = {
    method: "GET",
    headers: params.headers,
  };

  if (parsed_url.protocol === "https:") {
    request_options.rejectUnauthorized = !params.skip_verify;
    if (params.ca_bundle) {
      request_options.ca = params.ca_bundle;
    }
  }

  return new Promise((resolve, reject) => {
    const request = request_module.request(parsed_url, request_options, (response) => {
      const chunks: Buffer[] = [];
      let total_size = 0;

      response.on("data", (chunk: Buffer) => {
        total_size += chunk.length;
        if (total_size > params.max_response_bytes) {
          request.destroy(new Error("vault_response_too_large"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        resolve({
          status_code: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    request.on("error", (error) => {
      reject(
        new ProxmoxAuthError({
          code: "proxmox.auth.invalid_token",
          message: "Vault secret lookup request failed.",
          details: {
            field: "auth.secret_ref",
            value: "vault_request_failed",
          },
          cause: error,
        }),
      );
    });

    request.setTimeout(params.timeout_ms, () => {
      request.destroy(new Error("vault_request_timeout"));
    });

    request.end();
  });
}

function ExtractVaultTokenFromResponse(params: {
  parsed_body: unknown;
  field_name: string;
}): string {
  if (!params.parsed_body || typeof params.parsed_body !== "object") {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret response shape was invalid.",
      details: {
        field: "auth.secret_ref",
        value: "vault_response_shape_invalid",
      },
    });
  }

  const body_record = params.parsed_body as Record<string, unknown>;
  const data_outer = body_record.data;
  if (!data_outer || typeof data_outer !== "object") {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret response data was missing.",
      details: {
        field: "auth.secret_ref",
        value: "vault_response_data_missing",
      },
    });
  }

  const data_outer_record = data_outer as Record<string, unknown>;
  const data_inner = data_outer_record.data;
  if (!data_inner || typeof data_inner !== "object") {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret response payload was missing.",
      details: {
        field: "auth.secret_ref",
        value: "vault_response_payload_missing",
      },
    });
  }

  const data_inner_record = data_inner as Record<string, unknown>;
  const raw_token = data_inner_record[params.field_name];
  if (typeof raw_token !== "string") {
    throw new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: "Vault secret field was missing or invalid.",
      details: {
        field: "auth.secret_ref",
        value: "vault_field_missing",
      },
    });
  }

  return raw_token.trim();
}

function ParseBooleanString(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
