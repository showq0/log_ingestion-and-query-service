# Implement a Performance Benchmark Suite

Create a automated **k6 benchmark suite** (`grafana/k6:0.54.0`) to rigorously evaluate a distributed Log Ingestion and Query Service. The benchmark must validate correctness, measure steady-state and stress performance, test eventual consistency and recovery, distinguish **generator limitations from service limitations**, and produce structured benchmark reports.

# 2. outcome 
outcome is command to run the grafana to test my project and return me a report. 

---

## 2. Benchmark Specification & Environment

- **Runner Image:** `grafana/k6:0.54.0` executed within Docker.
- **Generator Allocation:** 4 allocated CPUs, 1 GB memory limit, isolated network bridge.
- **Target Application:** Distributed service running via Docker Compose (App: Express/Node.js, Queue: Redis/BullMQ, Storage: ClickHouse MergeTree).
- **Target Endpoint:** Default to `http://127.0.0.1:8080` (configurable via `BASE_URL` environment variable).

The benchmark runner must capture and report generator runtime metadata:
- Docker image & version tag
- Generator allocated CPU and memory limits
- Configured VUs (virtual users) and maximum VUs allocated
- Whether the load generator itself saturated or became the bottleneck (`generatorLimited`)

---

## 3. Required Output & Reporting

The benchmark must output results in two formats:

1. **JSON Report (`benchmark-report.json`)**:
   - Environment metadata (engine CPUs, memory, generator specs, isolation flag).
   - Correctness test results.
   - Scenario results array (`load`, `stress`, `spike`, `breakpoint`) containing:
     - `scenario`, `status`, `logsPerSecond`, `offeredLogsPerSecond`, `errorRate`
     - `latencyP95Ms`, `aggregateP95Ms`, `acceptedRecords`, `visibleRecords`
     - `droppedIterations`, `generatorLimited`, `serviceLimited`
     - `readAfterWriteSuccessRate`, `consistencyPassed`, `thresholdPassed`
   - Composite Breakdown:
     - Correctness all case
     - Performance throughput, errors, latency, sustained bonus
     - Queries & Consistency aggregate latency, eventual consistency, RAW
     - Reliability scenario completion, crash-free execution

---

## 4. Execution Workflow & Structure

Follow the referenced specifications:
- **Execution Rules & Pre-requisites:** [[Rules]]
- **API Endpoints & Schemas:** [[Endpoints]]
- **Seeding & Load Scenarios:** [[Stages]]