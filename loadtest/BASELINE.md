# Load Test Baseline Results

## Test Environment

| Parameter          | Value                                      |
|--------------------|--------------------------------------------|
| Server             | gunicorn + 4 uvicorn workers               |
| Database           | PostgreSQL 16 (local)                       |
| Machine            | 4-core CPU, 8 GB RAM                       |
| Python             | 3.12                                        |
| Test tool          | Locust 2.x                                  |
| Duration           | 60 seconds per scenario                     |
| Ramp-up            | 5 users/second                              |

## Scenario 1: Mixed Traffic (50 concurrent users)

```
locust -f loadtest/locustfile.py --host http://localhost:8000 \
    --headless -u 50 -r 5 --run-time 60s
```

| Metric                  | Value        |
|-------------------------|--------------|
| Total requests          | ~4,200       |
| Requests/sec (avg)      | ~70 RPS      |
| Median response time    | 12 ms        |
| 95th percentile         | 45 ms        |
| 99th percentile         | 120 ms       |
| Error rate              | 0%           |
| Peak concurrent         | 50           |

### Per-endpoint breakdown

| Endpoint                      | Median (ms) | p95 (ms) | RPS  |
|-------------------------------|-------------|----------|------|
| GET /health                   | 2           | 5        | 18.2 |
| GET /health/ready             | 8           | 25       | 5.5  |
| GET /api/auth/me              | 10          | 30       | 9.1  |
| GET /api/i18n/languages       | 3           | 8        | 5.5  |
| GET /api/i18n/translations/*  | 5           | 12       | 5.5  |
| POST /api/i18n/voice-command  | 15          | 50       | 3.6  |
| GET /api/webhooks/events      | 4           | 10       | 3.6  |
| GET /api/payments/config      | 8           | 22       | 5.5  |
| GET /api/payments/history     | 12          | 35       | 3.6  |
| POST /api/payments/record-*   | 18          | 55       | 1.8  |
| GET /api/scheduler/jobs       | 5           | 15       | 1.8  |
| GET /api/whatsapp/status      | 3           | 8        | 1.8  |
| GET /api/plugins              | 2           | 5        | 1.8  |

## Scenario 2: Cashier POS Burst (30 concurrent users)

```
locust -f loadtest/locustfile.py --host http://localhost:8000 \
    --headless -u 30 -r 10 --run-time 60s CashierUser
```

| Metric                  | Value        |
|-------------------------|--------------|
| Total requests          | ~5,400       |
| Requests/sec (avg)      | ~90 RPS      |
| Median response time    | 8 ms         |
| 95th percentile         | 25 ms        |
| 99th percentile         | 65 ms        |
| Error rate              | 0%           |

### Per-endpoint breakdown

| Endpoint                       | Median (ms) | p95 (ms) | RPS  |
|--------------------------------|-------------|----------|------|
| GET /api/mobile/barcode/search | 6           | 18       | 50.0 |
| GET /api/mobile/barcode/*      | 5           | 15       | 25.0 |
| POST /api/payments/record-*    | 15          | 40       | 15.0 |

## Scenario 3: Stress Test (200 concurrent users)

```
locust -f loadtest/locustfile.py --host http://localhost:8000 \
    --headless -u 200 -r 20 --run-time 60s
```

| Metric                  | Value        |
|-------------------------|--------------|
| Total requests          | ~12,000      |
| Requests/sec (avg)      | ~200 RPS     |
| Median response time    | 35 ms        |
| 95th percentile         | 180 ms       |
| 99th percentile         | 450 ms       |
| Error rate              | ~0.3%        |
| Rate-limited (429)      | ~0.3%        |

**Notes:**
- 429 errors appear at ~120 RPS per IP due to rate limiter (by design)
- No 500 errors observed
- Memory usage stayed under 400 MB across 4 workers
- CPU peaked at ~75% on 4 cores

## Capacity Estimates

Based on baseline results with 4 workers on a 4-core machine:

| Deployment size | Workers | Expected RPS | p95 latency |
|-----------------|---------|-------------|-------------|
| 1 pod (2 CPU)   | 2       | ~100        | ~50 ms      |
| 2 pods (2 CPU)  | 4       | ~200        | ~45 ms      |
| 4 pods (2 CPU)  | 8       | ~400        | ~40 ms      |
| 8 pods (2 CPU)  | 16      | ~700        | ~50 ms      |

**Bottleneck analysis:**
- Database connections are the primary bottleneck at scale
- Connection pooling (PgBouncer) recommended above 4 pods
- Redis recommended for session/rate-limit state above 2 pods
- WebSocket connections limited to ~1,000 per pod

## Reproducing Results

```bash
# 1. Start the server
docker-compose up -d

# 2. Run baseline
pip install locust
locust -f loadtest/locustfile.py --host http://localhost:8000 \
    --headless -u 50 -r 5 --run-time 60s --csv=loadtest/results

# 3. Results saved to loadtest/results_*.csv
```

## Acceptance Criteria

For production readiness, all of these should hold under 50 concurrent users:

- [ ] p95 latency < 100 ms for read endpoints
- [ ] p95 latency < 200 ms for write endpoints
- [ ] Error rate < 0.1%
- [ ] No memory leaks (RSS stable over 10 min run)
- [ ] Zero 500 errors
