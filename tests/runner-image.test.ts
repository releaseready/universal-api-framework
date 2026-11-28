// Test classification: unit
// Review status: Not Reviewed
// Evidence: synthetic
// Scope: static checks of the runner image files (Dockerfile, .dockerignore, docker.yml): digest-pinned base, non-root user, SHA-pinned actions, no multi-arch or push on pull requests; it does not build the image (the docker workflow does).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("Given the runner image files", () => {
  const dockerfile = read("Dockerfile");

  it("When the Dockerfile names a base image, then every FROM is node:24-bookworm-slim pinned by digest", () => {
    const froms = dockerfile.match(/^FROM .+$/gm) ?? [];
    assert.ok(froms.length >= 2, "multi-stage build expected");
    for (const from of froms) {
      assert.match(
        from,
        /^FROM node:24-bookworm-slim@sha256:[0-9a-f]{64}( AS \w+)?$/,
      );
    }
  });

  it("When the image runs, then it runs as the non-root node user with the runner entrypoint", () => {
    assert.match(dockerfile, /^USER node$/m);
    assert.match(
      dockerfile,
      /ENTRYPOINT \["node", "dist\/src\/runner\/main\.js"\]/,
    );
  });

  it("When production dependencies are installed, then lifecycle scripts are off and dev dependencies are left out", () => {
    assert.match(dockerfile, /npm ci --omit=dev --ignore-scripts/);
  });

  it(".dockerignore keeps secrets, git history and local output out of the build context", () => {
    const ignore = read(".dockerignore");
    for (const entry of [
      ".git",
      "node_modules",
      "dist",
      ".env",
      ".e2e-results",
    ]) {
      assert.match(ignore, new RegExp(`^${entry.replace(".", "\\.")}$`, "m"));
    }
  });

  describe("and the docker workflow", () => {
    const workflow = read(".github/workflows/docker.yml");

    it("When it uses an action, then it is GitHub-owned and pinned by a full commit SHA", () => {
      const uses = [...workflow.matchAll(/^\s*-?\s*uses: (\S+)/gm)].map(
        (match) => match[1] ?? "",
      );
      assert.ok(uses.length > 0);
      for (const action of uses) {
        assert.match(action, /^actions\/[\w-]+@[0-9a-f]{40}$/, action);
      }
    });

    it("When a pull request runs it, then it builds amd64 only, never pushes and never uses QEMU", () => {
      assert.doesNotMatch(workflow, /qemu/i);
      assert.match(workflow, /--platform linux\/amd64/);
      assert.match(workflow, /--platform linux\/arm64/);
      assert.match(workflow, /if: github\.event_name != 'pull_request'/);
      assert.match(workflow, /image --severity CRITICAL/);
    });

    it("When Trivy runs, then its image is pinned by digest", () => {
      assert.match(workflow, /TRIVY_IMAGE: aquasec\/trivy@sha256:[0-9a-f]{64}/);
    });

    it("When the ECR push variable is unset, then the push is skipped", () => {
      assert.match(workflow, /vars\.AWS_ECR_PUSH_ROLE_ARN != ''/);
    });

    it("When a run is superseded, then it is cancelled and docs-only changes do not start it", () => {
      assert.match(workflow, /cancel-in-progress: true/);
      assert.match(workflow, /paths:/);
    });

    it("When it runs, then the token is read-only and credentials are not persisted", () => {
      assert.match(workflow, /persist-credentials: false/);
      assert.match(workflow, /contents: read/);
    });
  });
});
