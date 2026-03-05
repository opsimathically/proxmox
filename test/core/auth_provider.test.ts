import assert from "node:assert";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as http from "node:http";
import { IncomingHttpHeaders } from "node:http";
import { BuildAuthProvider } from "../../src/core/auth/proxmox_auth_factory";

interface vault_request_capture_i {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
}

interface vault_server_output_i {
  base_url: string;
  requests: vault_request_capture_i[];
  close: () => Promise<void>;
}

async function StartVaultServer(params: {
  status_code: number;
  body: string;
}): Promise<vault_server_output_i> {
  const requests: vault_request_capture_i[] = [];
  const server = http.createServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
    });
    response.statusCode = params.status_code;
    response.setHeader("content-type", "application/json");
    response.end(params.body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve local vault test server address.");
  }

  return {
    base_url: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function WithEnvironment(params: {
  values: Record<string, string | undefined>;
  run: () => Promise<void>;
}): Promise<void> {
  const previous_values: Record<string, string | undefined> = {};
  for (const key of Object.keys(params.values)) {
    previous_values[key] = process.env[key];
  }

  for (const [key, value] of Object.entries(params.values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await params.run();
  } finally {
    for (const [key, value] of Object.entries(previous_values)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function WithStubbedSopsBinary(params: {
  script_body: string;
  run: () => Promise<void>;
}): Promise<void> {
  const scratch_dir = mkdtempSync(join(tmpdir(), "proxmoxlib-sops-bin-"));
  const sops_path = join(scratch_dir, "sops");
  writeFileSync(sops_path, params.script_body, { mode: 0o700 });
  chmodSync(sops_path, 0o700);

  const original_path = process.env.PATH;
  process.env.PATH = original_path
    ? `${scratch_dir}:${original_path}`
    : scratch_dir;

  return params.run().finally(() => {
    if (original_path === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = original_path;
    }
    rmSync(scratch_dir, { recursive: true, force: true });
  });
}

test("BuildAuthProvider returns the env provider when configured.", async () => {
  await WithEnvironment({
    values: {
      PROXMOX_TOKEN: "token_value",
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "env",
          env_var: "PROXMOX_TOKEN",
        },
      });

      assert.equal(await provider.GetAuthHeader(), "PVEAPIToken root@pam!builder=token_value");
      assert.equal((await provider.GetTokenFingerprint()).length, 12);
    },
  });
});

test("BuildAuthProvider throws auth error when env var is missing.", async () => {
  await WithEnvironment({
    values: {
      PROXMOX_TOKEN_MISSING: undefined,
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "env",
          env_var: "PROXMOX_TOKEN_MISSING",
        },
      });

      await assert.rejects(
        async () => provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /missing/i,
        },
      );
    },
  });
});

test("BuildAuthProvider loads token from file and derives header.", async () => {
  const scratch_dir = mkdtempSync(join(tmpdir(), "proxmoxlib-auth-"));
  const token_path = join(scratch_dir, "token.txt");
  writeFileSync(token_path, "file_token_value");

  const provider = BuildAuthProvider({
    token_id: "root@pam!builder",
    auth: {
      provider: "file",
      file_path: token_path,
    },
  });

  assert.equal(await provider.GetAuthHeader(), "PVEAPIToken root@pam!builder=file_token_value");
  assert.equal((await provider.GetTokenFingerprint()).length, 12);

  rmSync(scratch_dir, { recursive: true, force: true });
});

test("BuildAuthProvider rejects unresolved file token path.", async () => {
  const provider = BuildAuthProvider({
    token_id: "root@pam!builder",
    auth: {
      provider: "file",
      file_path: "/nonexistent/proxmox-token-does-not-exist.txt",
    },
  });

  await assert.rejects(
    async () => provider.GetAuthHeader(),
    {
      name: "ProxmoxAuthError",
      message: /Could not read auth token/i,
    },
  );
});

test("BuildAuthProvider rejects vault provider when secret_ref is missing.", () => {
  assert.throws(
    () =>
      BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
        },
      }),
    {
      name: "ProxmoxAuthError",
      message: /requires secret_ref/i,
    },
  );
});

test("BuildAuthProvider rejects vault provider when secret_ref is blank.", () => {
  assert.throws(
    () =>
      BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "   ",
        },
      }),
    {
      name: "ProxmoxAuthError",
      message: /requires secret_ref/i,
    },
  );
});

test("BuildAuthProvider surfaces missing VAULT_ADDR for vault provider.", async () => {
  await WithEnvironment({
    values: {
      VAULT_ADDR: undefined,
      VAULT_TOKEN: "vault-access-token",
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "kv/data/proxmox/node-a#token",
        },
      });

      await assert.rejects(
        async () => provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /VAULT_ADDR is required/i,
        },
      );
    },
  });
});

test("BuildAuthProvider surfaces missing VAULT_TOKEN for vault provider.", async () => {
  await WithEnvironment({
    values: {
      VAULT_ADDR: "http://127.0.0.1:8200",
      VAULT_TOKEN: undefined,
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "kv/data/proxmox/node-a#token",
        },
      });

      await assert.rejects(
        async () => provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /VAULT_TOKEN is required/i,
        },
      );
    },
  });
});

test("BuildAuthProvider surfaces vault HTTP non-success responses.", async () => {
  const vault_server = await StartVaultServer({
    status_code: 403,
    body: JSON.stringify({ errors: ["permission denied"] }),
  });

  await WithEnvironment({
    values: {
      VAULT_ADDR: vault_server.base_url,
      VAULT_TOKEN: "vault-access-token",
      VAULT_NAMESPACE: undefined,
      VAULT_CACERT: undefined,
      VAULT_SKIP_VERIFY: undefined,
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "kv/data/proxmox/node-a#token",
        },
      });

      await assert.rejects(
        async () => provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /Vault secret lookup request failed/i,
        },
      );
    },
  });

  await vault_server.close();
});

test("BuildAuthProvider rejects malformed Vault response JSON.", async () => {
  const vault_server = await StartVaultServer({
    status_code: 200,
    body: "not-json",
  });

  await WithEnvironment({
    values: {
      VAULT_ADDR: vault_server.base_url,
      VAULT_TOKEN: "vault-access-token",
      VAULT_NAMESPACE: undefined,
      VAULT_CACERT: undefined,
      VAULT_SKIP_VERIFY: undefined,
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "kv/data/proxmox/node-a#token",
        },
      });

      await assert.rejects(
        async () => provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /not valid JSON/i,
        },
      );
    },
  });

  await vault_server.close();
});

test("BuildAuthProvider rejects missing Vault secret field.", async () => {
  const vault_server = await StartVaultServer({
    status_code: 200,
    body: JSON.stringify({
      data: {
        data: {
          another_field: "value",
        },
      },
    }),
  });

  await WithEnvironment({
    values: {
      VAULT_ADDR: vault_server.base_url,
      VAULT_TOKEN: "vault-access-token",
      VAULT_NAMESPACE: undefined,
      VAULT_CACERT: undefined,
      VAULT_SKIP_VERIFY: undefined,
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "kv/data/proxmox/node-a#token",
        },
      });

      await assert.rejects(
        async () => provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /field was missing or invalid/i,
        },
      );
    },
  });

  await vault_server.close();
});

test("BuildAuthProvider rejects empty Vault token field.", async () => {
  const vault_server = await StartVaultServer({
    status_code: 200,
    body: JSON.stringify({
      data: {
        data: {
          token: "   ",
        },
      },
    }),
  });

  await WithEnvironment({
    values: {
      VAULT_ADDR: vault_server.base_url,
      VAULT_TOKEN: "vault-access-token",
      VAULT_NAMESPACE: undefined,
      VAULT_CACERT: undefined,
      VAULT_SKIP_VERIFY: undefined,
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "kv/data/proxmox/node-a#token",
        },
      });

      await assert.rejects(
        async () => provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /token field was empty/i,
        },
      );
    },
  });

  await vault_server.close();
});

test("BuildAuthProvider resolves Vault token for auth header and fingerprint.", async () => {
  const vault_server = await StartVaultServer({
    status_code: 200,
    body: JSON.stringify({
      data: {
        data: {
          token: "vault_token_value",
        },
      },
    }),
  });

  await WithEnvironment({
    values: {
      VAULT_ADDR: vault_server.base_url,
      VAULT_TOKEN: "vault-access-token",
      VAULT_NAMESPACE: "opsimathically/prod",
      VAULT_CACERT: undefined,
      VAULT_SKIP_VERIFY: undefined,
    },
    run: async () => {
      const provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "vault",
          secret_ref: "kv/data/proxmox/node-a#token",
        },
      });

      assert.equal(
        await provider.GetAuthHeader(),
        "PVEAPIToken root@pam!builder=vault_token_value",
      );
      assert.equal((await provider.GetTokenFingerprint()).length, 12);
      assert.equal(vault_server.requests.length >= 1, true);
      assert.equal(vault_server.requests[0].headers["x-vault-token"], "vault-access-token");
      assert.equal(vault_server.requests[0].headers["x-vault-namespace"], "opsimathically/prod");
      assert.equal(vault_server.requests[0].url, "/v1/kv/data/proxmox/node-a");
    },
  });

  await vault_server.close();
});

test("BuildAuthProvider rejects sops provider when secret_ref is missing.", () => {
  assert.throws(
    () =>
      BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "sops",
        },
      }),
    {
      name: "ProxmoxAuthError",
      message: /requires secret_ref/i,
    },
  );
});

test("BuildAuthProvider rejects sops provider when secret_ref is blank.", () => {
  assert.throws(
    () =>
      BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "sops",
          secret_ref: "   ",
        },
      }),
    {
      name: "ProxmoxAuthError",
      message: /requires secret_ref/i,
    },
  );
});

test("BuildAuthProvider surfaces sops decrypt failures as auth errors.", { concurrency: false }, async () => {
  await WithStubbedSopsBinary({
    script_body: "#!/usr/bin/env sh\necho \"decrypt failed\" 1>&2\nexit 1\n",
    run: async () => {
      const sops_provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "sops",
          secret_ref: "/tmp/cluster-a-token.enc",
        },
      });

      await assert.rejects(
        async () => sops_provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /Could not decrypt auth token using SOPS/i,
        },
      );
    },
  });
});

test("BuildAuthProvider rejects empty sops decrypted token.", { concurrency: false }, async () => {
  await WithStubbedSopsBinary({
    script_body: "#!/usr/bin/env sh\nprintf \"   \\n\"\n",
    run: async () => {
      const sops_provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "sops",
          secret_ref: "/tmp/cluster-a-token.enc",
        },
      });

      await assert.rejects(
        async () => sops_provider.GetAuthHeader(),
        {
          name: "ProxmoxAuthError",
          message: /token was empty/i,
        },
      );
    },
  });
});

test("BuildAuthProvider resolves sops decrypted token for auth header and fingerprint.", { concurrency: false }, async () => {
  await WithStubbedSopsBinary({
    script_body: "#!/usr/bin/env sh\nprintf \"sops_token_value\"\n",
    run: async () => {
      const sops_provider = BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: {
          provider: "sops",
          secret_ref: "/tmp/cluster-a-token.enc",
        },
      });

      assert.equal(
        await sops_provider.GetAuthHeader(),
        "PVEAPIToken root@pam!builder=sops_token_value",
      );
      assert.equal((await sops_provider.GetTokenFingerprint()).length, 12);
    },
  });
});

test("BuildAuthProvider fails for unsupported provider value.", () => {
  assert.throws(
    () =>
      BuildAuthProvider({
        token_id: "root@pam!builder",
        auth: { provider: "not-real" } as unknown as {
          provider: "env" | "file" | "vault" | "sops";
        },
      }),
    {
      name: "ProxmoxAuthError",
      message: /Unsupported auth provider/i,
    },
  );
});
