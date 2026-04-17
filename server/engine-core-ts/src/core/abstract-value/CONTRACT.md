# Abstract Value Contract

This document defines the intended concrete meaning of the abstract class-value domain used by the 3.0 runtime.

It is not a formal proof.

It is the contract that query policy, projection, certainty, and rewrite safety are expected to follow.

## Exposure Boundary

The runtime distinguishes between:

- internal abstract domains
  - used by transfer, projection, certainty, and explanation logic
- externally exposed contract shapes
  - serialized through engine contracts, parity snapshots, and CLI surfaces

Current exposure status:

- V1 external contract
  - `exact`
  - `finiteSet`
  - `prefix`
  - all other constrained domains downcast to `top` or `unknown`
- V2 Bundle 1 external contract
  - `suffix`
  - `prefixSuffix`
  - exposed through:
    - `TypeFactTableV2`
    - `EngineOutputV2.queryResults`
    - `pnpm explain:expression -- --json`
- not yet externally exposed in V2
  - `charInclusion`
  - `composite`

Important rule:

- internal landing does not imply external exposure
- a domain may participate in analysis and projection before contracts or CLI surfaces expose it directly

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
- `suffix(s)`
  - denotes some non-empty set of strings whose members all end with `s`
  - V2 Bundle 1 may expose this as `constrained + constraintKind: "suffix"`
- `prefixSuffix(p, s)`
  - denotes some non-empty set of strings whose members all start with `p` and end with `s`
  - `minLength` tracks the shortest known concrete string length for this constrained shape
  - V2 Bundle 1 may expose this as `constrained + constraintKind: "prefixSuffix"`
- `charInclusion(must, may)` _(internal-only pre-Bundle 2)_
  - denotes some non-empty set of strings whose members contain every character in `must`
  - when `mayIncludeOtherChars` is false, members may only use characters from `may`
- `composite(prefix?, suffix?, must, may)` _(internal-only pre-Bundle 3)_
  - denotes a reduced product of edge constraints and character inclusion constraints
  - absent axes mean "no information on that axis"
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
  - non-finite widened values with no stable edge but stable character constraints -> `charInclusion`
  - non-finite widened values with stable edges plus character constraints -> `composite`
  - otherwise -> `top`
- `gamma(a)`
  - `bottom` -> `{}`
  - `exact(v)` -> `{ v }`
  - `finiteSet(vs)` -> `set(vs)`
  - `prefix(p)` -> `{ s | s startsWith p }`
  - `suffix(s)` -> `{ s' | s' endsWith s }`
  - `prefixSuffix(p, s)` -> `{ s' | s' startsWith p and endsWith s }`
  - `charInclusion(must, may)` -> `{ s' | must ⊆ chars(s') ∧ chars(s') ⊆ may }`
  - `composite(...)` -> intersection of all present axis constraints
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
- `charInclusion` joins intersect required characters and union allowed characters
- `composite` joins keep all surviving axes and degrade to weaker non-composite domains when only one axis remains informative
- `composite ⊔ prefix/suffix/prefixSuffix` may degrade to the strongest shared edge-only domain when multi-axis information no longer survives the join
- `composite ⊔ charInclusion` degrades to `charInclusion` over the shared character constraints
- `composite.minLength` is tightened to at least the number of distinct required characters and the combined edge length when those are larger than the provided lower bound
- `prefix ⊔ prefixSuffix` may degrade to a weaker shared `prefix` when the product's leading edge remains informative
- `prefixSuffix ⊔ finite` may degrade to `prefix` or `suffix` when only one edge survives the join
- incompatible prefixes widen to `top`

### Concatenation

- `exact + exact` -> `exact`
- `exact + finiteSet` -> `finiteSet`
- `exact + prefix` -> `prefix(left + prefix)`
- `exact + suffix` -> `prefixSuffix(left, suffix)`
- `finiteSet + exact` -> `finiteSet`
- `finiteSet + prefix` -> `prefix(lcp(left_i + prefix))` when the concatenated prefixes keep a meaningful shared class prefix, otherwise `top`
- `finiteSet + suffix` -> `suffix` and may refine to `prefixSuffix(lcp(left_i), suffix)` when the left values keep a meaningful shared class prefix
- large finite widening with no meaningful shared prefix may preserve `charInclusion(intersect(chars(v_i)), union(chars(v_i)))`
- large finite widening with stable edge information may preserve `composite(edge constraints, char constraints)` instead of dropping to `prefix`
- `exact + unknownRight` -> `prefix(left)`
- `unknownLeft + exact` -> `suffix(right)`
- `unknownLeft + finiteSet(vs)` -> `suffix(lcs(vs))` when the finite right values keep a meaningful shared class suffix, otherwise `top`
- `prefix + exact` -> `prefixSuffix(left, right)`
- `prefix + finiteSet` -> `prefix(left)` unless the finite values keep a meaningful shared class suffix, in which case `prefixSuffix(left, lcs(vs))`
- `prefix + prefix` -> `prefix(left)`
- `prefix + suffix` -> `prefixSuffix(left, right)`
- `prefix + charInclusion` -> `composite(prefix, char constraints)` with unknown trailing characters still allowed
- `suffix + exact` -> `suffix(right)`
- `suffix + finiteSet(vs)` -> `suffix(lcs(vs))` when the finite right values keep a meaningful shared class suffix, otherwise `top`
- `charInclusion + suffix` -> `composite(suffix, char constraints)` when the trailing edge remains informative
- `prefixSuffix + charInclusion` -> `composite(prefix, char constraints)` when only the leading edge survives concatenation
- `charInclusion + prefixSuffix` -> `composite(suffix, char constraints)` when only the trailing edge survives concatenation
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
- `charInclusion`
  - `inferred` when some selectors satisfy the required/allowed character constraints
  - `exact` only when the selector universe is fully captured by that character filter
- `composite`
  - `inferred` when some selectors satisfy all present axes
  - `exact` only when the selector universe is fully captured by the full reduced product
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
