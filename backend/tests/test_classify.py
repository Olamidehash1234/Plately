"""Upload validation, inference wiring and the nutrition calculation."""

import io

from PIL import Image

from app.ml.predictor import Prediction


def post_image(client, image, **form):
    filename, data, content_type = image
    return client.post(
        "/classify",
        files={"image": (filename, data, content_type)},
        data=form or None,
    )


def test_classify_requires_authentication(client, meal_image, stub_predictor):
    filename, data, content_type = meal_image
    response = client.post(
        "/classify", files={"image": (filename, data, content_type)}
    )
    assert response.status_code == 401


def test_classify_returns_prediction_and_macros(auth_client, meal_image, stub_predictor):
    response = post_image(auth_client, meal_image)
    assert response.status_code == 201, response.text

    body = response.json()
    meal = body["meal"]

    assert meal["predicted_class"] == "jollof_rice"
    assert meal["label"] == "Jollof Rice"
    assert meal["confidence"] == 0.92
    assert body["low_confidence"] is False

    # Default portion for jollof rice is 250g at 152 kcal/100g.
    assert meal["portion_g"] == 250
    assert meal["kcal"] == 380.0

    # Ranked alternatives are returned for the correction UI.
    assert [a["key"] for a in body["alternatives"]] == [
        "jollof_rice",
        "fried_rice",
        "moi_moi",
    ]


def test_explicit_portion_scales_the_macros(auth_client, meal_image, stub_predictor):
    response = post_image(auth_client, meal_image, portion_g=500)
    meal = response.json()["meal"]
    assert meal["portion_g"] == 500
    # Twice the default portion, so twice the calories.
    assert meal["kcal"] == 760.0


def test_low_confidence_is_flagged(auth_client, meal_image, stub_predictor):
    stub_predictor.predictions = [
        Prediction("amala", "Amala", 0.31),
        Prediction("eba", "Eba", 0.29),
        Prediction("pounded_yam", "Pounded Yam", 0.25),
    ]
    response = post_image(auth_client, meal_image)
    assert response.status_code == 201
    # Under the 0.55 threshold, so the UI should ask rather than assert.
    assert response.json()["low_confidence"] is True


def test_missing_model_returns_503(auth_client, meal_image, stub_predictor):
    stub_predictor.error = "No trained model found."
    response = post_image(auth_client, meal_image)
    assert response.status_code == 503
    assert "No trained model" in response.json()["detail"]


def test_non_image_upload_is_rejected(auth_client, stub_predictor):
    response = auth_client.post(
        "/classify",
        files={"image": ("fake.jpg", b"definitely not an image", "image/jpeg")},
    )
    assert response.status_code == 422


def test_unsupported_content_type_is_rejected(auth_client, meal_image, stub_predictor):
    _, data, _ = meal_image
    response = auth_client.post(
        "/classify", files={"image": ("doc.pdf", data, "application/pdf")}
    )
    assert response.status_code == 422


def test_empty_upload_is_rejected(auth_client, stub_predictor):
    response = auth_client.post(
        "/classify", files={"image": ("empty.jpg", b"", "image/jpeg")}
    )
    assert response.status_code == 422


def test_oversized_upload_is_rejected(auth_client, stub_predictor, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_bytes", 1024)

    buffer = io.BytesIO()
    Image.new("RGB", (900, 900), (10, 200, 40)).save(buffer, format="PNG")

    response = auth_client.post(
        "/classify", files={"image": ("big.png", buffer.getvalue(), "image/png")}
    )
    assert response.status_code == 413


def test_failed_inference_leaves_no_orphaned_file(
    auth_client, meal_image, stub_predictor, media_root
):
    stub_predictor.error = "No trained model found."
    post_image(auth_client, meal_image)
    # The image is only written once inference has succeeded.
    assert list(media_root.rglob("*.jpg")) == []


def test_successful_classification_stores_the_image(
    auth_client, meal_image, stub_predictor, media_root
):
    response = post_image(auth_client, meal_image)
    stored = list(media_root.rglob("*.jpg"))
    assert len(stored) == 1
    assert response.json()["meal"]["image_url"].startswith("/media/user_")


def test_food_classes_endpoint_lists_all_twelve(client):
    response = client.get("/food-classes")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 12
    assert {"jollof_rice", "egusi_soup", "pizza"} <= {c["key"] for c in body}


def test_classify_status_reports_readiness(client):
    response = client.get("/classify/status")
    assert response.status_code == 200
    assert set(response.json()) == {"ready", "reason"}
