# 1- First inspect the existing repository.


# 2- Correctness before start testing

At minimum verify:
### Correctness Tests — Log Ingestion & Query Service

1. **Multiple log ingestion**  
    Verify that all submitted logs are stored correctly with no missing or duplicate logs.
2. **Time-range query**  
    Verify that only logs within the requested time range are returned.
3. **Query limit**  
    Verify that the API returns no more than the requested number of logs.
4. **Cursor pagination**  
    Verify that pagination returns the correct logs without duplicates or missing records.
5. **Log-level filtering**  
    Verify that only logs matching the requested log level are returned.
6. **Service filtering**  
    Verify that only logs belonging to the requested service are returned.
7. **Time-bucket aggregation**  
    Verify that aggregated counts match the actual logs in each requested time bucket.
  

# 3- Measure ingestion and query latency independently.
