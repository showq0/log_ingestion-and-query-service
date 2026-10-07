import type {
  CorrectnessReport,
  ScenarioResult,
  ScoreReport,
} from "./types.js";

export function computeScore(
  correctness: CorrectnessReport,
  scenarios: ScenarioResult[],
  crashFree = true,
): ScoreReport {
  // 1. Correctness (15 points)
  const correctnessPassed = correctness.passed;
  const correctnessTotal = correctness.total || 15;
  const correctnessRatio = correctnessPassed / correctnessTotal;
  const correctnessPoints = Number((15 * correctnessRatio).toFixed(4));
  const correctnessPercentage = Number((correctnessRatio * 100).toFixed(2));

  // 2. Performance (50 points)
  const loadScenario = scenarios.find((s) => s.scenario === "load");
  const stressScenario = scenarios.find((s) => s.scenario === "stress");

  const loadLogsPerSec = loadScenario?.logsPerSecond || 0;
  const loadOffered = loadScenario?.offeredLogsPerSecond || 15000;
  const loadErrorRate = loadScenario?.errorRate || 0;
  const loadLatencyP95 = loadScenario?.latencyP95Ms || 50;

  const stressLogsPerSec = stressScenario?.logsPerSecond || 0;
  const stressOffered = stressScenario?.offeredLogsPerSecond || 21000;

  // Throughput component: up to 0.40 (20 pts)
  const throughputComp = Number(
    (0.4 * Math.min(1.0, loadLogsPerSec / loadOffered)).toFixed(17),
  );

  // Errors component: up to 0.30 (15 pts)
  const errorsComp = Number(
    (0.3 * Math.max(0.0, 1.0 - loadErrorRate / 0.05)).toFixed(4),
  );

  // Latency component: up to 0.20 (10 pts)
  // Linear scale: <= 500ms gets full 0.20, > 1000ms gets 0
  const latencyFraction =
    loadLatencyP95 <= 500
      ? 1.0
      : Math.max(0.0, (1000 - loadLatencyP95) / 500);
  const latencyComp = Number((0.2 * latencyFraction).toFixed(4));

  // Sustained load bonus: up to 0.05 (2.5 pts)
  const sustainedComp = Number(
    (0.05 * Math.min(1.0, stressLogsPerSec / stressOffered)).toFixed(4),
  );

  const perfSum = throughputComp + errorsComp + latencyComp + sustainedComp;
  const performancePoints = Number((50 * perfSum).toFixed(14));
  const performancePercentage = Number((perfSum * 100).toFixed(14));

  // 3. Queries (15 points)
  const allAggLatencies = scenarios.map((s) => s.aggregateP95Ms || 3);
  const avgAggP95 =
    allAggLatencies.length > 0
      ? allAggLatencies.reduce((a, b) => a + b, 0) / allAggLatencies.length
      : 3;

  // Aggregate latency component: (500 - p95) / 500 up to 1.0
  const aggLatencyFraction = Number(
    Math.max(0.0, Math.min(1.0, (500 - avgAggP95) / 500)).toFixed(4),
  );
  const eventualConsistencyPassedScenarios = scenarios.filter(
    (s) => s.consistencyPassed,
  ).length;
  const eventualConsistencyTotalScenarios = Math.max(1, scenarios.length);
  const eventualConsistencyPoints = Number(
    (
      6 *
      (eventualConsistencyPassedScenarios / eventualConsistencyTotalScenarios)
    ).toFixed(4),
  );

  const allRawSuccess = scenarios.map((s) => s.readAfterWriteSuccessRate || 0);
  const avgRawSuccess =
    allRawSuccess.length > 0
      ? allRawSuccess.reduce((a, b) => a + b, 0) / allRawSuccess.length
      : 0;

  const queriesPoints = Number(
    (9 * aggLatencyFraction + eventualConsistencyPoints).toFixed(4),
  );
  const queriesPercentage = Number(((queriesPoints / 15) * 100).toFixed(2));

  // 4. Reliability (20 points)
  const completedScenarios = scenarios.filter(
    (s) => s.status === "completed" || s.generatorLimited,
  ).length;
  const totalScenarios = Math.max(1, scenarios.length);
  const scenarioCompletionRatio = completedScenarios / totalScenarios;
  const crashFreeScore = crashFree ? 1.0 : 0.0;

  const reliabilityPoints = Number(
    (10 * scenarioCompletionRatio + 10 * crashFreeScore).toFixed(4),
  );
  const reliabilityPercentage = Number(((reliabilityPoints / 20) * 100).toFixed(2));

  // 5. Total & Cap
  const uncappedScore = Number(
    (
      correctnessPoints +
      performancePoints +
      queriesPoints +
      reliabilityPoints
    ).toFixed(13),
  );

  let appliedCap: number | null = null;
  if (correctnessPassed < correctnessTotal) {
    appliedCap = 75.0;
  }

  const finalScore = appliedCap !== null ? Math.min(uncappedScore, appliedCap) : uncappedScore;

  return {
    version: "2026-08-18.v10",
    eligibility: {
      eligible: true,
    },
    score: finalScore,
    maximumScore: 100,
    correctness: {
      points: correctnessPoints,
      maximum: 15,
      percentage: correctnessPercentage,
      components: {
        passed: correctnessPassed,
        total: correctnessTotal,
      },
    },
    performance: {
      points: performancePoints,
      maximum: 50,
      percentage: performancePercentage,
      components: {
        throughput: throughputComp,
        errors: errorsComp,
        latency: latencyComp,
        sustainedBonus: sustainedComp,
      },
    },
    queries: {
      points: queriesPoints,
      maximum: 15,
      percentage: queriesPercentage,
      components: {
        aggregateLatency: aggLatencyFraction,
        eventualConsistencyPassedScenarios,
        eventualConsistencyTotalScenarios,
        eventualConsistencyPoints,
        readAfterWrite: avgRawSuccess,
      },
    },
    reliability: {
      points: reliabilityPoints,
      maximum: 20,
      percentage: reliabilityPercentage,
      components: {
        scenarioCompletion: scenarioCompletionRatio,
        crashFree: crashFreeScore,
      },
    },
    calculation: {
      correctnessRatio,
      uncappedScore,
      appliedCap,
    },
  };
}
