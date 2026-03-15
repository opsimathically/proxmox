import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { proxmox_auth_t } from "../../types/proxmox_config_types";
import { proxmox_http_method_t, proxmox_http_request_t } from "../../types/proxmox_http_types";
import { ProxmoxAuthError, ProxmoxPrivilegedFallbackError } from "../../errors/proxmox_error";
import { proxmox_api_parser_i } from "../parser/proxmox_api_parser";
import { prox_mox_http_transport_i } from "../http/proxmox_http_transport_i";
import { ResolveSopsToken } from "./sops_token_resolver";
import { ResolveVaultToken } from "./vault_token_resolver";

interface proxmox_session_ticket_cache_i {
  cookie_header: string;
  csrf_prevention_token: string;
  expires_at_epoch_ms: number;
  fingerprint: string;
}

export interface session_ticket_auth_provider_input_i {
  username: string;
  password_auth: proxmox_auth_t;
  protocol: "http" | "https";
  host: string;
  port?: number;
  verify_tls: boolean;
  ca_bundle_path?: string;
  request_timeout_ms: number;
  keep_alive_ms: number;
  transport: prox_mox_http_transport_i;
  parser: proxmox_api_parser_i;
  renew_skew_seconds?: number;
}

export class SessionTicketAuthProvider {
  public readonly username: string;
  public readonly password_auth: proxmox_auth_t;
  public readonly protocol: "http" | "https";
  public readonly host: string;
  public readonly port?: number;
  public readonly verify_tls: boolean;
  public readonly ca_bundle_path?: string;
  public readonly request_timeout_ms: number;
  public readonly keep_alive_ms: number;
  public readonly transport: prox_mox_http_transport_i;
  public readonly parser: proxmox_api_parser_i;
  public readonly renew_skew_seconds: number;
  private cached_ticket?: proxmox_session_ticket_cache_i;

  constructor(params: session_ticket_auth_provider_input_i) {
    this.username = params.username;
    this.password_auth = params.password_auth;
    this.protocol = params.protocol;
    this.host = params.host;
    this.port = params.port;
    this.verify_tls = params.verify_tls;
    this.ca_bundle_path = params.ca_bundle_path;
    this.request_timeout_ms = params.request_timeout_ms;
    this.keep_alive_ms = params.keep_alive_ms;
    this.transport = params.transport;
    this.parser = params.parser;
    this.renew_skew_seconds = params.renew_skew_seconds ?? 300;
  }

  public async getSessionHeaders(params: {
    method: proxmox_http_method_t;
    force_refresh?: boolean;
  }): Promise<Record<string, string>> {
    const ticket = await this.getSessionTicket({
      force_refresh: params.force_refresh === true,
    });
    const headers: Record<string, string> = {
      Cookie: ticket.cookie_header,
    };
    if (params.method !== "GET") {
      headers.CSRFPreventionToken = ticket.csrf_prevention_token;
    }
    return headers;
  }

  public async getSessionFingerprint(): Promise<string> {
    const ticket = await this.getSessionTicket({
      force_refresh: false,
    });
    return ticket.fingerprint;
  }

  private async getSessionTicket(params: { force_refresh: boolean }): Promise<proxmox_session_ticket_cache_i> {
    const now_ms = Date.now();
    if (!params.force_refresh && this.cached_ticket !== undefined && this.cached_ticket.expires_at_epoch_ms > now_ms) {
      return this.cached_ticket;
    }

    const password = await ResolveSecretFromAuth(this.password_auth);
    const request: proxmox_http_request_t = {
      method: "POST",
      path: "/api2/json/access/ticket",
      body: {
        username: this.username,
        password,
      },
      timeout_ms: this.request_timeout_ms,
    };
    const base_url = BuildNodeBaseUrl({
      protocol: this.protocol,
      host: this.host,
      port: this.port,
    });
    const response = await this.transport.request({
      request,
      context: {
        base_url,
        verify_tls: this.verify_tls,
        keep_alive_ms: this.keep_alive_ms,
        ca_bundle_path: this.ca_bundle_path,
        request_timeout_ms: this.request_timeout_ms,
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.ticket_acquisition_failed",
        message: "Could not obtain session ticket from Proxmox.",
        status_code: response.status,
      });
    }
    const parsed = this.parser.parseResponse<Record<string, unknown>>(response);
    const payload = IsRecord(parsed.data) ? parsed.data : {};
    const raw_ticket = payload.ticket;
    const raw_csrf = payload.CSRFPreventionToken;
    if (typeof raw_ticket !== "string" || raw_ticket.trim().length === 0) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.ticket_acquisition_failed",
        message: "Session ticket response was missing ticket value.",
        details: {
          field: "access.ticket.ticket",
        },
      });
    }
    if (typeof raw_csrf !== "string" || raw_csrf.trim().length === 0) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.ticket_acquisition_failed",
        message: "Session ticket response was missing CSRFPreventionToken.",
        details: {
          field: "access.ticket.CSRFPreventionToken",
        },
      });
    }

    const ticket_lifetime_ms = 2 * 60 * 60 * 1000;
    const skew_ms = Math.max(0, this.renew_skew_seconds * 1000);
    const expires_at_epoch_ms = now_ms + Math.max(10_000, ticket_lifetime_ms - skew_ms);
    const normalized_ticket = raw_ticket.trim();
    const session_ticket: proxmox_session_ticket_cache_i = {
      cookie_header: `PVEAuthCookie=${normalized_ticket}`,
      csrf_prevention_token: raw_csrf.trim(),
      expires_at_epoch_ms,
      fingerprint: createHash("sha256").update(normalized_ticket).digest("hex").slice(0, 12),
    };
    this.cached_ticket = session_ticket;
    return session_ticket;
  }
}

async function ResolveSecretFromAuth(auth: proxmox_auth_t): Promise<string> {
  if (auth.provider === "env") {
    if (!auth.env_var || auth.env_var.trim().length === 0) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.missing_token",
        message: "env auth provider requires env_var for session password.",
        details: {
          field: "auth.env_var",
        },
      });
    }
    const value = process.env[auth.env_var];
    if (!value || value.trim().length === 0) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.missing_token",
        message: "env auth variable for session password was missing or empty.",
        details: {
          field: auth.env_var,
        },
      });
    }
    return value.trim();
  }

  if (auth.provider === "file") {
    if (!auth.file_path || auth.file_path.trim().length === 0) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.missing_token",
        message: "file auth provider requires file_path for session password.",
        details: {
          field: "auth.file_path",
        },
      });
    }
    let file_value: string;
    try {
      file_value = readFileSync(auth.file_path, "utf8");
    } catch (error) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.invalid_token",
        message: "Could not read session password from file.",
        details: {
          field: "auth.file_path",
        },
        cause: error,
      });
    }
    const normalized_file_value = file_value.trim();
    if (normalized_file_value.length === 0) {
      throw new ProxmoxAuthError({
        code: "proxmox.auth.invalid_token",
        message: "Session password file was empty.",
        details: {
          field: "auth.file_path",
        },
      });
    }
    return normalized_file_value;
  }

  if (auth.provider === "vault") {
    return ResolveVaultToken({
      secret_ref: auth.secret_ref ?? "",
    });
  }

  if (auth.provider === "sops") {
    return ResolveSopsToken({
      secret_ref: auth.secret_ref ?? "",
    });
  }

  throw new ProxmoxPrivilegedFallbackError({
    code: "proxmox.auth.privileged_fallback_misconfigured",
    message: "Unsupported password provider for privileged session auth.",
    details: {
      field: "privileged_auth.password.provider",
      value: String(auth.provider),
    },
  });
}

function BuildNodeBaseUrl(params: {
  protocol: "http" | "https";
  host: string;
  port?: number;
}): string {
  if (params.port === undefined) {
    return `${params.protocol}://${params.host}`;
  }
  return `${params.protocol}://${params.host}:${params.port}`;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
