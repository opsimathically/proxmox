import assert from "node:assert";
import test from "node:test";
import { SshPctLxcShellBackend } from "../../src/core/lxc_shell/ssh_pct_lxc_shell_backend";

test("SshPctLxcShellBackend initializes with no active sessions.", () => {
  const backend = new SshPctLxcShellBackend();
  assert.equal(backend.ownsSession("missing-session"), false);
  assert.equal(
    backend.getSession({
      session_id: "missing-session",
    }),
    undefined,
  );
});
