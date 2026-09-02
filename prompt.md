# Implement a Production-Grade Performance Benchmark for the Log Ingestion & Query Service

You need to implement a complete performance-testing/benchmarking system for this project.

The goal is to measure **Correctness, Performance, Queries, and Reliability** under controlled load and produce a machine-readable JSON report similar to the benchmark report provided below.

Do not only create a simple k6 script. Build the benchmark so that it can reliably measure the application, distinguish **generator limitations from service limitations**, validate correctness and eventual consistency, and report the results for all required scenarios.
Benchmark Specification: grafana/k6:0.54.0
The benchmark must report:
Docker image
allocated CPU
allocated memory
configured VUs
maximum VUs
whether the generator became the bottleneck

The benchmark must be designed so that the k6 generator has enough resources to generate the requested traffic.

---

## 1. Project API

The service exposes these endpoints.

### POST `/logs`

Ingests a batch of logs.

Request:

```json
{
  "logs": [
    {
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": {
        "user_id": "42",
        "region": "eu-west",
        "retries": 3
      }
    }
  ]
}
```

Validation requirements:

* `timestamp` must be a valid ISO 8601 timestamp
* timestamp cannot be more than 5 minutes in the future
* `level` must be one of:
  * `debug`
  * `info`
  * `warn`
  * `error`
* `service` must be non-empty
* `message` must be non-empty
* `attributes` must be a flat object
* nested objects and arrays are invalid

Successful response:

```json
{
  "accepted": 9,
  "rejected": [
    {
      "index": 3,
      "reason": "invalid level: 'critical'"
    }
  ]
}
```

Malformed JSON should return HTTP 400.

---

### GET `/logs`

Supports:

* `service`
* `level`
* `since`
* `until`
* `attr.<key>`
* `q`
* `limit`
* `cursor`

Example:

```text
GET /logs?service=checkout&level=error&since=2026-07-20T14:00:00Z&until=2026-07-20T15:00:00Z&limit=100
```

Response:

```json
{
  "logs": [
    {
      "id": "123",
      "timestamp": "2026-07-20T14:32:01.123Z",
      "level": "error",
      "service": "checkout",
      "message": "payment declined",
      "attributes": {
        "user_id": "42"
      }
    }
  ],
  "next_cursor": null
}
```

---

### GET `/logs/aggregate`

Required:

* `since`
* `until`
* `bucket`

Supported buckets:

* `1m`
* `5m`
* `1h`
* `1d`

Optional:

* `group_by=service`
* `group_by=level`
* `service`
* `level`
* `attr.<key>`
* `q`

Example:

```text
GET /logs/aggregate?since=2026-07-20T14:00:00Z&until=2026-07-20T15:00:00Z&bucket=1m&group_by=service
```

Response:

```json
{
  "buckets": [
    {
      "start": "2026-07-20T14:00:00Z",
      "group": "checkout",
      "count": 118
    }
  ]
}
```

---

# 2. Benchmark Stages

The benchmark must contain exactly these five major stages:

## Stage 1 — Seeding

Before performance scenarios begin, seed the database with a meaningful amount of historical log data. 1,000,000 valid log records
 
The seed data must be deterministic/reproducible. 

### Date Range

The seed data must cover the previous 30 days ending today.
The benchmark date range must be calculated dynamically when the benchmark starts.

For example, if the benchmark runs on:

2026-09-02

the seed dataset should cover:

2026-08-03 → 2026-09-02

Do not hardcode these dates.
### Data 

Seed records should contain a realistic distribution of:

* timestamps
* log levels
* services
* messages
* attributes

The seeded data must be used by query and aggregation benchmarks.

### Record:

* seed duration
* number of records attempted
* number accepted
* number rejected
* resulting dataset size

The seed phase must finish successfully before the load tests begin.

---

# Stage 2 — Loading

Sustain:

**15,000 logs/second for 120 seconds**

The benchmark must measure:

* achieved throughput
* offered throughput
* HTTP errors
* application errors
* request latency
* p95 latency
* accepted records
* rejected records
* dropped iterations
* aggregate query p95
* consistency

Do not report the offered rate as the actual throughput.

Actual throughput must be calculated from successfully processed/accepted records and elapsed time.

---

# Stage 3 — Stress

Run the following progression:


**15,000 logs/s for 30s** → **22,500 logs/s for 60s** → **30,000 logs/s for 60s**


---

# Stage 4 — Spike

Run:


**7,500 logs/s for 30s** → **30,000 logs/s for 10s** → **7,500 logs/s for 60s**

This scenario evaluates:

1. normal operation
2. sudden traffic spike
3. recovery after the spike

Measure separately for each phase.

Important reliability questions:

* Does the service survive the spike?
* Does latency recover after the spike?
* Does throughput recover?
* Are requests lost?
* Are records eventually visible?
* Does aggregation become inconsistent?
* Does the application recover without restart?

The final recovery phase must be evaluated independently rather than averaged together with the spike.

---

# Stage 5 — Breakpoint

Increase the load progressively:


**15,000 logs/s for 30s** → **22,500 logs/s for 30s** → **30,000 logs/s for 30s** → **45,000 logs/s for 30s**


The purpose is to identify the system's practical capacity and breaking point.

Do not assume that 45,000 logs/s is achievable.

The benchmark must objectively determine:

* highest sustainable throughput
* first degradation point
* first significant error-rate increase
* latency degradation
* timeout behavior
* whether the service remains healthy
* whether the service crashes
* whether data is eventually persisted
* whether queries continue functioning

If the service fails at a particular stage, record that stage accurately and continue with cleanup/recovery where possible.

---

# 3. Correctness Testing

Before and/or independently from the heavy load scenarios, implement correctness checks covering the API contract.

At minimum verify:

### Health

```text
GET /health
```

Expected:

```text
HTTP 200
```

### Ingestion

Test:

* single valid log
* valid batch
* partially invalid batch
* empty batch
* malformed JSON

### Validation

Verify invalid:

* timestamp
* future timestamp
* level
* empty service
* empty message
* nested attributes
* array attributes

### Query

Verify:

* unfiltered query
* service filter
* level filter
* time range
* attribute filter
* message search
* combinations of filters

### Pagination

Verify:

* deterministic ordering
* cursor pagination
* no duplicates between pages
* no missing records
* invalid cursor handling

### Aggregation

Verify:

* 1m bucket
* 5m bucket
* 1h bucket
* grouping by service
* grouping by level
* filters
* invalid aggregation parameters

The benchmark must report:

```json
{
  "correctness": {
    "passed": 0,
    "total": 0,
    "checks": []
  }
}
```

Each check should include:

```json
{
  "name": "...",
  "passed": true,
  "expected": "...",
  "actual": "..."
}
```

---

# 4. Performance Metrics

For every ingestion scenario calculate:

### Offered throughput

The target rate generated by the load generator.

### Achieved throughput

The actual number of accepted logs divided by the scenario duration.

Never confuse offered throughput with achieved throughput.

### Error rate

Track separately:

* HTTP errors
* request failures
* timeouts
* malformed responses
* application-level rejected records

### Latency

Measure:

* average
* median
* p90
* p95
* p99
* maximum

The primary latency metric is **p95**.

### Dropped iterations

Track k6/load-generator dropped iterations.

A high dropped-iteration count should not automatically be classified as an application failure.

---

# 5. Generator-Limited vs Service-Limited

This is extremely important.

The benchmark must distinguish:

```text
generatorLimited
```

from:

```text
serviceLimited
```

For example, if the benchmark requests 30,000 logs/s but the k6 generator can only produce 15,000 logs/s because CPU/VU capacity is exhausted, the benchmark must identify this as a generator limitation.

Do not incorrectly conclude that the application can only handle 15,000 logs/s.

Track indicators such as:

* dropped iterations
* VU exhaustion
* generator CPU
* generator memory
* achieved request rate
* offered request rate
* service response errors
* service latency
* service CPU
* service memory

The final report should explicitly identify the limiting component.

---

# 6. Query Performance

During/after ingestion, benchmark:

```text
GET /logs
GET /logs/aggregate
```

The most important query metric is:

**aggregate p95 latency**

Test realistic aggregation queries including:

### Basic aggregation

```text
GET /logs/aggregate?since=...&until=...&bucket=1m
```

### Group by service

```text
GET /logs/aggregate?since=...&until=...&bucket=1m&group_by=service
```

### Group by level

```text
GET /logs/aggregate?since=...&until=...&bucket=1m&group_by=level
```

### Filtered aggregation

Use combinations of:

* service
* level
* attribute
* message search

Measure aggregate endpoint p95 independently from ingestion latency.

---

# 7. Eventual Consistency

The system may use asynchronous ingestion.

Therefore, immediately after ingestion, records may not yet be visible to queries.

Do not automatically classify this as data loss.

Implement a read-after-write / eventual-consistency verification mechanism.

For a known set of generated logs:

1. generate unique identifiers in the test data
2. ingest the logs
3. query the service
4. verify whether the records become visible
5. retry with a bounded polling window
6. calculate the visibility rate
7. record the time required for records to become visible

Report:

```json
{
  "readAfterWriteSuccessRate": 0.99,
  "consistencyPassed": true
}
```

Define and document the consistency timeout.

Do not wait indefinitely.

---


# 8. Reliability

Reliability must cover:

### Scenario completion

Did each scenario complete without the benchmark itself crashing?

### Crash-free operation

Determine whether the service:

* crashed
* restarted
* became unreachable
* returned persistent 5xx responses
* timed out continuously

### Recovery

For spike testing verify recovery after the spike.

For breakpoint testing identify the exact load stage where the service stops behaving normally.

Report:

```json
{
  "reliability": {
    "scenarioCompletion": ...,
    "crashFree": ...,
    "recovery": ...
  }
}
```

---

# 9. Resource Monitoring

The benchmark should support Docker Compose execution.

Monitor resource usage where possible:

* CPU
* memory
* container restarts
* generator CPU
* generator memory
* service CPU
* service memory

The benchmark should record whether configured resource limits are enforced.

For example:

```json
{
  "resourceLimitsEnforced": true,
  "generator": {
    "cpus": 4,
    "memory": "1g"
  }
}
```

Do not silently ignore Docker resource constraints.

---

# 10. Reproducibility

The benchmark must be reproducible.

Use:

* deterministic random seed
* configurable endpoint
* configurable scenario durations
* configurable target rates
* configurable batch size
* configurable seed size
* configurable number of VUs where appropriate

Support environment variables/configuration such as:

```text
BASE_URL
SEED_SIZE
BATCH_SIZE
LOAD_RATE
DURATION_SCALE
```

`DURATION_SCALE` should allow local development runs without changing the benchmark definitions.

For example:

```text
DURATION_SCALE=0.1
```

should run approximately 10% of the configured durations.

The production/default configuration must still use the exact durations specified above.

---

# 11. JSON Report

Produce one final JSON report containing at least:

```json
{
  "tool": "@foothill/logs-benchmark",
  "generatedAt": "...",
  "mode": "compose",
  "endpoint": "...",
  "durationScale": 1,

  "correctness": {
    "passed": 0,
    "total": 0,
    "checks": []
  },

  "scenarios": [
    {
      "scenario": "load",
      "status": "completed",
      "offeredLogsPerSecond": 15000,
      "logsPerSecond": 0,
      "errorRate": 0,
      "latencyP95Ms": 0,
      "aggregateP95Ms": 0,
      "readAfterWriteSuccessRate": 0,
      "consistencyPassed": true,
      "acceptedRecords": 0,
      "visibleRecords": 0,
      "droppedIterations": 0,
      "generatorLimited": false,
      "serviceLimited": false
    }
  ],

  "score": {
    "correctness": {},
    "performance": {},
    "queries": {},
    "reliability": {}
  }
}
```

The report must preserve the individual phases of stress, spike, and breakpoint rather than hiding them behind a single aggregate number.

---

# 12. Scoring

Implement a transparent scoring system based on:

## Correctness — 15 points

Based on correctness checks.

## Performance — 50 points

Evaluate:

* achieved throughput
* error rate
* p95 ingestion latency
* sustained-load performance

## Queries — 15 points

Evaluate:

* aggregate p95 latency
* consistency
* read-after-write behavior

## Reliability — 20 points

Evaluate:

* scenario completion
* crash-free behavior
* recovery

Total:

```text
100 points
```

The scoring implementation must be deterministic and documented.

Do not invent arbitrary numbers without explaining the formula.

---

# 13. Important Benchmarking Rules

### Rule 1

Do not use target/offered throughput as achieved throughput.

### Rule 2

Do not classify generator saturation as application saturation.

### Rule 3

Do not classify eventual consistency delay as data loss unless records fail to become visible within the defined consistency window.

### Rule 4

Do not allow seeded data to contaminate correctness measurements.

Use unique identifiers/time ranges for benchmark-generated records.

### Rule 5

Measure ingestion and query latency independently.

### Rule 6

Do not make the benchmark itself the bottleneck.

The load generator must have enough CPU, memory, and VUs to generate the required load.

### Rule 7

The benchmark must remain useful if the application cannot reach 45,000 logs/s.

Failure at the breakpoint is a valid benchmark result.

### Rule 8

Never silently swallow errors.

All errors should be represented in the final report.

### Rule 9

Keep the benchmark code separate from application code where practical.

### Rule 10

Do not modify application behavior merely to make the benchmark pass.

---

# 14. Implementation Requirements

First inspect the existing repository.

Determine:

* language/runtime
* package manager
* existing k6 setup
* Docker Compose setup
* existing benchmark scripts
* API implementation
* database
* queue/buffering architecture
* existing test infrastructure

Reuse existing infrastructure where appropriate.

Do not blindly create duplicate tooling.

Implement the benchmark in the project's existing conventions.

The implementation should include:

* benchmark scenarios
* test-data generator
* seeding
* correctness tests
* load tests
* query tests
* consistency verification
* resource/limitation detection
* metrics collection
* scoring
* JSON report generation
* configuration
* documentation
* commands to run the benchmark

---

# 15. Expected Commands

Provide clear commands such as:

```bash
# Full benchmark
npm run benchmark

# Short local benchmark
DURATION_SCALE=0.1 npm run benchmark

# Correctness only
npm run benchmark:correctness

# Performance only
npm run benchmark:performance
```

Adapt these commands to the project's actual package manager and structure.

---

# 16. Reference Benchmark Output

Use the following existing benchmark output as a **reference for the structure and concepts**, not as hardcoded results:

[PASTE THE PROVIDED JSON REPORT HERE]

The new implementation must generate real values from the current application.

Do not hardcode:

* throughput
* latency
* error rate
* accepted records
* consistency
* score

---

# 17. Deliverables

At the end, provide:

1. All benchmark source files.
2. Configuration files.
3. Docker/k6 configuration if required.
4. Seed-data generator.
5. Correctness tests.
6. Load scenarios.
7. Query benchmark.
8. Consistency checker.
9. Resource/limitation detection.
10. Scoring implementation.
11. JSON report generation.
12. README documentation.
13. Exact commands for running the benchmark.
14. Example output generated from an actual run.

Before finishing:

* inspect the implementation for correctness
* run the benchmark at least once using a short `DURATION_SCALE`
* fix any errors
* verify that the generated JSON is valid
* verify that all five stages appear in the report
* verify that generator-limited and service-limited states are distinguishable
* verify that consistency is measured rather than assumed
* verify that p95 latency is calculated correctly

Do not stop at designing the architecture. **Actually implement the benchmark in the repository.**


# 18. Concrete Acceptance Thresholds

The benchmark must use the following explicit thresholds.

These thresholds are acceptance criteria for the benchmark implementation and service behavior. They must not be hidden or replaced with subjective judgments.

## A. Correctness — Hard Thresholds

The correctness stage **passes only if**:

* At least **15/15 mandatory correctness checks** pass.
* No valid ingestion request is incorrectly rejected.
* Invalid requests return the expected 4xx response.
* Partial-invalid batches correctly distinguish accepted and rejected records.
* Pagination contains:

  * no duplicates
  * no missing records
  * deterministic ordering
* Aggregation counts match the expected counts exactly for the controlled correctness dataset.
* No correctness check may be skipped because the system is under load.

Acceptance:

```text
correctnessPassed = passedChecks == totalChecks
```

Target:

```text
15 / 15
```

---

# B. Ingestion Performance

Performance is evaluated primarily on the **loading stage** and the sustainable portions of the stress test.

## Throughput

### Loading

Target:

```text
15,000 logs/s
```

Acceptance threshold:

```text
achieved throughput >= 14,250 logs/s
```

This represents at least **95% of the offered rate**.

If the load generator is demonstrably saturated, the scenario must be marked:

```text
generatorLimited = true
```

and must not be classified as a service failure.

### Stress

For each stress phase:

|        Target | Minimum accepted throughput |
| ------------: | --------------------------: |
| 15,000 logs/s |               14,250 logs/s |
| 22,500 logs/s |               21,375 logs/s |
| 30,000 logs/s |               28,500 logs/s |

These represent 95% of the target rate.

The benchmark must report the result independently for each phase.

---

# C. Ingestion Error Rate

For the loading and sustainable stress phases:

### PASS

```text
errorRate <= 1%
```

### WARNING

```text
1% < errorRate <= 5%
```

### FAIL

```text
errorRate > 5%
```

HTTP 5xx responses, connection failures, and timeouts count as errors.

Application-level rejected records must be reported separately from transport/request errors.

A validation rejection caused intentionally by the benchmark's invalid-test data must not be counted as a performance error.

---

# D. Ingestion p95 Latency

For sustained load:

### Loading

Target:

```text
p95 <= 500 ms
```

### Stress

Per phase:

```text
15k:  p95 <= 500 ms
22.5k: p95 <= 750 ms
30k: p95 <= 1,000 ms
```

Classification:

```text
PASS    = threshold satisfied
WARNING = <= 2x threshold
FAIL    = > 2x threshold
```

Example:

```text
30k target
threshold = 1000 ms

p95 = 850 ms   -> PASS
p95 = 1500 ms  -> WARNING
p95 = 2500 ms  -> FAIL
```

---

# E. Query Performance

The primary query performance metric is:

```text
GET /logs/aggregate p95
```

For normal operation and sustained ingestion:

### PASS

```text
aggregate p95 <= 1,000 ms
```

### WARNING

```text
1,000 ms < aggregate p95 <= 2,000 ms
```

### FAIL

```text
aggregate p95 > 2,000 ms
```

The benchmark should also measure `/logs` p95, but aggregate p95 is the primary query acceptance metric.

Aggregation correctness must still pass independently of latency.

---

# F. Eventual Consistency

Because ingestion may be asynchronous, define a fixed consistency window:

```text
CONSISTENCY_TIMEOUT = 30 seconds
```

After a successful ingestion request:

1. Record the expected benchmark-generated records.
2. Poll the query endpoint.
3. Continue until all records become visible or 30 seconds elapse.
4. Calculate the visibility rate.

### PASS

```text
readAfterWriteSuccessRate >= 99%
```

and:

```text
missingRecords == 0
```

after the consistency window for the controlled validation sample.

### WARNING

```text
95% <= readAfterWriteSuccessRate < 99%
```

### FAIL

```text
readAfterWriteSuccessRate < 95%
```

For aggregation consistency:

```text
actualCount == expectedCount
```

must eventually become true for the controlled verification dataset.

A temporary delay before the data becomes visible is **not data loss**.

---

# G. Data Integrity

For every performance scenario, calculate:

```text
acceptedRecords
visibleRecords
missingRecords
duplicateRecords
```

For a scenario to pass data integrity:

```text
duplicateRecords == 0
```

and after the consistency window:

```text
missingRecords == 0
```

For scenarios where the service intentionally fails at the breakpoint, data integrity must be reported separately and must not be silently converted into a throughput failure.

---

## Scenario completion

For loading, stress, and spike:

```text
scenarioCompletion = 100%
```

The benchmark must finish all configured phases unless the service becomes unavailable and the benchmark safely terminates the phase.

## Crash-free

For loading and stress:

```text
service restarts == 0
```

is the target.

For breakpoint:

A crash/restart is recorded as a reliability failure but does not invalidate the breakpoint measurement.

## Recovery

After a spike:

```text
health endpoint returns HTTP 200
```

within:

```text
30 seconds
```

after the spike ends.

---

# K. Generator-Limitation Acceptance

A scenario must be classified as `generatorLimited` when the load generator cannot produce the requested rate because of its own resource constraints.

Evidence should include at least one or more of:

```text
VU exhaustion
dropped iterations
generator CPU saturation
generator memory saturation
generator-side scheduling limitations
```

If:

```text
generatorLimited == true
```

the benchmark must:

1. report the scenario as generator-limited;
2. report the maximum achieved generator rate;
3. report service-side errors independently;
4. avoid claiming that the service reached its capacity.

A generator-limited scenario cannot be used to establish the application's maximum throughput.

---

# L. Service-Limitation Acceptance

A scenario should be classified as `serviceLimited` when the generator can produce the requested load but the application becomes the bottleneck.

Indicators include:

```text
generator has available VUs
generator CPU is not saturated
generator is not memory constrained
dropped iterations are not caused by generator exhaustion
service latency increases significantly
service errors increase
service throughput stops scaling
```

The report must make the distinction explicit:

```json
{
  "generatorLimited": false,
  "serviceLimited": true
}
```

Never set both values to `true` unless there is clear evidence that both components are independently constrained.

---

# M. Overall Scenario Classification

Each scenario/phase must receive one of:

```text
PASS
WARNING
FAIL
GENERATOR_LIMITED
SERVICE_LIMITED
```

Use the following precedence:

```text
GENERATOR_LIMITED
        ↓
SERVICE_LIMITED
        ↓
FAIL
        ↓
WARNING
        ↓
PASS
```

However, the report must preserve the underlying metrics so the classification is never the only information available.

---

# O. Important Interpretation Rule

The benchmark must **not** use a single threshold such as "45,000 logs/s must succeed."

This would make the breakpoint test meaningless.

Instead, the benchmark must answer:

1. What is the highest sustainable throughput?
2. At what rate does p95 latency begin to degrade?
3. At what rate does error rate become unacceptable?
4. Is the bottleneck the load generator or the service?
5. Does the service recover after a traffic spike?
6. Are accepted records eventually persisted?
7. Do aggregate queries remain correct and within the query latency target?

The final report must make these conclusions directly observable from the recorded metrics.
