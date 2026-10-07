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
