export { cursorFixture, type CmeCursorFixture, type CmeCursorFixtureOptions } from "./cursor";
export {
  documentFixture,
  type CmeDocumentFixture,
  type CmeDocumentFixtureOptions,
} from "./document";
export {
  textDocumentPositionFixture,
  textDocumentPositionFromCursor,
  textDocumentPositionParams,
  textDocumentRangeFixture,
  textDocumentRenameFromCursor,
  textDocumentRenameFixture,
  type CmeCursorLike,
  type CmeTextDocumentPositionFixture,
  type CmeTextDocumentPositionFixtureOptions,
  type CmeTextDocumentPositionParams,
  type CmeTextDocumentRenameFromCursorFixture,
  type CmeTextDocumentRangeFixture,
  type CmeTextDocumentRangeFixtureOptions,
  type CmeTextDocumentRenameFixture,
  type CmeTextDocumentRenameFixtureOptions,
} from "./lsp";
export { targetFixture, type CmeTargetFixture, type CmeTargetFixtureOptions } from "./target";
export {
  MarkerParseError,
  workspace,
  type CmeMarker,
  type CmeParsedFile,
  type CmeRangeMarker,
  type CmeWorkspace,
  type Position,
  type Range,
} from "./workspace";
export {
  scenario,
  type CmeActionContext,
  type CmeScenario,
  type CmeScenarioActions,
  type CmeScenarioDefinition,
} from "./scenario";
export { registerCmeMatchers } from "./matchers";
