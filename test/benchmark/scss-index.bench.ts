import { bench, describe } from "vitest";
import { StyleIndexCache } from "../../server/src/core/scss/scss-index";
import { parseStyleDocument } from "../../server/src/core/scss/scss-parser";

const SMALL_SCSS = `
.button { color: red; padding: 8px 16px; border-radius: 4px; }
.primary { background: blue; color: white; }
.secondary { background: transparent; color: blue; border: 1px solid blue; }
.disabled { opacity: 0.5; cursor: not-allowed; }
`;

const LARGE_SCSS = Array.from({ length: 200 }, (_, i) => {
  return `.class-${i} { color: hsl(${i * 2}, 50%, 50%); padding: ${i}px; margin: ${i * 2}px; font-size: ${12 + (i % 8)}px; border-radius: ${i % 16}px; }`;
}).join("\n");

const NESTED_SCSS = `
.container {
  .header {
    .title { font-size: 24px; }
    .subtitle { font-size: 14px; color: gray; }
  }
  .body {
    .content { padding: 16px; }
    .footer { border-top: 1px solid #eee; }
  }
  &:hover { background: #f5f5f5; }
  &.active { background: #e0f0ff; }
}
`;

describe("parseStyleDocument", () => {
  bench("small (4 rules)", () => {
    parseStyleDocument(SMALL_SCSS, "/bench/small.module.scss");
  });

  bench("large (200 rules)", () => {
    parseStyleDocument(LARGE_SCSS, "/bench/large.module.scss");
  });

  bench("nested + ampersand (SCSS resolution)", () => {
    parseStyleDocument(NESTED_SCSS, "/bench/nested.module.scss");
  });
});

describe("StyleIndexCache", () => {
  bench("cold → warm for the same file", () => {
    const cache = new StyleIndexCache({ max: 10 });
    cache.getStyleDocument("/bench/large.module.scss", LARGE_SCSS);
    cache.getStyleDocument("/bench/large.module.scss", LARGE_SCSS); // hit
  });

  bench("500 files sequentially", () => {
    const cache = new StyleIndexCache({ max: 1000 });
    for (let i = 0; i < 500; i += 1) {
      cache.getStyleDocument(`/bench/file-${i}.module.scss`, SMALL_SCSS);
    }
  });
});
