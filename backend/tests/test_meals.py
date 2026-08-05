"""Meal history, corrections, deletion and daily totals."""

import pytest

from app.ml.predictor import Prediction


@pytest.fixture
def logged_meal(auth_client, meal_image, stub_predictor):
    """One classified meal, returned as the API's meal object."""
    filename, data, content_type = meal_image
    response = auth_client.post(
        "/classify", files={"image": (filename, data, content_type)}
    )
    assert response.status_code == 201, response.text
    return response.json()["meal"]


def test_meals_list_is_empty_for_a_new_user(auth_client):
    response = auth_client.get("/meals")
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_logged_meal_appears_in_history(auth_client, logged_meal):
    response = auth_client.get("/meals")
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == logged_meal["id"]


def test_meal_can_be_fetched_by_id(auth_client, logged_meal):
    response = auth_client.get(f"/meals/{logged_meal['id']}")
    assert response.status_code == 200
    assert response.json()["label"] == "Jollof Rice"


def test_missing_meal_returns_404(auth_client):
    assert auth_client.get("/meals/9999").status_code == 404


def test_another_users_meal_is_not_reachable(client, logged_meal, stub_predictor):
    # A second account must not be able to read the first account's meal, and
    # gets 404 rather than 403 so ids are not confirmed.
    client.headers.pop("Authorization", None)
    signup = client.post(
        "/auth/signup",
        json={"email": "mallory@example.com", "password": "another-password", "name": "M"},
    )
    token = signup.json()["access_token"]

    response = client.get(
        f"/meals/{logged_meal['id']}", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 404


def test_correcting_the_class_recomputes_macros(auth_client, logged_meal):
    # Jollof rice (152 kcal/100g) corrected to pounded yam (114 kcal/100g),
    # both at the stored 250g portion.
    response = auth_client.patch(
        f"/meals/{logged_meal['id']}", json={"corrected_class": "pounded_yam"}
    )
    assert response.status_code == 200

    body = response.json()
    assert body["food_class"] == "pounded_yam"
    assert body["label"] == "Pounded Yam"
    # The original prediction is preserved for error analysis.
    assert body["predicted_class"] == "jollof_rice"
    assert body["kcal"] == 285.0


def test_changing_the_portion_recomputes_macros(auth_client, logged_meal):
    response = auth_client.patch(
        f"/meals/{logged_meal['id']}", json={"portion_g": 100}
    )
    assert response.status_code == 200
    # 100g of jollof rice is exactly the per-100g figure.
    assert response.json()["kcal"] == 152.0


def test_unknown_correction_class_is_rejected(auth_client, logged_meal):
    response = auth_client.patch(
        f"/meals/{logged_meal['id']}", json={"corrected_class": "spaghetti_bolognese"}
    )
    assert response.status_code == 422


def test_meal_can_be_deleted_with_its_image(auth_client, logged_meal, media_root):
    assert len(list(media_root.rglob("*.jpg"))) == 1

    assert auth_client.delete(f"/meals/{logged_meal['id']}").status_code == 204
    assert auth_client.get(f"/meals/{logged_meal['id']}").status_code == 404
    # The file is cleaned up too, not just the row.
    assert list(media_root.rglob("*.jpg")) == []


def test_history_is_paginated(auth_client, meal_image, stub_predictor):
    filename, data, content_type = meal_image
    for _ in range(5):
        auth_client.post("/classify", files={"image": (filename, data, content_type)})

    page = auth_client.get("/meals?limit=2&offset=0").json()
    assert page["total"] == 5
    assert len(page["items"]) == 2

    second = auth_client.get("/meals?limit=2&offset=2").json()
    assert len(second["items"]) == 2
    # Pages must not overlap.
    assert {m["id"] for m in page["items"]}.isdisjoint(
        {m["id"] for m in second["items"]}
    )


def test_daily_summary_sums_todays_meals(auth_client, meal_image, stub_predictor):
    filename, data, content_type = meal_image
    auth_client.post("/classify", files={"image": (filename, data, content_type)})

    stub_predictor.predictions = [Prediction("pizza", "Pizza", 0.88)]
    auth_client.post("/classify", files={"image": (filename, data, content_type)})

    response = auth_client.get("/summary/daily")
    assert response.status_code == 200
    body = response.json()

    # Jollof 250g at 152/100g = 380, pizza 200g at 266/100g = 532.
    assert body["consumed"]["kcal"] == pytest.approx(912.0)
    assert body["meal_count"] == 2
    assert body["goals"]["kcal"] == 2200.0


def test_daily_summary_is_zero_with_no_meals(auth_client):
    body = auth_client.get("/summary/daily").json()
    assert body["consumed"]["kcal"] == 0
    assert body["meal_count"] == 0


def test_summary_reflects_a_correction(auth_client, logged_meal):
    auth_client.patch(
        f"/meals/{logged_meal['id']}", json={"corrected_class": "pounded_yam"}
    )
    body = auth_client.get("/summary/daily").json()
    # Totals follow the correction rather than the original prediction.
    assert body["consumed"]["kcal"] == pytest.approx(285.0)
