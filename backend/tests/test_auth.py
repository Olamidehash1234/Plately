"""Signup, login and token handling."""

import pytest


def test_signup_returns_token_and_user(client):
    response = client.post(
        "/auth/signup",
        json={"email": "new@example.com", "password": "a-good-password", "name": "New"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "new@example.com"
    # The hash must never leave the server.
    assert "hashed_password" not in body["user"]
    assert "password" not in body["user"]


def test_email_is_normalised_to_lowercase(client):
    client.post(
        "/auth/signup",
        json={"email": "Mixed@Example.COM", "password": "a-good-password", "name": "M"},
    )
    response = client.post(
        "/auth/login",
        json={"email": "mixed@example.com", "password": "a-good-password"},
    )
    assert response.status_code == 200


def test_duplicate_email_is_rejected(client):
    payload = {"email": "dup@example.com", "password": "a-good-password", "name": "D"}
    assert client.post("/auth/signup", json=payload).status_code == 201
    assert client.post("/auth/signup", json=payload).status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": "a-good-password", "name": "X"},
        {"email": "x@example.com", "password": "short", "name": "X"},
        {"email": "x@example.com", "password": "a-good-password", "name": ""},
    ],
)
def test_invalid_signup_payloads_are_rejected(client, payload):
    assert client.post("/auth/signup", json=payload).status_code == 422


def test_password_over_bcrypt_limit_is_rejected(client):
    response = client.post(
        "/auth/signup",
        json={"email": "long@example.com", "password": "x" * 200, "name": "L"},
    )
    # Rejected rather than silently truncated at 72 bytes.
    assert response.status_code == 422


def test_login_with_wrong_password_fails(auth_client):
    response = auth_client.post(
        "/auth/login", json={"email": "ada@example.com", "password": "wrong"}
    )
    assert response.status_code == 401


def test_unknown_email_and_wrong_password_are_indistinguishable(client):
    client.post(
        "/auth/signup",
        json={"email": "real@example.com", "password": "a-good-password", "name": "R"},
    )
    wrong_password = client.post(
        "/auth/login", json={"email": "real@example.com", "password": "nope"}
    )
    unknown_email = client.post(
        "/auth/login", json={"email": "ghost@example.com", "password": "nope"}
    )
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_me_requires_a_token(client):
    assert client.get("/auth/me").status_code == 401


def test_me_rejects_a_garbage_token(client):
    response = client.get(
        "/auth/me", headers={"Authorization": "Bearer not.a.real.token"}
    )
    assert response.status_code == 401


def test_me_returns_the_current_user(auth_client):
    response = auth_client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "ada@example.com"


def test_goals_can_be_updated(auth_client):
    response = auth_client.patch("/auth/me", json={"daily_kcal_goal": 2600})
    assert response.status_code == 200
    assert response.json()["daily_kcal_goal"] == 2600
    # Unspecified fields are left alone.
    assert response.json()["daily_protein_goal_g"] == 150


def test_absurd_goals_are_rejected(auth_client):
    assert auth_client.patch("/auth/me", json={"daily_kcal_goal": 50}).status_code == 422
