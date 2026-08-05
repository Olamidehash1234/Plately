"""Meal photo classification."""

import logging
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.config import settings
from app.deps import CurrentUser, DbSession
from app.ml.predictor import ModelUnavailableError, predictor
from app.models import Meal
from app.nutrition import get_class, load_classes
from app.schemas import ClassifyResponse, FoodClassOut, PredictionOut
from app.serializers import serialize_meal
from app.storage import load_image, read_upload, save_image

logger = logging.getLogger(__name__)
router = APIRouter(tags=["classify"])


@router.get("/food-classes", response_model=list[FoodClassOut])
def food_classes() -> list[FoodClassOut]:
    """The classes the system knows, for correction dropdowns in the UI."""
    return [
        FoodClassOut(
            key=food.key,
            label=food.label,
            cuisine=food.cuisine,
            per_100g=food.per_100g.__dict__,
            default_portion_g=food.default_portion_g,
            source=food.source,
        )
        for food in sorted(load_classes().values(), key=lambda f: f.label)
    ]


@router.get("/classify/status", tags=["meta"])
def classify_status() -> dict[str, object]:
    """Whether inference is currently available, and why not if it isn't."""
    error = predictor.availability_error()
    return {"ready": error is None, "reason": error}


@router.post(
    "/classify", response_model=ClassifyResponse, status_code=status.HTTP_201_CREATED
)
async def classify(
    user: CurrentUser,
    db: DbSession,
    image: Annotated[UploadFile, File(description="Photo of the meal")],
    portion_g: Annotated[float | None, Form()] = None,
    meal_tag: Annotated[str, Form()] = "Meal",
) -> ClassifyResponse:
    """Classify a meal photo, store it, and log the meal against the user."""
    data = await read_upload(image)
    decoded = load_image(data)

    try:
        predictions = predictor.predict(decoded, top_k=3)
    except ModelUnavailableError as exc:
        # Expected before training has produced a model — not an error worth
        # a stack trace, but the client needs to know why.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Inference failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Classification failed while processing that image.",
        ) from exc

    best = predictions[0]
    food = get_class(best.key)
    if food is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"The model predicted '{best.key}', which is missing from the "
                "nutrition table. Model and table are out of sync."
            ),
        )

    # Only store the image once we know inference succeeded, so a failed
    # request does not leave an orphaned file behind.
    relative_path = save_image(decoded, user.id)

    grams = portion_g if portion_g and portion_g > 0 else float(food.default_portion_g)
    macros = food.per_100g.scaled(grams)

    meal = Meal(
        user_id=user.id,
        image_path=relative_path,
        predicted_class=best.key,
        confidence=best.confidence,
        portion_g=grams,
        kcal=macros.kcal,
        protein_g=macros.protein_g,
        carbs_g=macros.carbs_g,
        fat_g=macros.fat_g,
        meal_tag=meal_tag,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    return ClassifyResponse(
        meal=serialize_meal(meal),
        alternatives=[
            PredictionOut(key=p.key, label=p.label, confidence=p.confidence)
            for p in predictions
        ],
        low_confidence=best.confidence < settings.low_confidence_threshold,
    )
