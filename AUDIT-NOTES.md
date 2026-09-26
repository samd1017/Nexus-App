# Dependency audit notes

High-severity `npm audit` findings for TipTap, `js-yaml`, `nanoid`, and the Mermaid / Chevrotain / `lodash-es` chain.

## TipTap

Direct `@tiptap/*` packages are set to `^3.31.3`. That line includes the `@tiptap/core` 3.30.5 fix for quadratic ReDoS in Markdown attribute parsing (GHSA-j95f-988m-3j2f) and the 3.30.4 `mergeAttributes` fix (GHSA-cp6q-959q-f8rh).

## js-yaml and nanoid

These are not direct dependencies. The lockfile is updated inside the ranges their parents already allow:

- `js-yaml` 4.3.2 (GHSA-2883-xcg3-v3hh). `@eslint/eslintrc` allows `^4.3.0` and `xmlbuilder2` allows `^4.1.1`.
- `nanoid` 3.3.19 (GHSA-2v37-7h3g-55p8). PostCSS allows `^3.3.16`.

No `overrides` entry is required for either package.

## Mermaid

Audit grouped Mermaid 12, Chevrotain 11.1.2, and nested `lodash-es` 4.17.23 as high. They are one chain. Chevrotain 11.0.0–11.2.0 pins `lodash-es` 4.17.23, which is affected by GHSA-r5fr-rjxr-66jc (`_.template` code injection) and GHSA-f23m-r3pf-42rh (prototype pollution in `_.unset` / `_.omit`).

What was checked:

- Mermaid 12.0.0 is the current release and still depends on `chevrotain@~11.1.2`. There is no newer Mermaid that drops that pin.
- Chevrotain 12 and later remove `lodash-es`. Mermaid's diagram parser is built for Chevrotain 11, so that major is not a supported bump.
- Mermaid 11.17.2 does not depend on Chevrotain. Taking it would be a major downgrade (the `npm audit fix --force` path). Diagram rendering here is written for Mermaid 12 (`htmlLabels: false`, `look: "classic"`).

`overrides.lodash-es` is `4.18.1` because no clean upstream bump removes the vulnerable pin. `4.18.1` is the patched release, and Mermaid's `dagre-d3-es` dependency already resolves to it. Chevrotain calls stable collection helpers (`clone`, `flatten`, `has`, and similar), not `_.template`. After this pin, the Mermaid / Chevrotain / `lodash-es` highs are gone.
