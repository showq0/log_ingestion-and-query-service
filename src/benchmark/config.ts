import type { BenchmarkConfig } from "./types.js";

export function parseConfig(argv: string[] = process.argv.slice(2)): BenchmarkConfig {
  const env = process.env;

  let baseUrl = env.BASE_URL || "http://127.0.0.1:8080";
  let durationScale = Number(env.DURATION_SCALE || 1.0);
  let batchSize = Number(env.BATCH_SIZE || 100);
  let seedSize = Number(env.SEED_SIZE || env.DATASET_SIZE || 1_000_000);
  let loadRate = Number(env.LOAD_RATE || env.TARGET_LOGS_PER_SECOND || 15_000);
  let randomSeed = Number(env.BENCHMARK_SEED || 1337);
  let resultsDir = env.RESULTS_DIR || "./benchmark-results";
  let outputFile = env.OUTPUT_FILE || "./benchmark-report.json";
  let mode: "compose" | "standalone" | "direct" = (env.BENCHMARK_MODE as any) || "compose";
  let resourceLimitsEnforced = env.RESOURCE_LIMITS_ENFORCED !== "false";
  let generatorCpus = Number(env.GENERATOR_CPUS || 4);
  let generatorMemory = env.GENERATOR_MEMORY || "1g";
  let authEnabled = env.AUTH_ENABLED === "true";
  let apiKey = env.LOADGEN_API_KEY;

  let correctnessOnly = false;
  let performanceOnly = false;
  let skipCorrectness = false;
  let skipSeeding = false;
  const scenariosToRun: ("load" | "stress" | "spike" | "breakpoint")[] = [
    "load",
    "stress",
    "spike",
    "breakpoint",
  ];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--quick" || arg === "-q") {
      durationScale = 0.1;
      if (!env.SEED_SIZE && !env.DATASET_SIZE) {
        seedSize = 10_000;
      }
    } else if (arg === "--duration-scale" && i + 1 < argv.length) {
      durationScale = Number(argv[++i]);
    } else if (arg === "--seed-size" && i + 1 < argv.length) {
      seedSize = Number(argv[++i]);
    } else if (arg === "--batch-size" && i + 1 < argv.length) {
      batchSize = Number(argv[++i]);
    } else if (arg === "--load-rate" && i + 1 < argv.length) {
      loadRate = Number(argv[++i]);
    } else if (arg === "--base-url" && i + 1 < argv.length) {
      baseUrl = argv[++i];
    } else if (arg === "--output" || arg === "-o") {
      if (i + 1 < argv.length) outputFile = argv[++i];
    } else if (arg === "--results-dir" && i + 1 < argv.length) {
      resultsDir = argv[++i];
    } else if (arg === "--correctness-only") {
      correctnessOnly = true;
    } else if (arg === "--performance-only") {
      performanceOnly = true;
      skipCorrectness = true;
    } else if (arg === "--skip-correctness") {
      skipCorrectness = true;
    } else if (arg === "--skip-seeding") {
      skipSeeding = true;
    } else if (arg === "--scenario" && i + 1 < argv.length) {
      const scen = argv[++i] as any;
      if (["load", "stress", "spike", "breakpoint"].includes(scen)) {
        scenariosToRun.length = 0;
        scenariosToRun.push(scen);
      }
    } else if (arg === "--mode" && i + 1 < argv.length) {
      mode = argv[++i] as any;
    }
  }

  // Ensure base URL has no trailing slash
  baseUrl = baseUrl.replace(/\/+$/, "");

  return {
    baseUrl,
    durationScale,
    batchSize,
    seedSize,
    loadRate,
    randomSeed,
    resultsDir,
    outputFile,
    mode,
    resourceLimitsEnforced,
    generatorCpus,
    generatorMemory,
    authEnabled,
    apiKey,
    scenariosToRun,
    skipCorrectness,
    skipSeeding,
    correctnessOnly,
    performanceOnly,
  };
}
