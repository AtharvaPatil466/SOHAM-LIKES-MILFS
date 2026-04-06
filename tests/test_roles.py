"""Role-based access control tests — verify role hierarchy enforcement."""

import pytest

from tests.conftest import register_user, auth_header


@pytest.mark.asyncio
async def test_owner_can_list_users(client):
    reg = await register_user(client, "role_owner1", "owner")
    resp = await client.get("/api/auth/users", headers=auth_header(reg["token"]))
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_staff_cannot_list_users(client):
    reg = await register_user(client, "role_staff1", "staff")
    resp = await client.get("/api/auth/users", headers=auth_header(reg["token"]))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cashier_cannot_list_users(client):
    reg = await register_user(client, "role_cashier1", "cashier")
    resp = await client.get("/api/auth/users", headers=auth_header(reg["token"]))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cashier_can_access_me(client):
    reg = await register_user(client, "role_cashier2", "cashier")
    resp = await client.get("/api/auth/me", headers=auth_header(reg["token"]))
    assert resp.status_code == 200
    assert resp.json()["role"] == "cashier"


@pytest.mark.asyncio
async def test_owner_can_register_webhook(client):
    reg = await register_user(client, "role_owner2", "owner")
    resp = await client.post("/api/webhooks", headers=auth_header(reg["token"]), json={
        "url": "https://example.com/hook",
        "events": ["order.created"],
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "registered"


@pytest.mark.asyncio
async def test_staff_cannot_register_webhook(client):
    reg = await register_user(client, "role_staff2", "staff")
    resp = await client.post("/api/webhooks", headers=auth_header(reg["token"]), json={
        "url": "https://example.com/hook",
        "events": ["order.created"],
    })
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invalid_token_rejected(client):
    resp = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_rejected(client):
    from auth.security import create_access_token
    token = create_access_token({"sub": "fake-id", "role": "owner"}, expires_delta=-10)
    resp = await client.get("/api/auth/me", headers=auth_header(token))
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_owner_can_deactivate_user(client):
    owner = await register_user(client, "deact_owner", "owner")
    staff = await register_user(client, "deact_staff", "staff")
    resp = await client.patch(
        f"/api/auth/users/{staff['user']['id']}/deactivate",
        headers=auth_header(owner["token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_owner_cannot_deactivate_self(client):
    owner = await register_user(client, "selfdeact_owner", "owner")
    resp = await client.patch(
        f"/api/auth/users/{owner['user']['id']}/deactivate",
        headers=auth_header(owner["token"]),
    )
    assert resp.status_code == 400
    assert "yourself" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_staff_cannot_deactivate_users(client):
    staff = await register_user(client, "deact_staff2", "staff")
    resp = await client.patch(
        "/api/auth/users/some-id/deactivate",
        headers=auth_header(staff["token"]),
    )
    assert resp.status_code == 403
