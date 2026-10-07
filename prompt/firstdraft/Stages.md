## Seeding

Before performance scenarios begin, seed the database with a meaningful amount of historical log data. 1,000,000 valid log records

The seed data must be deterministic/reproducible.

### Date Range
The seed data must cover the previous 30 days ending today. The benchmark date range must be calculated dynamically when the benchmark starts.

For example, if the benchmark runs on:

2026-09-02

the seed dataset should cover:

2026-08-03 → 2026-09-02

Do not hardcode these dates.

### Data

Seed records should contain a realistic distribution of:

- timestamps
- log levels
- services
- messages
- attributes

The seeded data must be used by query and aggregation benchmarks.

### Record:

- seed duration
- number of records attempted
- number accepted
- number rejected
- resulting dataset size

The seed phase must finish successfully before the load tests begin.

---
# performance test
the metrics that need to masure for all the testing stages:

- achieved throughput
- offered throughput
- HTTP errors
- application errors
- request latency
- p95 latency
- accepted records
- rejected records
- dropped iterations
- aggregate query p95
- consistency

for [spike](#spike_id) and [breakpoint](#breakpoint_id) stages do the following:
- System Health
    - Check if the service stops.
    - Check if the application can recovere without restart.
    - Calculate the time that the service needs to recover. 
- System Performance
    - Compare throughput before and during spike. 
    - Calculate how many request lost.
    - Check if the record is instantly readable after write. 
    - Detect inconsistancy in data aggrigation.

Do not report the offered rate as the actual throughput.

Actual throughput must be calculated from successfully processed/accepted records and elapsed time.


## Stage 1 — Loading

Sustain:

**15,000 logs/second for 120 seconds**

---

## Stage 2 — Stress


Run the following progression:

**15,000 logs/s for 30s** → **22,500 logs/s for 60s** → **30,000 logs/s for 60s**

---

## Stage 3 — Spike{#spike_id}

Run:

**7,500 logs/s for 30s** → **30,000 logs/s for 10s** → **7,500 logs/s for 60s**

This scenario evaluates:

1. normal operation
2. sudden traffic spike
3. recovery after the spike


The final recovery phase must be evaluated independently rather than averaged together with the spike.

---

## Stage 4 — Breakpoint{#breakpoint_id}
Increase the load progressively:

**15,000 logs/s for 30s** → **22,500 logs/s for 30s** → **30,000 logs/s for 30s** → **45,000 logs/s for 30s**

The purpose is to identify the system's practical capacity and breaking point.

Do not assume that 45,000 logs/s is achievable.

If the service fails at a particular stage cleanup/recovery where possible.
