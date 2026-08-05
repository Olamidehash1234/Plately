"""Meal history, corrections and daily totals."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import Meal
from app.nutrition import get_class
from app.schemas import (
    DailySummary,
    DailyTotals,
    MealOut,
    MealPage,
    MealUpdate,
)
from app.serializers import serialize_meal
from app.storage import delete_image

router = APIRouter(tags=["meals"])


def _get_owned_meal(meal_id: int, user_id: int, db) -> Meal:
    meal = db.get(Meal, meal_id)
    # 404 rather than 403 for someone else's meal, so the API does not confirm
    # that a given id exists.
    if meal is None or meal.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found."
        )
    return meal


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


@router.get("/meals", response_model=MealPage)
def list_meals(
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    on: Annotated[date | None, Query(description="Only meals eaten on this day")] = None,
    since: Annotated[date | None, Query()] = None,
) -> MealPage:
    conditions = [Meal.user_id == user.id]

    if on is not None:
        start, end = _day_bounds(on)
        conditions.extend([Meal.eaten_at >= start, Meal.eaten_at < end])
    elif since is not None:
        start, _ = _day_bounds(since)
        conditions.append(Meal.eaten_at >= start)

    total = db.scalar(select(func.count()).select_from(Meal).where(*conditions)) or 0

    rows = db.scalars(
        select(Meal)
        .where(*conditions)
        .order_by(Meal.eaten_at.desc(), Meal.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return MealPage(
        items=[serialize_meal(m) for m in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/meals/{meal_id}", response_model=MealOut)
def get_meal(meal_id: int, user: CurrentUser, db: DbSession) -> MealOut:
    return serialize_meal(_get_owned_meal(meal_id, user.id, db))


@router.patch("/meals/{meal_id}", response_model=MealOut)
def update_meal(
    meal_id: int, payload: MealUpdate, user: CurrentUser, db: DbSession
) -> MealOut:
    """Correct a misclassification or adjust the portion.

    Changing either the class or the portion recomputes the stored macros, so
    the dashboard totals stay consistent with what the user actually sees.
    """
    meal = _get_owned_meal(meal_id, user.id, db)
    fields = payload.model_dump(exclude_unset=True)

    if "corrected_class" in fields:
        corrected = fields["corrected_class"]
        if corrected is not None and get_class(corrected) is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Unknown food class '{corrected}'.",
            )
        meal.corrected_class = corrected

    if fields.get("portion_g") is not None:
        meal.portion_g = fields["portion_g"]

    if fields.get("meal_tag") is not None:
        meal.meal_tag = fields["meal_tag"]

    if fields.get("eaten_at") is not None:
        meal.eaten_at = fields["eaten_at"]

    food = get_class(meal.food_class)
    if food is not None:
        macros = food.per_100g.scaled(meal.portion_g)
        meal.kcal = macros.kcal
        meal.protein_g = macros.protein_g
        meal.carbs_g = macros.carbs_g
        meal.fat_g = macros.fat_g

    db.commit()
    db.refresh(meal)
    return serialize_meal(meal)


@router.delete("/meals/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal(meal_id: int, user: CurrentUser, db: DbSession) -> None:
    meal = _get_owned_meal(meal_id, user.id, db)
    image_path = meal.image_path

    db.delete(meal)
    db.commit()

    # Only after the row is gone, so a failed commit cannot leave a meal
    # pointing at a deleted file.
    delete_image(image_path)


@router.get("/summary/daily", response_model=DailySummary)
def daily_summary(
    user: CurrentUser,
    db: DbSession,
    on: Annotated[date | None, Query(description="Defaults to today (UTC)")] = None,
) -> DailySummary:
    day = on or datetime.now(timezone.utc).date()
    start, end = _day_bounds(day)

    row = db.execute(
        select(
            func.coalesce(func.sum(Meal.kcal), 0.0),
            func.coalesce(func.sum(Meal.protein_g), 0.0),
            func.coalesce(func.sum(Meal.carbs_g), 0.0),
            func.coalesce(func.sum(Meal.fat_g), 0.0),
            func.count(Meal.id),
        ).where(Meal.user_id == user.id, Meal.eaten_at >= start, Meal.eaten_at < end)
    ).one()

    kcal, protein, carbs, fat, count = row

    return DailySummary(
        date=day.isoformat(),
        consumed=DailyTotals(
            kcal=round(float(kcal), 1),
            protein_g=round(float(protein), 1),
            carbs_g=round(float(carbs), 1),
            fat_g=round(float(fat), 1),
        ),
        goals=DailyTotals(
            kcal=float(user.daily_kcal_goal),
            protein_g=float(user.daily_protein_goal_g),
            carbs_g=float(user.daily_carbs_goal_g),
            fat_g=float(user.daily_fat_goal_g),
        ),
        meal_count=int(count),
    )
