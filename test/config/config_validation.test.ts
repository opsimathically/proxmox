import assert from "node:assert";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as http from "node:http";
import { BuildConfigDiagnostics, ResolveSecrets, ValidateConfig } from "../../src/config/proxmox_config";
import { proxmoxlib_config_t } from "../../src/types/proxmox_config_types";

function BuildConfig(): proxmoxlib_config_t {
  return {
    schema_version: 1,
    active_profile: "default",
    profiles: [
      {
        name: "default",
        cluster_id: "cluster-01",
        description: "Primary profile",
        transport_overrides: {
          request_timeout_ms: 45000,
        },
        retry_policy: {
          enabled: true,
          max_retries: 4,
          base_delay_ms: 250,
          max_delay_ms: 5000,
          jitter_ratio: 0.2,
          retry_on_429: true,
          retry_on_500: true,
        },
        task_poller: {
          enabled: true,
          poll_interval_ms: 1500,
          poll_timeout_ms: 120000,
          max_poll_failures: 3,
        },
      },
    ],
    clusters: [
      {
        id: "cluster-01",
        name: "Demo Cluster",
        environment: "dev",
        nodes: [
          {
            id: "node-a",
            hostname: "pve-a",
            host: "10.0.0.10",
            token_id: "root@pam!builder",
            auth: {
              provider: "env",
              env_var: "PROXMOX_TEST_TOKEN",
            },
          },
        ],
      },
    ],
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
  const scratch_dir = mkdtempSync(join(tmpdir(), "proxmoxlib-config-sops-bin-"));
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

async function StartVaultServer(params: {
  status_code: number;
  body: string;
}): Promise<{ base_url: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    response.statusCode = params.status_code;
    response.setHeader("content-type", "application/json");
    response.end(params.body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not resolve vault test server address.");
  }

  return {
    base_url: `http://127.0.0.1:${address.port}`,
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

test("ValidateConfig returns resolved config from valid schema.", () => {
  const config = BuildConfig();
  const resolved = ValidateConfig({ config: config });

  assert.equal(resolved.schema_version, 1);
  assert.equal(resolved.active_profile, "default");
  assert.equal(resolved.profiles.length, 1);
});

test("ValidateConfig rejects unknown auth provider.", () => {
  const bad_config = BuildConfig();
  bad_config.clusters = [
    {
      id: "cluster-01",
      name: "Demo Cluster",
      environment: "dev",
      nodes: [
        {
          id: "node-a",
          hostname: "pve-a",
          host: "10.0.0.10",
          token_id: "root@pam!builder",
          auth: {
            // @ts-expect-error intentionally invalid provider for validation test
            provider: "bad-provider",
          },
        },
      ],
    },
  ];

  assert.throws(() => ValidateConfig({ config: bad_config }), {
    message: /Unsupported auth provider./,
  });
});

test("ValidateConfig accepts privileged ticket auth configuration.", () => {
  const config = BuildConfig();
  config.clusters[0].nodes[0].privileged_auth = {
    provider: "ticket",
    username: "root@pam",
    password: {
      provider: "env",
      env_var: "PROXMOX_TEST_PRIVILEGED_PASSWORD",
    },
    renew_skew_seconds: 120,
  };

  const resolved = ValidateConfig({ config });
  assert.equal(
    resolved.clusters[0].nodes[0].privileged_auth?.password.provider,
    "env",
  );
});

test("BuildConfigDiagnostics produces redacted startup summary and no secret values.", () => {
  const config = BuildConfig();
  const resolved = ValidateConfig({ config: config });
  const diagnostics = BuildConfigDiagnostics({
    config: resolved,
    profile_name: "default",
    config_path: "/tmp/proxmoxlib.json",
  });

  assert.equal(diagnostics.config_path, "/tmp/proxmoxlib.json");
  assert.equal(diagnostics.auth_provider_counts.env, 1);
  assert.equal(diagnostics.selected_cluster.node_count, 1);
  const has_token_key = Object.keys(diagnostics.selected_cluster).includes("token");
  assert.equal(has_token_key, false);
});

test("ResolveSecrets supports sops provider token resolution.", { concurrency: false }, async () => {
  const config = BuildConfig();
  config.clusters[0].nodes[0].auth = {
    provider: "sops",
    secret_ref: "/tmp/proxmox/node-a-token.enc",
  };

  await WithStubbedSopsBinary({
    script_body: "#!/usr/bin/env sh\nprintf \"resolved_sops_token\"\n",
    run: async () => {
      const resolved = ValidateConfig({ config: config });
      const secret_store = await ResolveSecrets({
        config: resolved,
      });

      assert.equal(secret_store["node-a"].provider, "sops");
      assert.equal(secret_store["node-a"].token, "resolved_sops_token");
      assert.equal(secret_store["node-a"].token_fingerprint.length, 12);
    },
  });
});

test("ResolveSecrets supports vault provider token resolution.", async () => {
  const config = BuildConfig();
  config.clusters[0].nodes[0].auth = {
    provider: "vault",
    secret_ref: "kv/data/proxmox/node-a#token",
  };

  const vault_server = await StartVaultServer({
    status_code: 200,
    body: JSON.stringify({
      data: {
        data: {
          token: "resolved_vault_token",
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
      const resolved = ValidateConfig({ config: config });
      const secret_store = await ResolveSecrets({
        config: resolved,
      });

      assert.equal(secret_store["node-a"].provider, "vault");
      assert.equal(secret_store["node-a"].token, "resolved_vault_token");
      assert.equal(secret_store["node-a"].token_fingerprint.length, 12);
    },
  });

  await vault_server.close();
});
