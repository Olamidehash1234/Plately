import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Welcome from "@/pages/Welcome";

/** Every route the app actually serves. */
const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/home",
  "/classify",
  "/meal-result",
  "/history",
  "/profile",
];

function renderWelcome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Welcome />
    </MemoryRouter>,
  );
}

describe("Welcome", () => {
  it("routes every link to a real page or an anchor on this one", () => {
    renderWelcome();

    const targets = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");

    expect(targets.length).toBeGreaterThan(0);
    for (const href of targets) {
      // "#" alone is the placeholder that used to litter this page.
      expect(href).not.toBe("#");
      if (href.startsWith("#")) {
        expect(document.querySelector(href)).not.toBeNull();
      } else {
        expect(ROUTES).toContain(href);
      }
    }
  });

  it("anchors the sections its navigation points at", () => {
    renderWelcome();

    for (const id of ["why-plately", "how-it-works", "stories"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("sends visitors to signup and login", () => {
    renderWelcome();

    expect(
      screen.getAllByRole("link", { name: /get started/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /log in/i }).length).toBeGreaterThan(
      0,
    );
  });

  it("describes itself as a final year project rather than a company", () => {
    renderWelcome();

    expect(screen.getByText(/a final year project/i)).toBeInTheDocument();
    expect(screen.queryByText(/privacy policy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/terms of service/i)).not.toBeInTheDocument();
  });
});
