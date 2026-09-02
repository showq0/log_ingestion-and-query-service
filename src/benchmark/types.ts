export interface BenchmarkConfig {
  baseUrl: string;
  durationScale: number;
  batchSize: number;
  seedSize: number;
  loadRate: number;
  randomSeed: number;
  resultsDir: string;
  outputFile: string;
  mode: "compose" | "standalone" | "direct";
  resourceLimitsEnforced: boolean;
  generatorCpus: number;
  generatorMemory: string;
  authEnabled: boolean;
  apiKey?: string;
  scenariosToRun: ("load" | "stress" | "spike" | "breakpoint")[];
  skipCorrectness: boolean;
  skipSeeding: boolean;
  correctnessOnly: boolean;
  performanceOnly: boolean;
}

export interface EngineInfo {
  cpus: number;
  memoryBytes: number;
  operatingSystem: string;
  requiredCpus: number;
  sufficient: boolean;
  requiredMemoryBytes: number;
  memorySufficient: boolean;
}

export interface MachineSpeed {
  workUnitsPerSecond: number;
  factor: number;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface CorrectnessReport {
  passed: number;
  total: number;
  cap: number | null;
  checks: CheckResult[];
}

export interface SeedResult {
  durationMs: number;
  attempted: number;
  accepted: number;
  rejected: number;
  datasetSize: number;
}

export interface ScenarioPhaseResult {
  phase: string;
  targetLogsPerSecond: number;
  durationSeconds: number;
  achievedLogsPerSecond: number;
  errorRate: number;
  latencyP95Ms: number;
  latencyP99Ms?: number;
  acceptedRecords: number;
  rejectedRecords: number;
  droppedIterations: number;
  generatorLimited: boolean;
  serviceLimited: boolean;
  thresholdPassed: boolean;
}

export interface ScenarioResult {
  scenario: "load" | "stress" | "spike" | "breakpoint";
  status: "completed" | "failed" | "degraded" | "skipped";
  logsPerSecond: number;
  errorRate: number;
  latencyP95Ms: number;
  aggregateP95Ms: number;
  readAfterWriteSuccessRate: number;
  thresholdPassed: boolean;
  consistencyPassed: boolean;
  acceptedRecords: number;
  visibleRecords: number;
  offeredLogsPerSecond: number;
  droppedIterations: number;
  generatorLimited: boolean;
  serviceLimited: boolean;
  phases?: ScenarioPhaseResult[];
  sustainableCapacityLogsPerSec?: number;
  breakingPointLogsPerSec?: number | null;
}

export interface CorrectnessScore {
  points: number;
  maximum: number;
  percentage: number;
  components: {
    passed: number;
    total: number;
  };
}

export interface PerformanceScore {
  points: number;
  maximum: number;
  percentage: number;
  components: {
    throughput: number;
    errors: number;
    latency: number;
    sustainedBonus: number;
  };
}

export interface QueriesScore {
  points: number;
  maximum: number;
  percentage: number;
  components: {
    aggregateLatency: number;
    eventualConsistencyPassedScenarios: number;
    eventualConsistencyTotalScenarios: number;
    eventualConsistencyPoints: number;
    readAfterWrite: number;
  };
}

export interface ReliabilityScore {
  points: number;
  maximum: number;
  percentage: number;
  components: {
    scenarioCompletion: number;
    crashFree: number;
    recovery?: number;
  };
}

export interface ScoreReport {
  version: string;
  eligibility: {
    eligible: boolean;
  };
  score: number;
  maximumScore: number;
  correctness: CorrectnessScore;
  performance: PerformanceScore;
  queries: QueriesScore;
  reliability: ReliabilityScore;
  calculation: {
    correctnessRatio: number;
    uncappedScore: number;
    appliedCap: number | null;
  };
}

export interface ReliabilityReport {
  scenarioCompletion: number;
  crashFree: boolean;
  recovery: boolean;
}

export interface BenchmarkReport {
  tool: string;
  generatedAt: string;
  mode: string;
  endpoint: string;
  durationScale: number;
  resourceLimitsEnforced: boolean;
  generator: string;
  generatorIsolated: boolean;
  engine: EngineInfo;
  machineSpeed: MachineSpeed;
  seed?: SeedResult;
  correctness: CorrectnessReport;
  scenarios: ScenarioResult[];
  reliability?: ReliabilityReport;
  score: ScoreReport;
}
