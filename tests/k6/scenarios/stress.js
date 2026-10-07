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
const p2 = scaled(60);
const p3 = scaled(60);
const total = p1 + p2 + p3;

export const options = {
  scenarios: {
    p15k: ingestScenario("15k", 15000, p1, 0),
    p225k: ingestScenario("22.5k", 22500, p2, p1),
    p30k: ingestScenario("30k", 30000, p3, p1 + p2),
    query: queryScenario(total),
    aggregate: aggregateScenario(total),
    health: healthScenario(total),
    probe: probeScenario(total),
  },
};

export { ingest, query, aggregate, health, probe, teardown };
