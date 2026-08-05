import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { MacroBar } from "@/components/plately/MacroBar";

const HERO_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCE-mfht3Ixr1XAVFQpLt_KPl_nGNlGdCaQ_z0vuk1VpoAd-DutKH_jC88A9aeLQsATPIkF_scHszCafQ0xCAXeYzHRHIF68nDEcqQqEJYtMofUPzQqDUmmcEbbGi4ZJ6HmNQvDrzAt9tzeP_FxTckcChgTF_cNoykCWhGAJkwI6OasqbvOb9NUsx_lqU6RSVCt0UzjvaXQeQpbc7yQFLzwWwe1kdwNt0vKnMDR5lGG_2pza3xFMcNBoH6rgLGLKK5hvVNocCcauXzE";

const FEATURES = [
  {
    icon: "camera_alt",
    title: "Visual Capture",
    body: "Simply take a photo of your meal. Our AI identifies ingredients and estimates portions with clinical precision.",
  },
  {
    icon: "menu_book",
    title: "Curated Insights",
    body: "Receive editorial-style summaries of your weekly habits, focusing on balance and variety over restriction.",
  },
  {
    icon: "eco",
    title: "Sourcing Awareness",
    body: "Learn about the impact of your food choices on your body and the environment through our conscious database.",
  },
];

const STEPS = [
  {
    step: "01",
    icon: "photo_camera",
    title: "Capture the plate",
    body: "One photo is enough. Snap your meal from above and Plately handles the rest—no weighing, no searching a database.",
  },
  {
    step: "02",
    icon: "auto_awesome",
    title: "Let the model read it",
    body: "Our vision model identifies each ingredient, estimates the portion, and breaks the plate down into its macros in about three seconds.",
  },
  {
    step: "03",
    icon: "insights",
    title: "Read the story",
    body: "Your meals become a weekly journal—patterns, balance and variety written in plain language instead of raw numbers.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I stopped logging food years ago because it felt like accounting. Plately reads like a magazine about how I actually eat.",
    name: "Ade Ogunlana",
    role: "Product designer, Lagos",
  },
  {
    quote:
      "The portion estimates are close enough that I trust them, and the weekly summary is the only nutrition writing I actually finish.",
    name: "Marta Reyes",
    role: "Marathon runner",
  },
  {
    quote:
      "I recommend it to clients who freeze up around calorie counts. It shifts the conversation to balance and variety.",
    name: "Dr. Chidi Nwosu",
    role: "Clinical dietitian",
  },
];

// Sections of this page, used by both the header nav and the footer. Anchors
// rather than routes: these are places on the landing page, not separate pages.
const SECTIONS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Why Plately", href: "#why-plately" },
  { label: "Stories", href: "#stories" },
];

// Every entry here resolves to something that exists. Marketing columns for
// pages that were never built are worse than a shorter footer.
const FOOTER_LINKS = [
  {
    title: "The app",
    links: [
      { label: "Capture a meal", to: "/classify" },
      { label: "Your journal", to: "/history" },
      { label: "Your profile", to: "/profile" },
    ],
  },
  {
    title: "Get started",
    links: [
      { label: "Create an account", to: "/signup" },
      { label: "Log in", to: "/login" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "How it works", to: "#how-it-works" },
      { label: "Why Plately", to: "#why-plately" },
      { label: "Stories", to: "#stories" },
    ],
  },
];

export default function Welcome() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock page scroll behind the open menu.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col overflow-x-hidden">
      {/* TopAppBar */}
      <header className="bg-background border-b border-outline-variant fixed top-0 left-0 w-full z-50">
        <div className="flex justify-between items-center gap-4 h-16 md:h-auto md:py-stack-md px-container-padding-mobile md:px-container-padding-desktop w-full max-w-[1440px] mx-auto">
          <Link
            to="/"
            className="font-headline-lg text-headline-lg leading-none text-primary"
          >
            Plately
          </Link>
          <nav className="hidden md:flex gap-8 items-center">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                className="text-on-surface-variant font-label-md text-label-md hover:opacity-80 transition-opacity"
                href={section.href}
              >
                {section.label}
              </a>
            ))}
            <Button asChild size="sm" className="px-6 py-2">
              <Link to="/signup">Get started</Link>
            </Button>
            <Link
              to="/login"
              className="text-primary font-label-md text-label-md hover:opacity-80 transition-opacity"
            >
              Log in
            </Link>
          </nav>
          <button
            className="md:hidden h-10 w-10 -mr-2 inline-flex items-center justify-center text-primary"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-outline-variant bg-background px-container-padding-mobile py-stack-md flex flex-col gap-stack-md shadow-editorial">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                className="text-on-surface-variant font-label-md text-label-md"
                href={section.href}
                onClick={() => setMenuOpen(false)}
              >
                {section.label}
              </a>
            ))}
            <Button asChild size="block">
              <Link to="/signup">Get started</Link>
            </Button>
            <Link
              to="/login"
              className="text-primary font-label-md text-label-md text-center py-2"
            >
              Log in
            </Link>
          </div>
        )}
      </header>

      {/* Dimmed, blurred backdrop behind the open menu */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-on-background/40 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Hero */}
      <main className="flex-grow pt-28 md:pt-32 pb-24 px-container-padding-mobile md:px-container-padding-desktop max-w-[1440px] mx-auto w-full grid grid-cols-12 gap-gutter items-center">
        {/* Left: editorial copy */}
        <section className="col-span-12 md:col-span-7 flex flex-col items-start space-y-stack-lg md:pr-stack-lg">
          <div className="space-y-4">
            <p className="text-primary font-label-sm text-label-sm uppercase tracking-[0.2em]">
              Nutrition Reimagined
            </p>
            <h1 className="font-display-lg text-[40px] leading-[46px] md:text-display-lg md:leading-tight text-on-background">
              Know what is on <br className="hidden md:block" />
              your plate.
            </h1>
          </div>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md leading-relaxed">
            Experience nutrition through the lens of intentional living. No more
            counting numbers in the dark—just beautifully clear insights into
            your food, crafted for the modern table.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-stack-md pt-4 w-full sm:w-auto">
            <Button asChild size="lg" className="shadow-sm">
              <Link to="/signup">Get started</Link>
            </Button>
            <a
              className="px-6 py-4 text-center text-on-surface font-label-md text-label-md hover:underline decoration-primary decoration-2 underline-offset-8 transition-all"
              href="#how-it-works"
            >
              See how it works
            </a>
          </div>
          {/* Stats / proof */}
          <div className="pt-8 grid grid-cols-2 sm:grid-cols-3 gap-8 border-t border-outline-variant w-full mt-8 max-w-xl">
            <div>
              <span className="block font-headline-md text-headline-md text-on-background">
                500k+
              </span>
              <span className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Meals Tracked
              </span>
            </div>
            <div>
              <span className="block font-headline-md text-headline-md text-on-background">
                98%
              </span>
              <span className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Precision Accuracy
              </span>
            </div>
            <div>
              <span className="block font-headline-md text-headline-md text-on-background">
                3 sec
              </span>
              <span className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Average Scan
              </span>
            </div>
          </div>
        </section>

        {/* Right: hero image with macro overlay */}
        <section className="col-span-12 md:col-span-5 mt-10 md:mt-0 flex justify-center md:justify-end">
          <div className="relative group w-full max-w-[320px] sm:max-w-[420px]">
            <div className="aspect-[3/4] w-full rounded-[20px] overflow-hidden editorial-shadow relative">
              <img
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                src={HERO_IMG}
                alt="A top-down editorial photograph of a vibrant Mediterranean salad bowl in a minimalist ceramic dish."
              />
              {/* Macro overlay card */}
              <div className="absolute bottom-4 left-4 right-4 bg-surface/90 backdrop-blur-md p-5 rounded-[16px] border border-outline-variant editorial-shadow transition-all duration-300 transform group-hover:-translate-y-1">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-label-sm text-label-sm text-on-background uppercase tracking-wider">
                    Nutritional Profile
                  </span>
                  <Icon name="analytics" className="text-primary text-[18px]" />
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Protein", value: "24g", pct: 70, fill: "bg-primary-container" },
                    { label: "Healthy Fats", value: "18g", pct: 45, fill: "bg-secondary-container" },
                    { label: "Complex Carbs", value: "32g", pct: 60, fill: "bg-tertiary-container" },
                  ].map((m) => (
                    <div key={m.label} className="space-y-1">
                      <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                        <span>{m.label}</span>
                        <span>{m.value}</span>
                      </div>
                      <MacroBar
                        value={m.pct}
                        fillClass={m.fill}
                        trackClass="bg-surface-container"
                        heightClass="h-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Floating decoration */}
            <div className="absolute -top-6 -right-6 w-24 h-24 border border-outline-variant rounded-full opacity-20 pointer-events-none hidden md:block" />
            <div className="absolute -bottom-10 -left-10 w-36 h-36 border border-outline-variant rounded-full opacity-10 pointer-events-none hidden md:block" />
          </div>
        </section>
      </main>

      {/* Feature cards */}
      {/* scroll-mt clears the fixed header when jumped to from the nav. */}
      <section
        id="why-plately"
        className="scroll-mt-20 bg-surface-container-low py-16 md:py-24 px-container-padding-mobile md:px-container-padding-desktop"
      >
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-stack-lg">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="space-y-4 p-8 border border-outline-variant rounded-[20px] bg-white transition-all hover:bg-white/50"
            >
              <Icon name={f.icon} className="text-primary text-3xl" />
              <h3 className="font-headline-md text-headline-md text-on-background">
                {f.title}
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="scroll-mt-20 bg-background py-16 md:py-24 px-container-padding-mobile md:px-container-padding-desktop"
      >
        <div className="max-w-[1440px] mx-auto">
          <div className="max-w-2xl mb-12 md:mb-16">
            <p className="text-primary font-label-sm text-label-sm uppercase tracking-[0.2em] mb-4">
              How it works
            </p>
            <h2 className="font-headline-lg text-[28px] leading-[34px] md:text-display-lg md:leading-tight text-on-background">
              Three steps between the plate and the page.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-lg">
            {STEPS.map((s) => (
              <div
                key={s.step}
                className="relative flex flex-col gap-4 pt-8 border-t border-outline-variant"
              >
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant tracking-[0.2em]">
                    {s.step}
                  </span>
                  <Icon name={s.icon} className="text-primary text-3xl" />
                </div>
                <h3 className="font-headline-md text-headline-md text-on-background">
                  {s.title}
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section
        id="stories"
        className="scroll-mt-20 bg-surface-container-low py-16 md:py-24 px-container-padding-mobile md:px-container-padding-desktop border-y border-outline-variant"
      >
        <div className="max-w-[1440px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12 md:mb-16">
            <div className="max-w-2xl">
              <p className="text-primary font-label-sm text-label-sm uppercase tracking-[0.2em] mb-4">
                From the table
              </p>
              <h2 className="font-headline-lg text-[28px] leading-[34px] md:text-display-lg md:leading-tight text-on-background">
                Read by people who gave up on food logging.
              </h2>
            </div>
            <Button asChild variant="outline" className="self-start md:self-auto">
              <Link to="/signup">Join them</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-lg">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col justify-between gap-8 p-8 bg-white border border-outline-variant rounded-[20px]"
              >
                <blockquote className="font-body-lg text-body-lg text-on-background leading-relaxed">
                  “{t.quote}”
                </blockquote>
                <figcaption className="flex items-center gap-4 pt-6 border-t border-outline-variant">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center font-label-md text-label-md text-primary shrink-0">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <span className="block font-label-md text-label-md text-on-background">
                      {t.name}
                    </span>
                    <span className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                      {t.role}
                    </span>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background px-container-padding-mobile md:px-container-padding-desktop border-t border-outline-variant">
        <div className="max-w-[1440px] mx-auto">
          {/* Closing CTA */}
          <div className="py-12 md:py-16 flex flex-col md:flex-row md:items-end md:justify-between gap-8 border-b border-outline-variant">
            <div className="max-w-xl">
              <h2 className="font-headline-lg text-[28px] leading-[34px] md:text-headline-lg text-on-background">
                Start with tonight's dinner.
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mt-3">
                Free while we're in early access. No card, no calorie targets to
                set up front.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-stack-md w-full md:w-auto">
              <Button asChild size="lg">
                <Link to="/signup">Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/login">Log in</Link>
              </Button>
            </div>
          </div>

          {/* Link columns */}
          <div className="py-12 md:py-16 grid grid-cols-2 md:grid-cols-12 gap-y-10 gap-x-gutter">
            <div className="col-span-2 md:col-span-6 md:pr-stack-lg">
              <span className="font-headline-lg text-headline-lg text-primary block">
                Plately
              </span>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mt-4 max-w-xs">
                Nutrition through the lens of intentional living. Built for the
                modern table.
              </p>
            </div>

            {FOOTER_LINKS.map((group) => (
              <div key={group.title} className="md:col-span-2">
                <h3 className="font-label-sm text-label-sm text-on-background uppercase tracking-[0.2em] mb-4">
                  {group.title}
                </h3>
                <ul className="space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      {/* Anchors stay anchors; routes go through the router so
                          they do not reload the page. */}
                      {link.to.startsWith("#") ? (
                        <a
                          className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors"
                          href={link.to}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors"
                          to={link.to}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="py-8 border-t border-outline-variant flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-4">
            <span className="text-on-surface-variant font-label-sm text-label-sm">
              © 2026 Plately. A final year project.
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm">
              Food classification for dietary monitoring
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
