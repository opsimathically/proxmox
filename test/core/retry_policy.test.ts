import assert from "node:assert";
import test from "node:test";
import {
  EvaluateRetry,
  IsRetryableStatusCode,
  NextRetryDelayMs,
  IsRetryableError,
  IsRetryableTransportError,
} from "../../src/core/retry/retry_policy";
import {
  ProxmoxHttpError,
  ProxmoxRateLimitError,
  ProxmoxTransportError,
} from "../../src/errors/proxmox_error";

test("Retry classification for status codes and policy switches.", () => {
  const policy = {
    enabled: true,
    max_retries: 2,
    base_delay_ms: 200,
    max_delay_ms: 1000,
    jitter_ratio: 0.5,
    retry_on_429: true,
    retry_on_500: false,
  };

  assert.equal(
    IsRetryableStatusCode({
      status_code: 429,
      policy,
    }),
    true,
  );
  assert.equal(
    IsRetryableStatusCode({
      status_code: 500,
      policy,
    }),
    false,
  );
  assert.equal(
    IsRetryableStatusCode({
      status_code: 400,
      policy,
    }),
    false,
  );
});

test("EvaluateRetry respects max_retries and retry delay bounds.", () => {
  const policy = {
    enabled: true,
    max_retries: 1,
    base_delay_ms: 100,
    max_delay_ms: 500,
    jitter_ratio: 0.5,
    retry_on_429: true,
    retry_on_500: true,
  };
  const first = EvaluateRetry({
    attempt_number: 1,
    policy,
    error: new ProxmoxRateLimitError({
      code: "proxmox.http.rate_limited",
      message: "rate limited",
    }),
  });
  const second = EvaluateRetry({
    attempt_number: 2,
    policy,
    error: new ProxmoxRateLimitError({
      code: "proxmox.http.rate_limited",
      message: "rate limited",
    }),
  });
  const third = EvaluateRetry({
    attempt_number: 3,
    policy,
    error: new ProxmoxRateLimitError({
      code: "proxmox.http.rate_limited",
      message: "rate limited",
    }),
  });

  assert.equal(first.should_retry, true);
  assert.equal(second.should_retry, false);
  assert.equal(third.should_retry, false);
  assert.ok(first.delay_ms >= 0);
  assert.ok(first.delay_ms <= policy.max_delay_ms);
  assert.equal(second.delay_ms, 0);
});

test("EvaluateRetry with status codes follows policy and returns delay only when retrying.", () => {
  const policy = {
    enabled: true,
    max_retries: 1,
    base_delay_ms: 100,
    max_delay_ms: 500,
    jitter_ratio: 0.5,
    retry_on_429: true,
    retry_on_500: true,
  };

  const service_error = EvaluateRetry({
    attempt_number: 1,
    policy,
    status_code: 503,
  });
  const not_retryable = EvaluateRetry({
    attempt_number: 2,
    policy,
    status_code: 400,
  });

  assert.equal(service_error.should_retry, true);
  assert.ok(service_error.delay_ms >= 0);
  assert.ok(service_error.delay_ms <= policy.max_delay_ms);
  assert.equal(not_retryable.should_retry, false);
  assert.equal(not_retryable.delay_ms, 0);
});

test("NextRetryDelayMs allows deterministic checks.", () => {
  const policy = {
    enabled: true,
    base_delay_ms: 100,
    max_delay_ms: 500,
    jitter_ratio: 0.5,
  };
  assert.equal(
    NextRetryDelayMs({
      policy,
      attempt_number: 1,
      random_value: 0.5,
    }),
    100,
  );
  assert.equal(
    NextRetryDelayMs({
      policy,
      attempt_number: 2,
      random_value: 0.5,
    }),
    200,
  );
});

test("Retry error classification includes transport and rate-limit errors.", () => {
  const policy = {
    enabled: true,
    max_retries: 1,
    base_delay_ms: 100,
    max_delay_ms: 500,
    retry_on_429: true,
    retry_on_500: true,
  };

  assert.equal(
    IsRetryableError({
      error: new ProxmoxRateLimitError({
        code: "proxmox.http.rate_limited",
        message: "rate limited",
      }),
      policy,
    }),
    true,
  );
  assert.equal(
    IsRetryableError({
      error: new ProxmoxHttpError({
        code: "proxmox.http.server_error",
        message: "server",
      }),
      policy,
    }),
    true,
  );
  assert.equal(
    IsRetryableError({
      error: new ProxmoxTransportError({
        code: "proxmox.transport.request_failed",
        message: "network",
        cause: Object.assign(new Error("ENOTFOUND error"), {
          code: "ENOTFOUND",
        }),
      }),
      policy,
    }),
    true,
  );
});

test("Retry delay jitter can be bounded deterministically.", () => {
  const policy = {
    enabled: true,
    base_delay_ms: 200,
    max_delay_ms: 250,
    jitter_ratio: 0.5,
  };
  const min_delay = NextRetryDelayMs({
    policy,
    attempt_number: 1,
    random_value: 0,
  });
  const max_delay = NextRetryDelayMs({
    policy,
    attempt_number: 1,
    random_value: 1,
  });
  assert.ok(min_delay <= 250);
  assert.ok(min_delay <= max_delay);
  assert.ok(max_delay <= 250);
});

test("Transport error detection tolerates known network codes.", () => {
  const network_error = Object.assign(new Error("network down"), {
    code: "ECONNRESET",
  });
  assert.equal(IsRetryableTransportError(network_error), true);
  const non_network_error = Object.assign(new Error("not transient"), {
    code: "EACCES",
  });
  assert.equal(IsRetryableTransportError(non_network_error), false);
});
