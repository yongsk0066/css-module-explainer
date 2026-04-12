/**
 * Ambient type declarations for the Vite+ dogfood sandbox.
 *
 * We keep the sandbox self-contained instead of relying on
 * `vite/client` ambient declarations. That keeps editor behavior
 * stable even when the examples app is opened as a standalone QA
 * folder rather than through the whole repo workspace.
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
