import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { isVideoMostlyBlack } from "../../src/lib/capture-media";

const execFileAsync = promisify(execFile);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

describe("capture media video validation", () => {
  it("detects all-black videos and accepts visible videos", async () => {
    if (!(await hasFfmpeg())) {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), "visual-capture-validation-"));
    const blackVideo = join(root, "black.mp4");
    const visibleVideo = join(root, "visible.mp4");

    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64:d=1",
      "-pix_fmt",
      "yuv420p",
      blackVideo
    ]);
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=64x64:d=1",
      "-pix_fmt",
      "yuv420p",
      visibleVideo
    ]);

    await expect(isVideoMostlyBlack(blackVideo)).resolves.toBe(true);
    await expect(isVideoMostlyBlack(visibleVideo)).resolves.toBe(false);
  });
});
