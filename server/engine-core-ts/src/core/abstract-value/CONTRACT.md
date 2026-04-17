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
- `suffix(s)` _(internal-only pre-V2)_
  - denotes some non-empty set of strings whose members all end with `s`
  - the analysis may use this domain internally before V2 contracts expose it directly
- `prefixSuffix(p, s)` _(internal-only pre-V2)_
  - denotes some non-empty set of strings whose members all start with `p` and end with `s`
  - `minLength` tracks the shortest known concrete string length for this constrained shape
- `top`
  - denotes an unknown set of strings

## Alpha / Gamma Style Notes

The implementation is not machine-checked, but the intended abstraction/concretization relationship is:

- `alpha(S)`
  - `[]` -> `bottom`
  - singleton set -> `exact`
  - known finite set -> `finiteSet`
  - non-finite or widened set with stable leading prefix -> `prefix`
  - non-finite or widened set with stable trailing suffix -> `suffix`
  - non-finite values with both stable leading and trailing constraints -> `prefixSuffix`
  - otherwise -> `top`
- `gamma(a)`
  - `bottom` -> `{}`
  - `exact(v)` -> `{ v }`
  - `finiteSet(vs)` -> `set(vs)`
  - `prefix(p)` -> `{ s | s startsWith p }`
  - `suffix(s)` -> `{ s' | s' endsWith s }`
  - `prefixSuffix(p, s)` -> `{ s' | s' startsWith p and endsWith s }`
  - `top` -> all strings

Required invariant:

- the analysis must not drop possible runtime values
- widening may add extra values, but it must not remove real ones

## Transfer Contract

### Join

- joins preserve exact finite information when both sides remain finite
- prefix joins stay `prefix` only when both sides remain inside the same prefix language
- suffix joins stay `suffix` only when both sides remain inside the same suffix language
- prefix/suffix product joins stay `prefixSuffix` only when both sides remain inside the same prefix and suffix languages
- incompatible prefixes widen to `top`

### Concatenation

- `exact + exact` -> `exact`
- `exact + finiteSet` -> `finiteSet`
- `exact + prefix` -> `prefix(left + prefix)`
- `exact + suffix` -> `prefixSuffix(left, suffix)`
- `finiteSet + exact` -> `finiteSet`
- `finiteSet + prefix` -> `prefix(lcp(left_i + prefix))` when the concatenated prefixes keep a meaningful shared class prefix, otherwise `top`
- `finiteSet + suffix` -> `suffix` and may refine to `prefixSuffix(lcp(left_i), suffix)` when the left values keep a meaningful shared class prefix
- `exact + unknownRight` -> `prefix(left)`
- `unknownLeft + exact` -> `suffix(right)`
- `unknownLeft + finiteSet(vs)` -> `suffix(lcs(vs))` when the finite right values keep a meaningful shared class suffix, otherwise `top`
- `prefix + exact` -> `prefixSuffix(left, right)`
- `prefix + finiteSet` -> `prefix(left)` unless the finite values keep a meaningful shared class suffix, in which case `prefixSuffix(left, lcs(vs))`
- `prefix + prefix` -> `prefix(left)`
- `prefix + suffix` -> `prefixSuffix(left, right)`
- `suffix + exact` -> `suffix(right)`
- `suffix + finiteSet(vs)` -> `suffix(lcs(vs))` when the finite right values keep a meaningful shared class suffix, otherwise `top`
- `prefixSuffix + exact` -> `prefixSuffix(prefix, suffix + exact)`
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
- `suffix`
  - `inferred` when some selectors match the suffix
  - `exact` only when the selector universe is fully captured by that suffix
- `prefixSuffix`
  - `inferred` when some selectors match both the prefix and suffix
  - `exact` only when the selector universe is fully captured by that prefix/suffix pair
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
