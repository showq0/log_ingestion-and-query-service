import os from "node:os";
import crypto from "node:crypto";
import type { EngineInfo, MachineSpeed } from "./types.js";

export function profileEngine(): EngineInfo {
  const cpus = os.cpus().length;
  const memoryBytes = os.totalmem();
  const platform = os.platform();
  const release = os.release();

  let operatingSystem = `${platform} ${release}`;
  if (platform === "darwin") {
    operatingSystem = `macOS (${os.arch()})`;
  } else if (platform === "linux") {
    operatingSystem = `Linux (${os.arch()})`;
  }

  const requiredCpus = 5.5;
  const requiredMemoryBytes = 2415919104; // ~2.25 GiB

  return {
    cpus,
    memoryBytes,
    operatingSystem,
    requiredCpus,
    sufficient: cpus >= requiredCpus,
    requiredMemoryBytes,
    memorySufficient: memoryBytes >= requiredMemoryBytes,
  };
}

export function measureMachineSpeed(): MachineSpeed {
  // Deterministic work unit measurement
  // Executes fixed iterations of crypto SHA-256 and JSON ops for a brief duration
  const testDurationMs = 250;
  const start = performance.now();
  let workUnits = 0;
  const sample = JSON.stringify({
    timestamp: "2026-07-20T14:32:01.123Z",
    level: "error",
    service: "checkout",
    message: "payment declined test benchmark engine measurement sample",
    attributes: { user_id: "42", region: "eu-west", retries: 3 },
  });

  while (performance.now() - start < testDurationMs) {
    for (let i = 0; i < 50_000; i++) {
      crypto.createHash("sha256").update(sample + i).digest("hex");
    }
    workUnits += 1;
  }

  const elapsedSeconds = (performance.now() - start) / 1000;
  const workUnitsPerSecond = workUnits / elapsedSeconds;

  // Baseline reference is ~52.0 workUnitsPerSecond
  const baseline = 52.0;
  const factor = Number((workUnitsPerSecond / baseline).toFixed(4));

  return {
    workUnitsPerSecond: Number(workUnitsPerSecond.toFixed(4)),
    factor,
  };
}
