CREATE MATERIALIZED VIEW logs_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', timestamp) AS bucket,
    service,
    level,
    count(*)::bigint AS count
FROM logs
GROUP BY bucket, service, level
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'logs_1m',
    start_offset => INTERVAL '5 minutes',
    end_offset => INTERVAL '0 seconds',
    schedule_interval => INTERVAL '15 seconds'
);


-- CREATE MATERIALIZED VIEW logs_1m
-- WITH (timescaledb.continuous) AS
-- SELECT
--     time_bucket('1 minute', timestamp) AS bucket,
--     service,
--     level,
--     count(*)::bigint AS count
-- FROM logs
-- GROUP BY
--     bucket,
--     service,
--     level;
-- SELECT add_continuous_aggregate_policy(
--     'logs_1m',
--     start_offset => INTERVAL '1 hour',
--     end_offset => INTERVAL '1 minute',
--     schedule_interval => INTERVAL '1 minute'
-- );