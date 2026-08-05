"""Converting ORM rows into response models.

Kept separate because a Meal response needs a couple of things the row itself
does not carry: the display label from the nutrition table, and a URL built
from the stored relative path.
"""

from app.models import Meal
from app.nutrition import get_class
from app.schemas import MealOut
from app.storage import image_url


def serialize_meal(meal: Meal) -> MealOut:
    key = meal.food_class
    food = get_class(key)

    return MealOut(
        id=meal.id,
        image_url=image_url(meal.image_path),
        predicted_class=meal.predicted_class,
        corrected_class=meal.corrected_class,
        food_class=key,
        label=food.label if food else key.replace("_", " ").title(),
        confidence=meal.confidence,
        portion_g=meal.portion_g,
        kcal=meal.kcal,
        protein_g=meal.protein_g,
        carbs_g=meal.carbs_g,
        fat_g=meal.fat_g,
        meal_tag=meal.meal_tag,
        eaten_at=meal.eaten_at,
    )
