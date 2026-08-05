"""SQLAlchemy ORM models."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))

    # Daily targets shown on the dashboard. Defaults are a rough adult baseline
    # the user can edit from the profile page.
    daily_kcal_goal: Mapped[int] = mapped_column(Integer, default=2200)
    daily_protein_goal_g: Mapped[int] = mapped_column(Integer, default=150)
    daily_carbs_goal_g: Mapped[int] = mapped_column(Integer, default=220)
    daily_fat_goal_g: Mapped[int] = mapped_column(Integer, default=65)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    meals: Mapped[list["Meal"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    # Path relative to the media root, not absolute — keeps rows portable
    # across machines and deployments.
    image_path: Mapped[str] = mapped_column(String(512))

    # What the model said. predicted_class is a key from nutrition.json.
    predicted_class: Mapped[str] = mapped_column(String(64), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    # Set when the user overrides a misclassification, so the original
    # prediction is preserved for later error analysis.
    corrected_class: Mapped[str | None] = mapped_column(String(64), nullable=True)

    portion_g: Mapped[float] = mapped_column(Float)

    # Denormalised at write time. Macros are stored rather than recomputed so
    # that editing the nutrition table later cannot silently rewrite history.
    kcal: Mapped[float] = mapped_column(Float)
    protein_g: Mapped[float] = mapped_column(Float)
    carbs_g: Mapped[float] = mapped_column(Float)
    fat_g: Mapped[float] = mapped_column(Float)

    meal_tag: Mapped[str] = mapped_column(String(32), default="Meal")
    eaten_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="meals")

    @property
    def food_class(self) -> str:
        """The class to display: the user's correction if any, else the model's."""
        return self.corrected_class or self.predicted_class
