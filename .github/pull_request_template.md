<!--
Most PRs here are data: a bot, a job, or a corrected mapping. `pnpm validate`
is the publication gate and runs the same rules the site imports, so run it
before pushing — it fails faster than CI and says the same thing.
-->

## What this changes

## Checklist

- [ ] `pnpm validate` passes
- [ ] Descriptions are in our own words, not a catalogue's — the validator checks
      similarity, but it only catches the obvious cases
- [ ] Every new bot credits where it was discovered and who made it
- [ ] No template contents, prompt bodies or reconstructed configuration
