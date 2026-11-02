import assert from "node:assert";
import test from "node:test";
import {
  MapHttpStatusToProxmoxError,
  ProxmoxRateLimitError,
  ProxmoxAuthError,
  ProxmoxNotFoundError,
  ProxmoxConflictError,
  ProxmoxHttpError,
} from "../../src/errors/proxmox_error";

test("MapHttpStatusToProxmoxError maps transport status codes to typed errors.", () => {
  const auth_error = MapHttpStatusToProxmoxError({
    status_code: 401,
    message: "authentication failed",
  });
  assert.ok(auth_error instanceof ProxmoxAuthError);

  const not_found = MapHttpStatusToProxmoxError({
    status_code: 404,
    message: "missing",
  });
  assert.ok(not_found instanceof ProxmoxNotFoundError);

  const conflict = MapHttpStatusToProxmoxError({
    status_code: 409,
    message: "already exists",
  });
  assert.ok(conflict instanceof ProxmoxConflictError);

  const rate_limited = MapHttpStatusToProxmoxError({
    status_code: 429,
    message: "rate limited",
  });
  assert.ok(rate_limited instanceof ProxmoxRateLimitError);

  const server_error = MapHttpStatusToProxmoxError({
    status_code: 503,
    message: "server error",
  });
  assert.ok(server_error instanceof ProxmoxHttpError);
});
