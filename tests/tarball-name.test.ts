import { describe, expect, it } from "vitest";

import { tarballName } from "../src/workflow.js";

/** The stale-tarball pre-clean used to join "@scope/thing-VER.tgz" -- npm
 * pack actually writes scope-thing-VER.tgz, so the cleanup missed every
 * scoped package. The flattening is now shared and pinned here. */
describe("tarballName", () => {
  it("keeps an unscoped name verbatim", () => {
    expect(tarballName("rf-fixture", "0.1.0")).toBe("rf-fixture-0.1.0.tgz");
  });

  it("flattens the scope the way npm pack does", () => {
    expect(tarballName("@acme/widgets", "0.2.0")).toBe("acme-widgets-0.2.0.tgz");
  });
});
