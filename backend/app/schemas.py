"""Request and response models."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --- Auth -------------------------------------------------------------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=120)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoalsUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    daily_kcal_goal: int | None = Field(default=None, ge=800, le=8000)
    daily_protein_goal_g: int | None = Field(default=None, ge=10, le=500)
    daily_carbs_goal_g: int | None = Field(default=None, ge=10, le=1000)
    daily_fat_goal_g: int | None = Field(default=None, ge=10, le=400)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    daily_kcal_goal: int
    daily_protein_goal_g: int
    daily_carbs_goal_g: int
    daily_fat_goal_g: int
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Food classes -----------------------------------------------------------
class MacrosOut(BaseModel):
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float


class FoodClassOut(BaseModel):
    key: str
    label: str
    cuisine: str
    per_100g: MacrosOut
    default_portion_g: int
    source: str


# --- Classification ---------------------------------------------------------
class PredictionOut(BaseModel):
    """A single candidate from the model's softmax output."""

    key: str
    label: str
    confidence: float


class MealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    image_url: str
    predicted_class: str
    corrected_class: str | None
    food_class: str
    label: str
    confidence: float
    portion_g: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    meal_tag: str
    eaten_at: datetime


class ClassifyResponse(BaseModel):
    meal: MealOut
    # Ranked candidates, best first, so the UI can offer corrections.
    alternatives: list[PredictionOut]
    # True when top-1 confidence is under the configured threshold; the UI
    # should ask the user to confirm rather than present it as fact.
    low_confidence: bool


class MealUpdate(BaseModel):
    corrected_class: str | None = None
    portion_g: float | None = Field(default=None, gt=0, le=5000)
    meal_tag: str | None = Field(default=None, max_length=32)
    eaten_at: datetime | None = None


class MealPage(BaseModel):
    items: list[MealOut]
    total: int
    limit: int
    offset: int


# --- Summary ----------------------------------------------------------------
class DailyTotals(BaseModel):
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float


class DailySummary(BaseModel):
    date: str
    consumed: DailyTotals
    goals: DailyTotals
    meal_count: int
