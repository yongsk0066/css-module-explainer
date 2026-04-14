# Path Alias Migration

`cssModules.pathAlias` is deprecated.

Use `cssModuleExplainer.pathAlias` instead.

## Timeline

- warning starts: `3.1.x`
- planned removal: `4.0.0`

## Why

`cssModuleExplainer.pathAlias` is the native resource-scoped configuration
surface. It is the only path-alias key that should remain after the compatibility
bridge is removed.

## Migration

Move the alias map unchanged.

Before:

```jsonc
"cssModules.pathAlias": {
  "@styles": "src/styles",
  "@components": "src/components"
}
```

After:

```jsonc
"cssModuleExplainer.pathAlias": {
  "@styles": "src/styles",
  "@components": "src/components"
}
```

## Behavior in 3.x

- native `cssModuleExplainer.pathAlias` takes precedence
- if the native key is absent, the server falls back to `cssModules.pathAlias`
- the server emits one deprecation notice per workspace root when fallback is used

## Removal criteria

Removal in `4.0.0` should happen only after:

1. this migration note has shipped in at least one stable `3.1.x` release
2. README and release notes point to the native key only
3. `server/src/settings.ts` no longer normalizes the compat key
