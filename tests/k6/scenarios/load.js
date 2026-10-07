import {
  scaled,
  ingestScenario,
  queryScenario,
  aggregateScenario,
  healthScenario,
  probeScenario,
  ingest,
  query,
  aggregate,
  health,
  probe,
  teardown,
} from "../common.js";

const duration = scaled(120);

export const options = {
  scenarios: {
    load: ingestScenario("load", 15000, duration, 0),
    query: queryScenario(duration),
    aggregate: aggregateScenario(duration),
    health: healthScenario(duration),
    probe: probeScenario(duration),
  },
};

export { ingest, query, aggregate, health, probe, teardown };
