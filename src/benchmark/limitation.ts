export interface LimitationAnalysisInput {
  targetRate: number;
  achievedRate: number;
  droppedIterations: number;
  errorRate: number;
  latencyP95Ms: number;
  expectedLatencyThresholdMs: number;
  vusMaxedOut?: boolean;
}

export interface LimitationResult {
  generatorLimited: boolean;
  serviceLimited: boolean;
  reason?: string;
}

export function detectLimitation(input: LimitationAnalysisInput): LimitationResult {
  const {
    targetRate,
    achievedRate,
    droppedIterations,
    errorRate,
    latencyP95Ms,
    expectedLatencyThresholdMs,
    vusMaxedOut,
  } = input;

  const rateRatio = targetRate > 0 ? achievedRate / targetRate : 1.0;
  const isThroughputDegraded = rateRatio < 0.95;
  const hasDroppedIterations = droppedIterations > 10;
  const hasServiceErrors = errorRate > 0.01;
  const isLatencySpiked = latencyP95Ms > expectedLatencyThresholdMs * 1.5;

  // Case 1: Service is clearly failing or struggling (5xx, 503, high errors, or severe latency spike)
  if (hasServiceErrors || (isThroughputDegraded && isLatencySpiked && !hasDroppedIterations)) {
    return {
      generatorLimited: false,
      serviceLimited: true,
      reason: `Service degradation: errorRate=${(errorRate * 100).toFixed(2)}%, p95=${latencyP95Ms.toFixed(2)}ms`,
    };
  }

  // Case 2: Generator cannot keep up (dropped iterations or VU exhaustion while service is healthy)
  if (hasDroppedIterations || (isThroughputDegraded && (vusMaxedOut || !hasServiceErrors))) {
    return {
      generatorLimited: true,
      serviceLimited: false,
      reason: `Generator constraint: ${droppedIterations} dropped iterations, throughput=${achievedRate.toFixed(1)}/${targetRate} logs/s`,
    };
  }

  // Case 3: Healthy operation
  return {
    generatorLimited: false,
    serviceLimited: false,
    reason: "Nominal performance within target thresholds",
  };
}
