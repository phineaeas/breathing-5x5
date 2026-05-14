# Дыхание — Breathing Metronome (5/5)

Mobile-first, single-page web app. Pure static HTML/CSS/JS — no build, no
backend, no storage. Russian UI.

## Run locally

```bash
cd breath-app
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

This is a static site (`index.html` is the entry point). Deploy with:

```python
deploy_website(project_path="breath-app", site_name="dyhanie", entry_point="index.html")
```

## Files

- `index.html` — markup (semantic, accessible, RU lang)
- `styles.css` — warm-dusk dark palette, orb, layout, reduced-motion
- `app.js` — state machine, Web Audio API tones, vibration, RAF loop

## Notes

- Audio: `AudioContext` is never created until the user taps **«Включить
  звук»**. A near-silent ping is played on toggle to unlock iOS audio.
- Vibration: button is disabled (with explanatory subtext) on devices
  without `navigator.vibrate`.
- Storage: deliberately no `localStorage` / `sessionStorage` / cookies /
  IndexedDB — all state is in JS variables only. Reloading the page
  resets everything.
- Reduced motion: orb stops expanding/contracting and sits at a calm
  middle scale when `prefers-reduced-motion: reduce` is set.
- Keyboard: `Space` toggles play/pause, `R` resets (helpful on desktop QA).
- Pauses automatically when the tab becomes hidden, to keep timing honest.
