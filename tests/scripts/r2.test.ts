import { describe, expect, it } from "vitest";

// @ts-expect-error untyped .mjs module
import { classifyAudioDownload } from "../../scripts/lib/r2.mjs";

describe("classifyAudioDownload", () => {
  it("keeps a local file when not forcing", () => {
    expect(classifyAudioDownload({ force: false, localExists: true, remoteHas: true })).toBe("have");
    expect(classifyAudioDownload({ force: false, localExists: true, remoteHas: false })).toBe("have");
    expect(classifyAudioDownload({ force: false, localExists: true, remoteHas: null })).toBe("have");
  });

  it("re-fetches a local file when forcing if remote has it or is unknown", () => {
    expect(classifyAudioDownload({ force: true, localExists: true, remoteHas: true })).toBe("fetch");
    expect(classifyAudioDownload({ force: true, localExists: true, remoteHas: null })).toBe("fetch");
  });

  it("skips a forced re-fetch when the inventory says the key is absent", () => {
    expect(classifyAudioDownload({ force: true, localExists: true, remoteHas: false })).toBe("absent");
  });

  it("skips the network when the inventory says the key is absent", () => {
    expect(classifyAudioDownload({ force: false, localExists: false, remoteHas: false })).toBe("absent");
  });

  it("fetches when remote has the key, or when the inventory is unavailable", () => {
    expect(classifyAudioDownload({ force: false, localExists: false, remoteHas: true })).toBe("fetch");
    expect(classifyAudioDownload({ force: false, localExists: false, remoteHas: null })).toBe("fetch");
  });
});
