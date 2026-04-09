/**
 * Ambient type declarations for the Vite+ dogfood sandbox.
 *
 * Vite ships `vite/client` with these declarations, but since
 * we depend on `vite-plus` (which transitively provides vite
 * via the pnpm store) instead of `vite` directly, the
 * `/// <reference types="vite/client" />` triple-slash may
 * fail to resolve from the IDE's TypeScript language service.
 * Inlining the declarations keeps the sandbox self-contained.
 */

declare module "*.module.scss" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module "*.scss" {
  const content: string;
  export default content;
}

declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const url: string;
  export default url;
}
