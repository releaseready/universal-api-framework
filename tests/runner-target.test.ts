// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: the runner's target allow-list (RR_BASE_URL, RR_ALLOWED_TARGET_HOSTS) accepts loopback by default and a non-loopback host only when it is listed exactly and uses https; it makes no network request.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveRunnerTarget,
  RunnerConfigError,
} from "../src/runner/target.js";

const UAT = "https://d111111abcdef8.cloudfront.net";

describe("Given the runner target configuration", () => {
  it("When RR_BASE_URL is missing, then it is a config error naming the variable", () => {
    assert.throws(
      () => resolveRunnerTarget({}),
      (error: unknown) =>
        error instanceof RunnerConfigError &&
        error.message.includes("RR_BASE_URL"),
    );
  });

  it("When the target is loopback and the allow-list is empty, then it is allowed", () => {
    for (const url of [
      "http://127.0.0.1:8080",
      "http://localhost:3000",
      "http://[::1]:3000",
      "https://127.0.0.1:8443",
    ]) {
      assert.equal(
        resolveRunnerTarget({ RR_BASE_URL: url }).hostname,
        new URL(url).hostname,
      );
    }
  });

  it("When a non-loopback host is listed exactly and uses https, then it is allowed", () => {
    const target = resolveRunnerTarget({
      RR_BASE_URL: `${UAT}/api`,
      RR_ALLOWED_TARGET_HOSTS:
        "other.example.test, d111111abcdef8.cloudfront.net",
    });

    assert.equal(target.origin, UAT);
  });

  it("When a non-loopback host is not listed, then it is refused", () => {
    assert.throws(
      () =>
        resolveRunnerTarget({
          RR_BASE_URL: UAT,
          RR_ALLOWED_TARGET_HOSTS: "other.example.test",
        }),
      RunnerConfigError,
    );
  });

  it("When a non-loopback host is used with an empty allow-list, then it is refused", () => {
    assert.throws(
      () => resolveRunnerTarget({ RR_BASE_URL: UAT }),
      /RR_ALLOWED_TARGET_HOSTS/,
    );
    assert.throws(
      () =>
        resolveRunnerTarget({
          RR_BASE_URL: UAT,
          RR_ALLOWED_TARGET_HOSTS: " , ",
        }),
      RunnerConfigError,
    );
  });

  it("When a listed non-loopback host uses http, then it is refused", () => {
    assert.throws(
      () =>
        resolveRunnerTarget({
          RR_BASE_URL: "http://d111111abcdef8.cloudfront.net",
          RR_ALLOWED_TARGET_HOSTS: "d111111abcdef8.cloudfront.net",
        }),
      /https/,
    );
  });

  it("When the allow-list holds a wildcard, then it is refused even if another entry matches", () => {
    for (const hosts of [
      "*",
      "*.cloudfront.net",
      "d111111abcdef8.cloudfront.net,*.example.test",
    ]) {
      assert.throws(
        () =>
          resolveRunnerTarget({
            RR_BASE_URL: UAT,
            RR_ALLOWED_TARGET_HOSTS: hosts,
          }),
        /wildcard/i,
      );
    }
  });

  it("When the target has credentials or is not a URL, then it is refused", () => {
    for (const url of [
      "https://user:pw@127.0.0.1",
      "not a url",
      "ftp://127.0.0.1",
    ]) {
      assert.throws(
        () => resolveRunnerTarget({ RR_BASE_URL: url }),
        RunnerConfigError,
      );
    }
  });

  it("When a host is listed with a different case, then it still matches exactly", () => {
    assert.equal(
      resolveRunnerTarget({
        RR_BASE_URL: UAT,
        RR_ALLOWED_TARGET_HOSTS: "D111111ABCDEF8.CloudFront.net",
      }).origin,
      UAT,
    );
  });
});
