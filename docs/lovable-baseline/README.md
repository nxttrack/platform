# Lovable Baseline Contract

The machine-readable Priority A route and viewport contract is in `manifest.json`.

Pinned source:

```txt
nxttrack/swim-school-pro
ced1290b239f61566a542825c9ed8a9229cc3282
```

Validate the tracked contract:

```bash
pnpm design:audit
```

Capture the pinned source after starting it locally or opening an equivalent immutable preview:

```bash
LOVABLE_BASE_URL=http://127.0.0.1:4173 pnpm design:capture-lovable
```

Images and `capture.json` are written to the gitignored `artifacts/lovable-baseline/<commit>/` directory. The full local capture result and known asset fixture are documented in `../LOVABLE_SCREENSHOT_BASELINE.md`.
