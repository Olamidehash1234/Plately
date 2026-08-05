import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatDayLabel,
  formatTime,
  greeting,
  percentage,
  toDateParam,
} from "@/lib/format";

/** Local-time ISO string, so these assertions do not depend on the test box's zone. */
function localIso(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("formatTime", () => {
  it("renders hours and minutes", () => {
    expect(formatTime(localIso(2026, 3, 14, 9, 5))).toMatch(/\b9:05\b/);
  });

  it("zero-pads the minutes", () => {
    expect(formatTime(localIso(2026, 3, 14, 13, 7))).toMatch(/:07\b/);
  });
});

describe("formatDate", () => {
  it("spells the month out in full", () => {
    expect(formatDate(localIso(2026, 3, 14))).toBe("March 14, 2026");
  });
});

describe("formatDayLabel", () => {
  it("labels the current day Today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 14, 15, 0));
    expect(formatDayLabel(localIso(2026, 3, 14, 8, 30))).toBe("Today");
  });

  it("labels the previous day Yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 14, 15, 0));
    expect(formatDayLabel(localIso(2026, 3, 13, 20, 0))).toBe("Yesterday");
  });

  it("crosses a month boundary when finding yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 1, 9, 0));
    expect(formatDayLabel(localIso(2026, 2, 28, 19, 0))).toBe("Yesterday");
  });

  it("falls back to a full date for anything older", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 14, 15, 0));
    expect(formatDayLabel(localIso(2026, 3, 11))).toBe("March 11, 2026");
  });
});

describe("toDateParam", () => {
  it("uses local calendar fields, not UTC ones", () => {
    // 00:30 local on the 5th is still the 4th in UTC for anywhere east of
    // Greenwich; the API query has to say the 5th.
    expect(toDateParam(new Date(2026, 7, 5, 0, 30))).toBe("2026-08-05");
  });

  it("zero-pads month and day", () => {
    expect(toDateParam(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});

describe("greeting", () => {
  it.each([
    [0, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [17, "Good afternoon"],
    [18, "Good evening"],
    [23, "Good evening"],
  ])("says the right thing at %i:00", (hour, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 14, hour, 0));
    expect(greeting()).toBe(expected);
  });
});

describe("percentage", () => {
  it("rounds to a whole number", () => {
    expect(percentage(1, 3)).toBe(33);
  });

  it("clamps above the goal so a progress bar cannot overflow", () => {
    expect(percentage(3000, 2000)).toBe(100);
  });

  it("returns 0 rather than Infinity when the goal is zero", () => {
    expect(percentage(500, 0)).toBe(0);
  });
});
