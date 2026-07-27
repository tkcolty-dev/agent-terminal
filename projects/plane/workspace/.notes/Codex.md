# Codex Notes

- 2026-07-27: Built `plane.js` 737 primitives and simple dive/crash physics. Syntax check passed.
- 2026-07-27: Round 2 replaced auto-dive with control-driven aerodynamics and upgraded the 737-800 model using Boeing dimensions/features. Mock-state tests cover hands-off, climb, bank/crash, and stall/crash paths.
- 2026-07-27: Tuned max lift (10.8 m/s²) and full-throttle acceleration so sustained pitch-up climbs 28→52m over 8s; dive crash remains ~3.6s with frozen one-shot impact.
