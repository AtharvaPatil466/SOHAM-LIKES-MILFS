"""Integration tests for endpoints that are still registered."""

import pytest

from tests.conftest import register_user, auth_header


@pytest.mark.asyncio
async def test_shelf_audit_status(client):
    reg = await register_user(client, "shelf_user", "cashier")
    resp = await client.get("/api/shelf-audit/status", headers=auth_header(reg["token"]))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_api_version_endpoint(client):
    reg = await register_user(client, "ver_user", "cashier")
    resp = await client.get("/api/version", headers=auth_header(reg["token"]))
    assert resp.status_code == 200
    data = resp.json()
    assert "current_version" in data


@pytest.mark.asyncio
async def test_versioned_endpoint_works(client):
    """Test that /health endpoint works."""
    resp = await client.get("/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_legacy_endpoint_deprecation_header(client):
    """Test that legacy /api/ routes include deprecation headers."""
    reg = await register_user(client, "legacy_user", "cashier")
    resp = await client.get("/api/webhooks/events", headers=auth_header(reg["token"]))
    assert resp.status_code == 200
    assert resp.headers.get("Deprecation") == "true"


@pytest.mark.asyncio
async def test_websocket_stats(client):
    reg = await register_user(client, "ws_user", "owner")
    resp = await client.get("/api/ws/stats", headers=auth_header(reg["token"]))
    assert resp.status_code == 200
    data = resp.json()
    assert "active_connections" in data
    assert "available_channels" in data


@pytest.mark.asyncio
async def test_scheduler_jobs(client):
    reg = await register_user(client, "sched_user", "owner")
    resp = await client.get("/api/scheduler/jobs", headers=auth_header(reg["token"]))
    assert resp.status_code == 200
