CREATE EXTENSION IF NOT EXISTS timescaledb;

SELECT create_hypertable(
    'logs',
    'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

SELECT add_dimension(
    'logs',
    by_hash('service', 32)
);
