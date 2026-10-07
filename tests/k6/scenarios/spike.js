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

const p1 = scaled(30);
const p2 = scaled(10);
const p3 = scaled(60);
const total = p1 + p2 + p3;

export const options = {
  scenarios: {
    normal: ingestScenario("normal", 7500, p1, 0),
    spike: ingestScenario("spike", 30000, p2, p1),
    recovery: ingestScenario("recovery", 7500, p3, p1 + p2),
    query: queryScenario(total),
    aggregate: aggregateScenario(total),
    health: healthScenario(total),
    probe: probeScenario(total),
  },
};

export { ingest, query, aggregate, health, probe, teardown };
