import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_access_permissions_query_i,
  proxmox_access_permissions_target_query_i,
  proxmox_access_privileges_t,
  proxmox_access_permissions_response_t,
  proxmox_access_privilege_check_query_i,
  proxmox_access_privilege_check_target_query_i,
  proxmox_access_privilege_check_response_t,
} from "../types/proxmox_service_types";

export interface access_service_input_i {
  request_client: proxmox_request_client_i;
}

export class AccessService {
  public readonly request_client: proxmox_request_client_i;

  constructor(params: access_service_input_i) {
    this.request_client = params.request_client;
  }

  public async getCurrentPermissions(
    params: proxmox_access_permissions_query_i,
  ): Promise<proxmox_access_permissions_response_t> {
    return this.getPermissions({
      path: params.path,
    });
  }

  public async getIdentityPermissions(
    params: proxmox_access_permissions_target_query_i,
  ): Promise<proxmox_access_permissions_response_t> {
    return this.getPermissions({
      path: params.path,
      auth_id: params.auth_id,
    });
  }

  public async hasCurrentPrivilege(
    params: proxmox_access_privilege_check_query_i,
  ): Promise<proxmox_access_privilege_check_response_t> {
    return this.hasPrivilege({
      path: params.path,
      privilege: params.privilege,
    });
  }

  public async hasIdentityPrivilege(
    params: proxmox_access_privilege_check_target_query_i,
  ): Promise<proxmox_access_privilege_check_response_t> {
    return this.hasPrivilege({
      path: params.path,
      privilege: params.privilege,
      auth_id: params.auth_id,
    });
  }

  private async getPermissions(params: {
    path: string;
    auth_id?: string;
  }): Promise<proxmox_access_permissions_response_t> {
    const requested_path = NormalizePermissionsPath(params.path);
    const auth_id = params.auth_id === undefined ? undefined : ValidateAuthId(params.auth_id);

    const query: { path: string; userid?: string } = {
      path: requested_path,
    };
    if (auth_id !== undefined) {
      query.userid = auth_id;
    }

    const response = await this.request_client.Request<unknown>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/access/permissions",
      query,
      retry_allowed: true,
    });

    const raw_permissions = ExtractPermissionSourceMap({
      raw_permissions: response.data,
      requested_path,
    });
    const privileges = NormalizePrivileges(raw_permissions);

    return {
      ...response,
      data: {
        requested_path,
        identity: auth_id === undefined ? "current" : "target",
        auth_id,
        privileges,
        raw_permissions,
      },
    };
  }

  private async hasPrivilege(params: {
    path: string;
    privilege: string;
    auth_id?: string;
  }): Promise<proxmox_access_privilege_check_response_t> {
    const normalized_privilege = ValidatePrivilegeName(params.privilege);
    const permission_response = await this.getPermissions({
      path: params.path,
      auth_id: params.auth_id,
    });

    return {
      ...permission_response,
      data: {
        requested_path: permission_response.data.requested_path,
        identity: permission_response.data.identity,
        auth_id: permission_response.data.auth_id,
        privilege: normalized_privilege,
        allowed: permission_response.data.privileges[normalized_privilege] === true,
        privileges: permission_response.data.privileges,
      },
    };
  }
}

function NormalizePermissionsPath(path: string): string {
  const normalized = path.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "path is required and cannot be empty.",
      details: {
        field: "path",
      },
    });
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function ValidatePrivilegeName(privilege: string): string {
  const normalized = privilege.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "privilege is required and cannot be empty.",
      details: {
        field: "privilege",
      },
    });
  }
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "privilege contains unsupported characters.",
      details: {
        field: "privilege",
      },
    });
  }
  return normalized;
}

function ValidateAuthId(auth_id: string): string {
  const normalized = auth_id.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "auth_id is required and cannot be empty.",
      details: {
        field: "auth_id",
      },
    });
  }
  if (/\s/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "auth_id must not contain whitespace.",
      details: {
        field: "auth_id",
      },
    });
  }

  const token_segments = normalized.split("!");
  if (token_segments.length > 2) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "auth_id format is invalid.",
      details: {
        field: "auth_id",
      },
    });
  }

  const user_id = token_segments[0];
  const token_id = token_segments.length === 2 ? token_segments[1] : undefined;

  if (!IsValidUserId(user_id)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "auth_id user segment is invalid.",
      details: {
        field: "auth_id",
      },
    });
  }
  if (token_id !== undefined && !token_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "auth_id token segment is invalid.",
      details: {
        field: "auth_id",
      },
    });
  }
  return normalized;
}

function IsValidUserId(user_id: string): boolean {
  const trimmed = user_id.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }
  const last_at_index = trimmed.lastIndexOf("@");
  if (last_at_index <= 0 || last_at_index === trimmed.length - 1) {
    return false;
  }
  return true;
}

function ExtractPermissionSourceMap(params: {
  raw_permissions: unknown;
  requested_path: string;
}): Record<string, unknown> {
  if (!IsRecord(params.raw_permissions)) {
    return {};
  }

  if (IsRecord(params.raw_permissions.privs)) {
    return ResolvePermissionSourceForPath({
      permission_source: params.raw_permissions.privs,
      requested_path: params.requested_path,
    });
  }
  if (IsRecord(params.raw_permissions.privileges)) {
    return ResolvePermissionSourceForPath({
      permission_source: params.raw_permissions.privileges,
      requested_path: params.requested_path,
    });
  }
  return ResolvePermissionSourceForPath({
    permission_source: params.raw_permissions,
    requested_path: params.requested_path,
  });
}

function ResolvePermissionSourceForPath(params: {
  permission_source: Record<string, unknown>;
  requested_path: string;
}): Record<string, unknown> {
  if (!ContainsPathMap(params.permission_source)) {
    return params.permission_source;
  }

  const candidates = BuildPathCandidates(params.requested_path);
  const normalized_permission_source = new Map<string, Record<string, unknown>>();
  for (const [path_key, path_value] of Object.entries(params.permission_source)) {
    if (!IsRecord(path_value)) {
      continue;
    }
    normalized_permission_source.set(NormalizePermissionPath(path_key), path_value);
  }

  for (const candidate_path of candidates) {
    const matched = normalized_permission_source.get(candidate_path);
    if (matched !== undefined) {
      return matched;
    }
  }

  return {};
}

function ContainsPathMap(permission_source: Record<string, unknown>): boolean {
  for (const [path_key, path_value] of Object.entries(permission_source)) {
    if (!path_key.startsWith("/")) {
      continue;
    }
    if (IsRecord(path_value)) {
      return true;
    }
  }
  return false;
}

function BuildPathCandidates(requested_path: string): string[] {
  const candidates: string[] = [];
  const normalized_requested_path = NormalizePermissionPath(requested_path);
  candidates.push(normalized_requested_path);
  if (normalized_requested_path === "/") {
    return candidates;
  }

  const segments = normalized_requested_path.split("/").filter((segment) => segment.length > 0);
  while (segments.length > 1) {
    segments.pop();
    candidates.push(`/${segments.join("/")}`);
  }
  candidates.push("/");
  return candidates;
}

function NormalizePermissionPath(path_value: string): string {
  const trimmed = path_value.trim();
  if (!trimmed) {
    return "/";
  }
  const with_prefix = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (with_prefix.length === 1) {
    return with_prefix;
  }
  return with_prefix.replace(/\/+$/, "");
}

function NormalizePrivileges(raw_permissions: Record<string, unknown>): proxmox_access_privileges_t {
  const privileges: proxmox_access_privileges_t = {};
  for (const [privilege_name, privilege_value] of Object.entries(raw_permissions)) {
    const normalized_boolean = ToBoolean(privilege_value);
    if (normalized_boolean !== undefined) {
      privileges[privilege_name] = normalized_boolean;
    }
  }
  return privileges;
}

function ToBoolean(raw_value: unknown): boolean | undefined {
  if (typeof raw_value === "boolean") {
    return raw_value;
  }
  if (typeof raw_value === "number") {
    return raw_value !== 0;
  }
  if (typeof raw_value === "string") {
    if (raw_value === "1" || raw_value.toLowerCase() === "true") {
      return true;
    }
    if (raw_value === "0" || raw_value.toLowerCase() === "false") {
      return false;
    }
  }
  return undefined;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
