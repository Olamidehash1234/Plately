# Chapter 4 figures

Screenshots of the running Plately system, captured for Chapter 4 of the
report. All are PNG at 2× device scale (1440 CSS px wide → 2880 px) taken with
headless Chrome, so there is no browser chrome, bookmarks bar or cursor in the
frame.

| File | Figure | Page |
|---|---|---|
| `fig4-1-landing.png` | 4.1 | Landing page |
| `fig4-2-signup.png` | 4.2 | Registration page |
| `fig4-3-login.png` | 4.3 | Log in page |
| `fig4-4-classify.png` | 4.4 | Classify input page |
| `fig4-5-result.png` | 4.5 | Classify result page |
| `fig4-6-home.png` | 4.6 | User dashboard |
| `fig4-7-history.png` | 4.7 | Meal history page |

## How they were produced

Both servers running (`uvicorn app.main:app` on :8000, `npm run dev` on :5173),
then each page loaded in headless Chrome at `--window-size=1440,<h>
--force-device-scale-factor=2`. Authenticated pages were reached by seeding the
JWT into `localStorage` before navigation.

The account shown is a demo account, `demo@plately.app`, with six meals seeded
across three days. The meals were written straight into the database using the
same code path `POST /classify` uses — the same image storage helper, the same
nutrition lookup, the same denormalised macros — so every number visible in the
figures is the system's own output. The only value supplied by hand is the
predicted class, because the CNN has not yet been trained on real data. Once a
real model exists these figures should be retaken by classifying photos through
the interface, so the labels and confidence scores are genuinely the model's.

## Photo credits

The meal photographs are from Wikimedia Commons and are reused under their
Creative Commons licences. If the report reproduces them at any size, credit
them:

| Dish | Source file | Licence |
|---|---|---|
| Jollof Rice | *A plate of jollof rice and chicken.jpg* | CC BY-SA 4.0 |
| Egusi Soup | *Pot of Egusi soup.jpg* | CC BY-SA 4.0 |
| Pounded Yam | *Afang soup and pounded yam 03.jpg* | CC BY-SA 4.0 |
| Caesar Salad | *Caesar Salad from Tony Roma Restaurant- March 2024 02.jpg* | CC BY-SA 4.0 |
| Grilled Salmon | *Grilled salmon and chips.jpg* | CC BY-SA 4.0 |
| Moi Moi | *Moin Moin.jpg* | CC BY-SA 3.0 |

Replacing these with your own photographs would remove the attribution
requirement entirely, and would be more defensible in a project report.
