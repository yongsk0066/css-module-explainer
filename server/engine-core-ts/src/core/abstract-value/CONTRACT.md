# Abstract Value Contract

This document defines the intended concrete meaning of the abstract class-value domain used by the 3.0 runtime.

It is not a formal proof.

It is the contract that query policy, projection, certainty, and rewrite safety are expected to follow.

## Concrete Domain

The concrete meaning is:

- the set of runtime class-token strings a source expression may evaluate to at one program point

Examples:

- `cx("button")` -> `{ "button" }`
- `cx(flag ? "sm" : "lg")` -> `{ "sm", "lg" }`
- `cx("btn-" + variant)` -> `{ "btn-x" | x is any runtime suffix }`

## Abstract Domain

The runtime uses these abstract values:

- `bottom`
  - denotes the empty set
  - used when analysis proves no value can flow
- `exact(v)`
  - denotes exactly `{ v }`
- `finiteSet(v1, ..., vn)`
  - denotes exactly the finite set of listed values
- `prefix(p)`
  - denotes some non-empty set of strings whose members all start with `p`
  - the analysis does not claim the set is complete or finite
- `top`
  - denotes an unknown set of strings

## Alpha / Gamma Style Notes

The implementation is not machine-checked, but the intended abstraction/concretization relationship is:

- `alpha(S)`
  - `[]` -> `bottom`
  - singleton set -> `exact`
  - known finite set -> `finiteSet`
  - non-finite or widened set with stable leading prefix -> `prefix`
  - otherwise -> `top`
- `gamma(a)`
  - `bottom` -> `{}`
  - `exact(v)` -> `{ v }`
  - `finiteSet(vs)` -> `set(vs)`
  - `prefix(p)` -> `{ s | s startsWith p }`
  - `top` -> all strings

Required invariant:

- the analysis must not drop possible runtime values
- widening may add extra values, but it must not remove real ones

## Transfer Contract

### Join

- joins preserve exact finite information when both sides remain finite
- prefix joins stay `prefix` only when both sides remain inside the same prefix language
- incompatible prefixes widen to `top`

### Concatenation

- `exact + exact` -> `exact`
- `exact + finiteSet` -> `finiteSet`
- `exact + prefix` -> `prefix(left + prefix)`
- `finiteSet + exact` -> `finiteSet`
- `exact + unknownRight` -> `prefix(left)`
- `prefix + exact` -> `prefix(left)`
- `prefix + finiteSet` -> `prefix(left)`
- `prefix + prefix` -> `prefix(left)`
- incompatible non-finite concatenation widens to `top`

### Type Union Lift

- a finite string literal union lifts to `finiteSet`
- a singleton union canonicalizes to `exact`
- non-literal or non-finite unions widen to `top`

## Projection Contract

Projection maps an abstract value into a selector universe for one style module.

Inputs:

- abstract value
- style selector universe

Outputs:

- candidate selectors
- selector certainty

Rules:

- `exact`
  - `exact` if one matching selector is found
  - `possible` otherwise
- `finiteSet`
  - `exact` when every enumerated value matches a selector
  - `inferred` when only a subset matches
- `prefix`
  - `inferred` when some selectors match the prefix
  - `exact` only when the selector universe is fully captured by that prefix
- `top`
  - `possible`

## Policy Contract

The runtime separates three concepts:

- `value certainty`
  - how precise the abstract value is
- `selector certainty`
  - how precise the selector projection is in the current style universe
- `rewrite safety`
  - whether an edit may rewrite source sites directly

Important rule:

- selector certainty does not imply rewrite safety

Example:

- a dynamic expression may project to one exact selector in the current module
- that still remains an expanded site and is not rewrite-safe

## 3.0 Rule

No provider may invent certainty strings outside this contract.

Providers may present these values differently in UI, but they must consume:

- abstract value summaries
- selector projection summaries
- rewrite safety summaries

They must not derive certainty or rewrite safety ad hoc.
