use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StyleLanguage {
    Css,
    Scss,
    Less,
}

impl StyleLanguage {
    pub fn from_module_path(path: &str) -> Option<Self> {
        if path.ends_with(".module.css") {
            Some(Self::Css)
        } else if path.ends_with(".module.scss") {
            Some(Self::Scss)
        } else if path.ends_with(".module.less") {
            Some(Self::Less)
        } else {
            None
        }
    }

    fn supports_line_comments(self) -> bool {
        matches!(self, Self::Scss | Self::Less)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TextSpan {
    pub start: usize,
    pub end: usize,
}

impl TextSpan {
    fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenKind {
    Whitespace,
    Ident,
    Number,
    String,
    LineComment,
    BlockComment,
    Dot,
    Ampersand,
    Hash,
    Colon,
    Semicolon,
    Comma,
    At,
    OpenBrace,
    CloseBrace,
    OpenParen,
    CloseParen,
    OpenBracket,
    CloseBracket,
    InterpolationStart,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub kind: TokenKind,
    pub span: TextSpan,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseDiagnostic {
    pub message: String,
    pub span: TextSpan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyntaxNodeKind {
    Rule,
    AtRule,
    Declaration,
    Comment,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyntaxNode {
    pub kind: SyntaxNodeKind,
    pub span: TextSpan,
    pub header_span: Option<TextSpan>,
    pub payload: Option<SyntaxNodePayload>,
    pub children: Vec<SyntaxNode>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyntaxNodePayload {
    Rule(RulePayload),
    AtRule(AtRulePayload),
    Declaration(DeclarationPayload),
    Comment(CommentPayload),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RulePayload {
    pub prelude: String,
    pub selector_groups: Vec<SelectorGroup>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectorGroup {
    pub raw: String,
    pub segments: Vec<SelectorSegment>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectorSegment {
    ClassName(String),
    Ampersand,
    BemSuffix(String),
    Pseudo(String),
    Combinator(String),
    Other(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtRulePayload {
    pub kind: AtRuleKind,
    pub name: String,
    pub params: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AtRuleKind {
    Media,
    Supports,
    Layer,
    Keyframes,
    Value,
    AtRoot,
    Generic,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeclarationPayload {
    pub property: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommentPayload {
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stylesheet {
    pub language: StyleLanguage,
    pub tokens: Vec<Token>,
    pub nodes: Vec<SyntaxNode>,
    pub diagnostics: Vec<ParseDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserParityLiteSummaryV0 {
    pub schema_version: &'static str,
    pub language: &'static str,
    pub selector_names: Vec<String>,
    pub keyframes_names: Vec<String>,
    pub value_decl_names: Vec<String>,
    pub diagnostic_count: usize,
    pub rule_count: usize,
    pub declaration_count: usize,
    pub grouped_selector_count: usize,
    pub max_nesting_depth: usize,
    pub at_rule_kind_counts: AtRuleKindCountsV0,
    pub declaration_kind_counts: DeclarationKindCountsV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserIndexSummaryV0 {
    pub schema_version: &'static str,
    pub language: &'static str,
    pub selectors: ParserIndexSelectorFactsV0,
    pub values: ParserIndexValueFactsV0,
    pub keyframes: ParserIndexKeyframesFactsV0,
    pub composes: ParserIndexComposesFactsV0,
    pub wrappers: ParserIndexWrapperFactsV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserCanonicalCandidateBundleV0 {
    pub schema_version: &'static str,
    pub language: &'static str,
    pub parity_lite: ParserParityLiteSummaryV0,
    pub css_modules_intermediate: ParserIndexSummaryV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserEvaluatorCandidateV0 {
    pub kind: &'static str,
    pub selector_name: String,
    pub nested_safety_kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bem_suffix_parent_name: Option<String>,
    pub under_media: bool,
    pub under_supports: bool,
    pub under_layer: bool,
    pub has_value_refs: bool,
    pub has_local_value_refs: bool,
    pub has_imported_value_refs: bool,
    pub has_animation_ref: bool,
    pub has_animation_name_ref: bool,
    pub has_composes: bool,
    pub has_local_composes: bool,
    pub has_imported_composes: bool,
    pub has_global_composes: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserEvaluatorCandidatesV0 {
    pub schema_version: &'static str,
    pub language: &'static str,
    pub results: Vec<ParserEvaluatorCandidateV0>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserCanonicalProducerSignalV0 {
    pub schema_version: &'static str,
    pub language: &'static str,
    pub canonical_candidate: ParserCanonicalCandidateBundleV0,
    pub evaluator_candidates: ParserEvaluatorCandidatesV0,
    pub public_product_gate: ParserPublicProductGateSignalV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParserPublicProductGateSignalV0 {
    pub canonical_candidate_command: &'static str,
    pub consumer_boundary_command: &'static str,
    pub public_product_gate_command: &'static str,
    pub included_in_parser_lane: bool,
    pub included_in_rust_lane_bundle: bool,
    pub included_in_rust_release_bundle: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParserIndexSelectorFactsV0 {
    pub names: Vec<String>,
    pub bem_suffix_parent_names: Vec<String>,
    pub bem_suffix_safe_names: Vec<String>,
    pub nested_unsafe_names: Vec<String>,
    pub selectors_with_value_refs_names: Vec<String>,
    pub selectors_with_animation_ref_names: Vec<String>,
    pub selectors_with_animation_name_ref_names: Vec<String>,
    pub bem_suffix_count: usize,
    pub nested_safety_counts: NestedSafetyCountsV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParserIndexValueFactsV0 {
    pub decl_names: Vec<String>,
    pub decl_names_with_local_refs: Vec<String>,
    pub decl_names_with_imported_refs: Vec<String>,
    pub import_names: Vec<String>,
    pub import_sources: Vec<String>,
    pub import_alias_count: usize,
    pub ref_names: Vec<String>,
    pub local_ref_names: Vec<String>,
    pub imported_ref_names: Vec<String>,
    pub imported_ref_sources: Vec<String>,
    pub declaration_ref_names: Vec<String>,
    pub declaration_imported_ref_sources: Vec<String>,
    pub value_decl_ref_names: Vec<String>,
    pub value_decl_imported_ref_sources: Vec<String>,
    pub selectors_with_refs_names: Vec<String>,
    pub selectors_with_local_refs_names: Vec<String>,
    pub selectors_with_imported_refs_names: Vec<String>,
    pub selectors_with_refs_under_media_names: Vec<String>,
    pub selectors_with_refs_under_supports_names: Vec<String>,
    pub selectors_with_refs_under_layer_names: Vec<String>,
    pub selectors_with_local_refs_under_media_names: Vec<String>,
    pub selectors_with_local_refs_under_supports_names: Vec<String>,
    pub selectors_with_local_refs_under_layer_names: Vec<String>,
    pub selectors_with_imported_refs_under_media_names: Vec<String>,
    pub selectors_with_imported_refs_under_supports_names: Vec<String>,
    pub selectors_with_imported_refs_under_layer_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParserIndexKeyframesFactsV0 {
    pub names: Vec<String>,
    pub names_under_media: Vec<String>,
    pub names_under_supports: Vec<String>,
    pub names_under_layer: Vec<String>,
    pub animation_ref_names: Vec<String>,
    pub animation_name_ref_names: Vec<String>,
    pub selectors_with_animation_ref_names: Vec<String>,
    pub selectors_with_animation_name_ref_names: Vec<String>,
    pub selectors_with_animation_refs_under_media_names: Vec<String>,
    pub selectors_with_animation_refs_under_supports_names: Vec<String>,
    pub selectors_with_animation_refs_under_layer_names: Vec<String>,
    pub selectors_with_animation_name_refs_under_media_names: Vec<String>,
    pub selectors_with_animation_name_refs_under_supports_names: Vec<String>,
    pub selectors_with_animation_name_refs_under_layer_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParserIndexComposesFactsV0 {
    pub selectors_with_composes_names: Vec<String>,
    pub selectors_with_composes_under_media_names: Vec<String>,
    pub selectors_with_composes_under_supports_names: Vec<String>,
    pub selectors_with_composes_under_layer_names: Vec<String>,
    pub local_selector_names: Vec<String>,
    pub imported_selector_names: Vec<String>,
    pub global_selector_names: Vec<String>,
    pub local_selector_names_under_media: Vec<String>,
    pub local_selector_names_under_supports: Vec<String>,
    pub local_selector_names_under_layer: Vec<String>,
    pub imported_selector_names_under_media: Vec<String>,
    pub imported_selector_names_under_supports: Vec<String>,
    pub imported_selector_names_under_layer: Vec<String>,
    pub global_selector_names_under_media: Vec<String>,
    pub global_selector_names_under_supports: Vec<String>,
    pub global_selector_names_under_layer: Vec<String>,
    pub import_sources: Vec<String>,
    pub import_sources_under_media: Vec<String>,
    pub import_sources_under_supports: Vec<String>,
    pub import_sources_under_layer: Vec<String>,
    pub class_name_count: usize,
    pub local_class_name_count: usize,
    pub imported_class_name_count: usize,
    pub global_class_name_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ParserIndexWrapperFactsV0 {
    pub selectors_under_media_names: Vec<String>,
    pub selectors_under_supports_names: Vec<String>,
    pub selectors_under_layer_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AtRuleKindCountsV0 {
    pub media: usize,
    pub supports: usize,
    pub layer: usize,
    pub keyframes: usize,
    pub value: usize,
    pub at_root: usize,
    pub generic: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeclarationKindCountsV0 {
    pub composes: usize,
    pub animation: usize,
    pub animation_name: usize,
    pub generic: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NestedSafetyCountsV0 {
    pub flat: usize,
    pub bem_suffix_safe: usize,
    pub nested_unsafe: usize,
}

#[derive(Debug, Default)]
struct ParityLiteAcc {
    selector_names: Vec<String>,
    keyframes_names: Vec<String>,
    value_decl_names: Vec<String>,
    rule_count: usize,
    declaration_count: usize,
    grouped_selector_count: usize,
    max_nesting_depth: usize,
    at_rule_kind_counts: AtRuleKindCountsV0,
    declaration_kind_counts: DeclarationKindCountsV0,
}

#[derive(Debug, Default)]
struct IndexSummaryAcc {
    selector_names: Vec<String>,
    bem_suffix_parent_names: Vec<String>,
    bem_suffix_safe_selector_names: Vec<String>,
    selectors_with_composes_names: Vec<String>,
    selectors_with_composes_under_media_names: Vec<String>,
    selectors_with_composes_under_supports_names: Vec<String>,
    selectors_with_composes_under_layer_names: Vec<String>,
    local_composes_selector_names: Vec<String>,
    imported_composes_selector_names: Vec<String>,
    global_composes_selector_names: Vec<String>,
    local_composes_selector_names_under_media: Vec<String>,
    local_composes_selector_names_under_supports: Vec<String>,
    local_composes_selector_names_under_layer: Vec<String>,
    imported_composes_selector_names_under_media: Vec<String>,
    imported_composes_selector_names_under_supports: Vec<String>,
    imported_composes_selector_names_under_layer: Vec<String>,
    global_composes_selector_names_under_media: Vec<String>,
    global_composes_selector_names_under_supports: Vec<String>,
    global_composes_selector_names_under_layer: Vec<String>,
    composes_import_sources: Vec<String>,
    composes_import_sources_under_media: Vec<String>,
    composes_import_sources_under_supports: Vec<String>,
    composes_import_sources_under_layer: Vec<String>,
    keyframes_names: Vec<String>,
    nested_unsafe_selector_names: Vec<String>,
    value_decl_names: Vec<String>,
    value_decl_names_with_local_refs: Vec<String>,
    value_decl_names_with_imported_refs: Vec<String>,
    value_import_names: Vec<String>,
    value_import_sources: Vec<String>,
    value_import_source_by_name: BTreeMap<String, String>,
    value_ref_names: Vec<String>,
    local_value_ref_names: Vec<String>,
    imported_value_ref_names: Vec<String>,
    imported_value_ref_sources: Vec<String>,
    declaration_value_ref_names: Vec<String>,
    declaration_imported_value_ref_sources: Vec<String>,
    value_decl_ref_names: Vec<String>,
    value_decl_imported_value_ref_sources: Vec<String>,
    selectors_with_value_refs_names: Vec<String>,
    selectors_with_local_value_refs_names: Vec<String>,
    selectors_with_imported_value_refs_names: Vec<String>,
    selectors_with_value_refs_under_media_names: Vec<String>,
    selectors_with_value_refs_under_supports_names: Vec<String>,
    selectors_with_value_refs_under_layer_names: Vec<String>,
    selectors_with_local_value_refs_under_media_names: Vec<String>,
    selectors_with_local_value_refs_under_supports_names: Vec<String>,
    selectors_with_local_value_refs_under_layer_names: Vec<String>,
    selectors_with_imported_value_refs_under_media_names: Vec<String>,
    selectors_with_imported_value_refs_under_supports_names: Vec<String>,
    selectors_with_imported_value_refs_under_layer_names: Vec<String>,
    selectors_with_animation_ref_names: Vec<String>,
    selectors_with_animation_refs_under_media_names: Vec<String>,
    selectors_with_animation_refs_under_supports_names: Vec<String>,
    selectors_with_animation_refs_under_layer_names: Vec<String>,
    selectors_with_animation_name_ref_names: Vec<String>,
    selectors_with_animation_name_refs_under_media_names: Vec<String>,
    selectors_with_animation_name_refs_under_supports_names: Vec<String>,
    selectors_with_animation_name_refs_under_layer_names: Vec<String>,
    selectors_under_media_names: Vec<String>,
    selectors_under_supports_names: Vec<String>,
    selectors_under_layer_names: Vec<String>,
    animation_ref_names: Vec<String>,
    animation_name_ref_names: Vec<String>,
    keyframes_names_under_media: Vec<String>,
    keyframes_names_under_supports: Vec<String>,
    keyframes_names_under_layer: Vec<String>,
    value_import_alias_count: usize,
    composes_class_name_count: usize,
    local_composes_class_name_count: usize,
    imported_composes_class_name_count: usize,
    global_composes_class_name_count: usize,
    bem_suffix_count: usize,
    nested_safety_counts: NestedSafetyCountsV0,
}

pub fn parse_style_module(path: &str, source: &str) -> Option<Stylesheet> {
    let language = StyleLanguage::from_module_path(path)?;
    Some(parse_stylesheet(language, source))
}

pub fn parse_stylesheet(language: StyleLanguage, source: &str) -> Stylesheet {
    let (tokens, mut diagnostics) = tokenize(language, source);
    let mut parser = Parser::new(source, &tokens, &mut diagnostics);
    let nodes = parser.parse_root();
    Stylesheet {
        language,
        tokens,
        nodes,
        diagnostics,
    }
}

pub fn summarize_parity_lite(sheet: &Stylesheet) -> ParserParityLiteSummaryV0 {
    let mut acc = ParityLiteAcc::default();
    collect_parity_names(&sheet.nodes, &mut acc);
    acc.selector_names.sort();
    acc.selector_names.dedup();
    acc.keyframes_names.sort();
    acc.keyframes_names.dedup();
    acc.value_decl_names.sort();
    acc.value_decl_names.dedup();

    ParserParityLiteSummaryV0 {
        schema_version: "0",
        language: match sheet.language {
            StyleLanguage::Css => "css",
            StyleLanguage::Scss => "scss",
            StyleLanguage::Less => "less",
        },
        selector_names: acc.selector_names,
        keyframes_names: acc.keyframes_names,
        value_decl_names: acc.value_decl_names,
        diagnostic_count: sheet.diagnostics.len(),
        rule_count: acc.rule_count,
        declaration_count: acc.declaration_count,
        grouped_selector_count: acc.grouped_selector_count,
        max_nesting_depth: acc.max_nesting_depth,
        at_rule_kind_counts: acc.at_rule_kind_counts,
        declaration_kind_counts: acc.declaration_kind_counts,
    }
}

pub fn summarize_css_modules_intermediate(sheet: &Stylesheet) -> ParserIndexSummaryV0 {
    let mut acc = IndexSummaryAcc::default();
    collect_index_names(&sheet.nodes, &mut acc, &[], false);
    let local_value_names: BTreeSet<String> = acc.value_decl_names.iter().cloned().collect();
    let imported_value_names: BTreeSet<String> = acc.value_import_names.iter().cloned().collect();
    let known_value_names: BTreeSet<String> = acc
        .value_decl_names
        .iter()
        .chain(acc.value_import_names.iter())
        .cloned()
        .collect();
    let value_ref_ctx = ValueRefContext {
        known: &known_value_names,
        local: &local_value_names,
        imported: &imported_value_names,
    };
    let known_keyframe_names: BTreeSet<String> = acc.keyframes_names.iter().cloned().collect();
    collect_index_refs_and_counts(&sheet.nodes, value_ref_ctx, &known_keyframe_names, &mut acc);
    collect_index_selector_attachment_facts(
        &sheet.nodes,
        value_ref_ctx,
        &known_keyframe_names,
        &mut acc,
        &[],
        false,
    );

    acc.selector_names.sort();
    acc.selector_names.dedup();
    acc.bem_suffix_parent_names.sort();
    acc.bem_suffix_parent_names.dedup();
    acc.bem_suffix_safe_selector_names.sort();
    acc.bem_suffix_safe_selector_names.dedup();
    acc.selectors_with_composes_names.sort();
    acc.selectors_with_composes_names.dedup();
    acc.selectors_with_composes_under_media_names.sort();
    acc.selectors_with_composes_under_media_names.dedup();
    acc.selectors_with_composes_under_supports_names.sort();
    acc.selectors_with_composes_under_supports_names.dedup();
    acc.selectors_with_composes_under_layer_names.sort();
    acc.selectors_with_composes_under_layer_names.dedup();
    acc.local_composes_selector_names.sort();
    acc.local_composes_selector_names.dedup();
    acc.imported_composes_selector_names.sort();
    acc.imported_composes_selector_names.dedup();
    acc.global_composes_selector_names.sort();
    acc.global_composes_selector_names.dedup();
    acc.local_composes_selector_names_under_media.sort();
    acc.local_composes_selector_names_under_media.dedup();
    acc.local_composes_selector_names_under_supports.sort();
    acc.local_composes_selector_names_under_supports.dedup();
    acc.local_composes_selector_names_under_layer.sort();
    acc.local_composes_selector_names_under_layer.dedup();
    acc.imported_composes_selector_names_under_media.sort();
    acc.imported_composes_selector_names_under_media.dedup();
    acc.imported_composes_selector_names_under_supports.sort();
    acc.imported_composes_selector_names_under_supports.dedup();
    acc.imported_composes_selector_names_under_layer.sort();
    acc.imported_composes_selector_names_under_layer.dedup();
    acc.global_composes_selector_names_under_media.sort();
    acc.global_composes_selector_names_under_media.dedup();
    acc.global_composes_selector_names_under_supports.sort();
    acc.global_composes_selector_names_under_supports.dedup();
    acc.global_composes_selector_names_under_layer.sort();
    acc.global_composes_selector_names_under_layer.dedup();
    acc.composes_import_sources.sort();
    acc.composes_import_sources_under_media.sort();
    acc.composes_import_sources_under_supports.sort();
    acc.composes_import_sources_under_layer.sort();
    acc.keyframes_names.sort();
    acc.keyframes_names.dedup();
    acc.nested_unsafe_selector_names.sort();
    acc.nested_unsafe_selector_names.dedup();
    acc.value_decl_names.sort();
    acc.value_decl_names.dedup();
    acc.value_decl_names_with_local_refs.sort();
    acc.value_decl_names_with_local_refs.dedup();
    acc.value_decl_names_with_imported_refs.sort();
    acc.value_decl_names_with_imported_refs.dedup();
    acc.value_import_names.sort();
    acc.value_import_names.dedup();
    acc.value_import_sources.sort();
    acc.value_ref_names.sort();
    acc.value_ref_names.dedup();
    acc.local_value_ref_names.sort();
    acc.local_value_ref_names.dedup();
    acc.imported_value_ref_names.sort();
    acc.imported_value_ref_names.dedup();
    acc.imported_value_ref_sources.sort();
    acc.declaration_value_ref_names.sort();
    acc.declaration_value_ref_names.dedup();
    acc.declaration_imported_value_ref_sources.sort();
    acc.value_decl_ref_names.sort();
    acc.value_decl_ref_names.dedup();
    acc.value_decl_imported_value_ref_sources.sort();
    acc.selectors_with_value_refs_names.sort();
    acc.selectors_with_value_refs_names.dedup();
    acc.selectors_with_local_value_refs_names.sort();
    acc.selectors_with_local_value_refs_names.dedup();
    acc.selectors_with_imported_value_refs_names.sort();
    acc.selectors_with_imported_value_refs_names.dedup();
    acc.selectors_with_value_refs_under_media_names.sort();
    acc.selectors_with_value_refs_under_media_names.dedup();
    acc.selectors_with_value_refs_under_supports_names.sort();
    acc.selectors_with_value_refs_under_supports_names.dedup();
    acc.selectors_with_value_refs_under_layer_names.sort();
    acc.selectors_with_value_refs_under_layer_names.dedup();
    acc.selectors_with_local_value_refs_under_media_names.sort();
    acc.selectors_with_local_value_refs_under_media_names
        .dedup();
    acc.selectors_with_local_value_refs_under_supports_names
        .sort();
    acc.selectors_with_local_value_refs_under_supports_names
        .dedup();
    acc.selectors_with_local_value_refs_under_layer_names.sort();
    acc.selectors_with_local_value_refs_under_layer_names
        .dedup();
    acc.selectors_with_imported_value_refs_under_media_names
        .sort();
    acc.selectors_with_imported_value_refs_under_media_names
        .dedup();
    acc.selectors_with_imported_value_refs_under_supports_names
        .sort();
    acc.selectors_with_imported_value_refs_under_supports_names
        .dedup();
    acc.selectors_with_imported_value_refs_under_layer_names
        .sort();
    acc.selectors_with_imported_value_refs_under_layer_names
        .dedup();
    acc.selectors_with_animation_ref_names.sort();
    acc.selectors_with_animation_ref_names.dedup();
    acc.selectors_with_animation_refs_under_media_names.sort();
    acc.selectors_with_animation_refs_under_media_names.dedup();
    acc.selectors_with_animation_refs_under_supports_names
        .sort();
    acc.selectors_with_animation_refs_under_supports_names
        .dedup();
    acc.selectors_with_animation_refs_under_layer_names.sort();
    acc.selectors_with_animation_refs_under_layer_names.dedup();
    acc.selectors_with_animation_name_ref_names.sort();
    acc.selectors_with_animation_name_ref_names.dedup();
    acc.selectors_with_animation_name_refs_under_media_names
        .sort();
    acc.selectors_with_animation_name_refs_under_media_names
        .dedup();
    acc.selectors_with_animation_name_refs_under_supports_names
        .sort();
    acc.selectors_with_animation_name_refs_under_supports_names
        .dedup();
    acc.selectors_with_animation_name_refs_under_layer_names
        .sort();
    acc.selectors_with_animation_name_refs_under_layer_names
        .dedup();
    acc.selectors_under_media_names.sort();
    acc.selectors_under_media_names.dedup();
    acc.selectors_under_supports_names.sort();
    acc.selectors_under_supports_names.dedup();
    acc.selectors_under_layer_names.sort();
    acc.selectors_under_layer_names.dedup();
    acc.animation_ref_names.sort();
    acc.animation_ref_names.dedup();
    acc.animation_name_ref_names.sort();
    acc.animation_name_ref_names.dedup();
    acc.keyframes_names_under_media.sort();
    acc.keyframes_names_under_media.dedup();
    acc.keyframes_names_under_supports.sort();
    acc.keyframes_names_under_supports.dedup();
    acc.keyframes_names_under_layer.sort();
    acc.keyframes_names_under_layer.dedup();
    let selectors_with_value_refs_names = acc.selectors_with_value_refs_names.clone();
    let selectors_with_animation_ref_names = acc.selectors_with_animation_ref_names.clone();
    let selectors_with_animation_name_ref_names =
        acc.selectors_with_animation_name_ref_names.clone();

    ParserIndexSummaryV0 {
        schema_version: "0",
        language: match sheet.language {
            StyleLanguage::Css => "css",
            StyleLanguage::Scss => "scss",
            StyleLanguage::Less => "less",
        },
        selectors: ParserIndexSelectorFactsV0 {
            names: acc.selector_names,
            bem_suffix_parent_names: acc.bem_suffix_parent_names,
            bem_suffix_safe_names: acc.bem_suffix_safe_selector_names,
            nested_unsafe_names: acc.nested_unsafe_selector_names,
            selectors_with_value_refs_names,
            selectors_with_animation_ref_names,
            selectors_with_animation_name_ref_names,
            bem_suffix_count: acc.bem_suffix_count,
            nested_safety_counts: acc.nested_safety_counts,
        },
        values: ParserIndexValueFactsV0 {
            decl_names: acc.value_decl_names,
            decl_names_with_local_refs: acc.value_decl_names_with_local_refs,
            decl_names_with_imported_refs: acc.value_decl_names_with_imported_refs,
            import_names: acc.value_import_names,
            import_sources: acc.value_import_sources,
            import_alias_count: acc.value_import_alias_count,
            ref_names: acc.value_ref_names,
            local_ref_names: acc.local_value_ref_names,
            imported_ref_names: acc.imported_value_ref_names,
            imported_ref_sources: acc.imported_value_ref_sources,
            declaration_ref_names: acc.declaration_value_ref_names,
            declaration_imported_ref_sources: acc.declaration_imported_value_ref_sources,
            value_decl_ref_names: acc.value_decl_ref_names,
            value_decl_imported_ref_sources: acc.value_decl_imported_value_ref_sources,
            selectors_with_refs_names: acc.selectors_with_value_refs_names,
            selectors_with_local_refs_names: acc.selectors_with_local_value_refs_names,
            selectors_with_imported_refs_names: acc.selectors_with_imported_value_refs_names,
            selectors_with_refs_under_media_names: acc.selectors_with_value_refs_under_media_names,
            selectors_with_refs_under_supports_names: acc
                .selectors_with_value_refs_under_supports_names,
            selectors_with_refs_under_layer_names: acc.selectors_with_value_refs_under_layer_names,
            selectors_with_local_refs_under_media_names: acc
                .selectors_with_local_value_refs_under_media_names,
            selectors_with_local_refs_under_supports_names: acc
                .selectors_with_local_value_refs_under_supports_names,
            selectors_with_local_refs_under_layer_names: acc
                .selectors_with_local_value_refs_under_layer_names,
            selectors_with_imported_refs_under_media_names: acc
                .selectors_with_imported_value_refs_under_media_names,
            selectors_with_imported_refs_under_supports_names: acc
                .selectors_with_imported_value_refs_under_supports_names,
            selectors_with_imported_refs_under_layer_names: acc
                .selectors_with_imported_value_refs_under_layer_names,
        },
        keyframes: ParserIndexKeyframesFactsV0 {
            names: acc.keyframes_names,
            names_under_media: acc.keyframes_names_under_media,
            names_under_supports: acc.keyframes_names_under_supports,
            names_under_layer: acc.keyframes_names_under_layer,
            animation_ref_names: acc.animation_ref_names,
            animation_name_ref_names: acc.animation_name_ref_names,
            selectors_with_animation_ref_names: acc.selectors_with_animation_ref_names,
            selectors_with_animation_name_ref_names: acc.selectors_with_animation_name_ref_names,
            selectors_with_animation_refs_under_media_names: acc
                .selectors_with_animation_refs_under_media_names,
            selectors_with_animation_refs_under_supports_names: acc
                .selectors_with_animation_refs_under_supports_names,
            selectors_with_animation_refs_under_layer_names: acc
                .selectors_with_animation_refs_under_layer_names,
            selectors_with_animation_name_refs_under_media_names: acc
                .selectors_with_animation_name_refs_under_media_names,
            selectors_with_animation_name_refs_under_supports_names: acc
                .selectors_with_animation_name_refs_under_supports_names,
            selectors_with_animation_name_refs_under_layer_names: acc
                .selectors_with_animation_name_refs_under_layer_names,
        },
        composes: ParserIndexComposesFactsV0 {
            selectors_with_composes_names: acc.selectors_with_composes_names,
            selectors_with_composes_under_media_names: acc
                .selectors_with_composes_under_media_names,
            selectors_with_composes_under_supports_names: acc
                .selectors_with_composes_under_supports_names,
            selectors_with_composes_under_layer_names: acc
                .selectors_with_composes_under_layer_names,
            local_selector_names: acc.local_composes_selector_names,
            imported_selector_names: acc.imported_composes_selector_names,
            global_selector_names: acc.global_composes_selector_names,
            local_selector_names_under_media: acc.local_composes_selector_names_under_media,
            local_selector_names_under_supports: acc.local_composes_selector_names_under_supports,
            local_selector_names_under_layer: acc.local_composes_selector_names_under_layer,
            imported_selector_names_under_media: acc.imported_composes_selector_names_under_media,
            imported_selector_names_under_supports: acc
                .imported_composes_selector_names_under_supports,
            imported_selector_names_under_layer: acc.imported_composes_selector_names_under_layer,
            global_selector_names_under_media: acc.global_composes_selector_names_under_media,
            global_selector_names_under_supports: acc.global_composes_selector_names_under_supports,
            global_selector_names_under_layer: acc.global_composes_selector_names_under_layer,
            import_sources: acc.composes_import_sources,
            import_sources_under_media: acc.composes_import_sources_under_media,
            import_sources_under_supports: acc.composes_import_sources_under_supports,
            import_sources_under_layer: acc.composes_import_sources_under_layer,
            class_name_count: acc.composes_class_name_count,
            local_class_name_count: acc.local_composes_class_name_count,
            imported_class_name_count: acc.imported_composes_class_name_count,
            global_class_name_count: acc.global_composes_class_name_count,
        },
        wrappers: ParserIndexWrapperFactsV0 {
            selectors_under_media_names: acc.selectors_under_media_names,
            selectors_under_supports_names: acc.selectors_under_supports_names,
            selectors_under_layer_names: acc.selectors_under_layer_names,
        },
    }
}

pub fn summarize_parser_canonical_candidate(
    sheet: &Stylesheet,
) -> ParserCanonicalCandidateBundleV0 {
    let parity_lite = summarize_parity_lite(sheet);
    let css_modules_intermediate = summarize_css_modules_intermediate(sheet);

    ParserCanonicalCandidateBundleV0 {
        schema_version: "0",
        language: parity_lite.language,
        parity_lite,
        css_modules_intermediate,
    }
}

pub fn summarize_parser_evaluator_candidates(sheet: &Stylesheet) -> ParserEvaluatorCandidatesV0 {
    let intermediate = summarize_css_modules_intermediate(sheet);
    let bem_suffix_safe_names: BTreeSet<&str> = intermediate
        .selectors
        .bem_suffix_safe_names
        .iter()
        .map(String::as_str)
        .collect();
    let nested_unsafe_names: BTreeSet<&str> = intermediate
        .selectors
        .nested_unsafe_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_under_media_names: BTreeSet<&str> = intermediate
        .wrappers
        .selectors_under_media_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_under_supports_names: BTreeSet<&str> = intermediate
        .wrappers
        .selectors_under_supports_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_under_layer_names: BTreeSet<&str> = intermediate
        .wrappers
        .selectors_under_layer_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_with_refs_names: BTreeSet<&str> = intermediate
        .values
        .selectors_with_refs_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_with_local_refs_names: BTreeSet<&str> = intermediate
        .values
        .selectors_with_local_refs_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_with_imported_refs_names: BTreeSet<&str> = intermediate
        .values
        .selectors_with_imported_refs_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_with_animation_ref_names: BTreeSet<&str> = intermediate
        .keyframes
        .selectors_with_animation_ref_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_with_animation_name_ref_names: BTreeSet<&str> = intermediate
        .keyframes
        .selectors_with_animation_name_ref_names
        .iter()
        .map(String::as_str)
        .collect();
    let selectors_with_composes_names: BTreeSet<&str> = intermediate
        .composes
        .selectors_with_composes_names
        .iter()
        .map(String::as_str)
        .collect();
    let local_selector_names: BTreeSet<&str> = intermediate
        .composes
        .local_selector_names
        .iter()
        .map(String::as_str)
        .collect();
    let imported_selector_names: BTreeSet<&str> = intermediate
        .composes
        .imported_selector_names
        .iter()
        .map(String::as_str)
        .collect();
    let global_selector_names: BTreeSet<&str> = intermediate
        .composes
        .global_selector_names
        .iter()
        .map(String::as_str)
        .collect();

    let results = intermediate
        .selectors
        .names
        .iter()
        .map(|selector_name| {
            let selector = selector_name.as_str();
            let nested_safety_kind = if nested_unsafe_names.contains(selector) {
                "nestedUnsafe"
            } else if bem_suffix_safe_names.contains(selector) {
                "bemSuffixSafe"
            } else {
                "flat"
            };
            let bem_suffix_parent_name = if nested_safety_kind == "bemSuffixSafe" {
                let suffix_split_index = [selector.rfind("__"), selector.rfind("--")]
                    .into_iter()
                    .flatten()
                    .max();
                suffix_split_index.map(|index| selector[..index].to_string())
            } else {
                None
            };

            ParserEvaluatorCandidateV0 {
                kind: "selector-index-facts",
                selector_name: selector_name.clone(),
                nested_safety_kind,
                bem_suffix_parent_name,
                under_media: selectors_under_media_names.contains(selector),
                under_supports: selectors_under_supports_names.contains(selector),
                under_layer: selectors_under_layer_names.contains(selector),
                has_value_refs: selectors_with_refs_names.contains(selector),
                has_local_value_refs: selectors_with_local_refs_names.contains(selector),
                has_imported_value_refs: selectors_with_imported_refs_names.contains(selector),
                has_animation_ref: selectors_with_animation_ref_names.contains(selector),
                has_animation_name_ref: selectors_with_animation_name_ref_names.contains(selector),
                has_composes: selectors_with_composes_names.contains(selector),
                has_local_composes: local_selector_names.contains(selector),
                has_imported_composes: imported_selector_names.contains(selector),
                has_global_composes: global_selector_names.contains(selector),
            }
        })
        .collect();

    ParserEvaluatorCandidatesV0 {
        schema_version: "0",
        language: intermediate.language,
        results,
    }
}

pub fn summarize_parser_canonical_producer_signal(
    sheet: &Stylesheet,
) -> ParserCanonicalProducerSignalV0 {
    let canonical_candidate = summarize_parser_canonical_candidate(sheet);
    let evaluator_candidates = summarize_parser_evaluator_candidates(sheet);

    ParserCanonicalProducerSignalV0 {
        schema_version: "0",
        language: canonical_candidate.language,
        canonical_candidate,
        evaluator_candidates,
        public_product_gate: ParserPublicProductGateSignalV0 {
            canonical_candidate_command: "pnpm check:rust-parser-canonical-candidate",
            consumer_boundary_command: "pnpm check:rust-parser-consumer-boundary",
            public_product_gate_command: "pnpm check:rust-parser-public-product",
            included_in_parser_lane: true,
            included_in_rust_lane_bundle: true,
            included_in_rust_release_bundle: true,
        },
    }
}

pub fn summarize_index_bridge(sheet: &Stylesheet) -> ParserIndexSummaryV0 {
    summarize_css_modules_intermediate(sheet)
}

fn collect_parity_names(nodes: &[SyntaxNode], acc: &mut ParityLiteAcc) {
    collect_parity_names_with_parent(nodes, acc, &[], 0);
}

fn collect_parity_names_with_parent(
    nodes: &[SyntaxNode],
    acc: &mut ParityLiteAcc,
    parent_selector_names: &[String],
    depth: usize,
) {
    for node in nodes {
        let mut next_parent_names = parent_selector_names.to_vec();
        let mut next_depth = depth;
        match &node.payload {
            Some(SyntaxNodePayload::Rule(rule)) => {
                acc.rule_count += 1;
                next_depth = depth + 1;
                acc.max_nesting_depth = acc.max_nesting_depth.max(next_depth);
                if rule.selector_groups.len() > 1 {
                    acc.grouped_selector_count += rule.selector_groups.len();
                }
                let resolved = resolve_rule_selector_names(rule, parent_selector_names);
                if !resolved.is_empty() {
                    acc.selector_names.extend(resolved.iter().cloned());
                    next_parent_names = resolved;
                }
            }
            Some(SyntaxNodePayload::AtRule(at_rule)) => {
                next_depth = depth + 1;
                acc.max_nesting_depth = acc.max_nesting_depth.max(next_depth);
                increment_at_rule_kind_count(&mut acc.at_rule_kind_counts, at_rule.kind);
                match at_rule.kind {
                    AtRuleKind::Keyframes if !at_rule.params.is_empty() => {
                        acc.keyframes_names.push(at_rule.params.clone());
                    }
                    AtRuleKind::Keyframes => {}
                    AtRuleKind::Value => {
                        if let Some((name, _)) = at_rule.params.split_once(':') {
                            let trimmed = name.trim();
                            if !trimmed.is_empty() {
                                acc.value_decl_names.push(trimmed.to_string());
                            }
                        }
                    }
                    _ => {}
                }
            }
            Some(SyntaxNodePayload::Declaration(declaration)) => {
                acc.declaration_count += 1;
                increment_declaration_kind_count(
                    &mut acc.declaration_kind_counts,
                    classify_declaration_kind(&declaration.property),
                );
            }
            _ => {}
        }
        collect_parity_names_with_parent(&node.children, acc, &next_parent_names, next_depth);
    }
}

fn increment_at_rule_kind_count(counts: &mut AtRuleKindCountsV0, kind: AtRuleKind) {
    match kind {
        AtRuleKind::Media => counts.media += 1,
        AtRuleKind::Supports => counts.supports += 1,
        AtRuleKind::Layer => counts.layer += 1,
        AtRuleKind::Keyframes => counts.keyframes += 1,
        AtRuleKind::Value => counts.value += 1,
        AtRuleKind::AtRoot => counts.at_root += 1,
        AtRuleKind::Generic => counts.generic += 1,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DeclarationKind {
    Composes,
    Animation,
    AnimationName,
    Generic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NestedSafetyKind {
    Flat,
    BemSuffixSafe,
    NestedUnsafe,
}

struct RuleSelectorFacts {
    nested_safety: NestedSafetyKind,
    bem_suffix_count: usize,
}

#[derive(Debug, Default)]
struct RuleComposesFacts {
    local_class_name_count: usize,
    imported_class_name_count: usize,
    global_class_name_count: usize,
    imported_sources: Vec<String>,
}

#[derive(Debug, Default)]
struct RuleReferenceFacts {
    has_value_refs: bool,
    has_local_value_refs: bool,
    has_imported_value_refs: bool,
    has_animation_refs: bool,
    has_animation_name_refs: bool,
}

#[derive(Debug, Clone, Copy, Default)]
struct WrapperContext {
    under_media: bool,
    under_supports: bool,
    under_layer: bool,
}

#[derive(Debug, Clone, Copy)]
struct ValueRefContext<'a> {
    known: &'a BTreeSet<String>,
    local: &'a BTreeSet<String>,
    imported: &'a BTreeSet<String>,
}

#[derive(Debug, Clone, Copy)]
enum ValueRefOrigin {
    Declaration,
    ValueDecl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ComposesKind {
    Local,
    Imported,
    Global,
}

#[derive(Debug)]
struct ComposesSpec {
    class_names: Vec<String>,
    kind: ComposesKind,
    from_source: Option<String>,
}

fn classify_declaration_kind(property: &str) -> DeclarationKind {
    match property.trim().to_ascii_lowercase().as_str() {
        "composes" => DeclarationKind::Composes,
        "animation" => DeclarationKind::Animation,
        "animation-name" => DeclarationKind::AnimationName,
        _ => DeclarationKind::Generic,
    }
}

fn increment_declaration_kind_count(counts: &mut DeclarationKindCountsV0, kind: DeclarationKind) {
    match kind {
        DeclarationKind::Composes => counts.composes += 1,
        DeclarationKind::Animation => counts.animation += 1,
        DeclarationKind::AnimationName => counts.animation_name += 1,
        DeclarationKind::Generic => counts.generic += 1,
    }
}

fn classify_rule_selector_facts(
    rule: &RulePayload,
    parent_selector_names: &[String],
    parent_is_grouped: bool,
) -> RuleSelectorFacts {
    let is_nested = rule
        .selector_groups
        .iter()
        .any(|group| group.raw.contains('&'));
    if !is_nested {
        return RuleSelectorFacts {
            nested_safety: NestedSafetyKind::Flat,
            bem_suffix_count: 0,
        };
    }

    let bem_suffix_safe = rule.selector_groups.len() == 1
        && parent_selector_names.len() == 1
        && !parent_is_grouped
        && matches!(
            rule.selector_groups[0].segments.as_slice(),
            [SelectorSegment::Ampersand, SelectorSegment::BemSuffix(_)]
        );

    if bem_suffix_safe {
        RuleSelectorFacts {
            nested_safety: NestedSafetyKind::BemSuffixSafe,
            bem_suffix_count: 1,
        }
    } else {
        RuleSelectorFacts {
            nested_safety: NestedSafetyKind::NestedUnsafe,
            bem_suffix_count: 0,
        }
    }
}

fn increment_nested_safety_count(
    counts: &mut NestedSafetyCountsV0,
    kind: NestedSafetyKind,
    amount: usize,
) {
    match kind {
        NestedSafetyKind::Flat => counts.flat += amount,
        NestedSafetyKind::BemSuffixSafe => counts.bem_suffix_safe += amount,
        NestedSafetyKind::NestedUnsafe => counts.nested_unsafe += amount,
    }
}

fn collect_rule_composes_facts(children: &[SyntaxNode]) -> RuleComposesFacts {
    let mut facts = RuleComposesFacts::default();
    for child in children {
        if let Some(SyntaxNodePayload::Declaration(declaration)) = &child.payload
            && classify_declaration_kind(&declaration.property) == DeclarationKind::Composes
            && let Some(spec) = parse_composes_spec(&declaration.value)
        {
            match spec.kind {
                ComposesKind::Local => facts.local_class_name_count += spec.class_names.len(),
                ComposesKind::Imported => {
                    facts.imported_class_name_count += spec.class_names.len();
                    if let Some(source) = spec.from_source {
                        facts.imported_sources.push(source);
                    }
                }
                ComposesKind::Global => facts.global_class_name_count += spec.class_names.len(),
            }
        }
    }
    facts
}

fn collect_rule_reference_facts(
    children: &[SyntaxNode],
    value_ref_ctx: ValueRefContext<'_>,
    known_keyframe_names: &BTreeSet<String>,
) -> RuleReferenceFacts {
    let mut facts = RuleReferenceFacts::default();
    for child in children {
        if let Some(SyntaxNodePayload::Declaration(declaration)) = &child.payload {
            match classify_declaration_kind(&declaration.property) {
                DeclarationKind::Composes => {}
                DeclarationKind::Animation => {
                    if !find_identifier_matches(&declaration.value, known_keyframe_names).is_empty()
                    {
                        facts.has_animation_refs = true;
                    }
                    let value_refs =
                        find_identifier_matches(&declaration.value, value_ref_ctx.known);
                    if !value_refs.is_empty() {
                        facts.has_value_refs = true;
                        facts.has_local_value_refs |= value_refs
                            .iter()
                            .any(|name| value_ref_ctx.local.contains(name));
                        facts.has_imported_value_refs |= value_refs
                            .iter()
                            .any(|name| value_ref_ctx.imported.contains(name));
                    }
                }
                DeclarationKind::AnimationName => {
                    if !find_identifier_matches(&declaration.value, known_keyframe_names).is_empty()
                    {
                        facts.has_animation_name_refs = true;
                    }
                    let value_refs =
                        find_identifier_matches(&declaration.value, value_ref_ctx.known);
                    if !value_refs.is_empty() {
                        facts.has_value_refs = true;
                        facts.has_local_value_refs |= value_refs
                            .iter()
                            .any(|name| value_ref_ctx.local.contains(name));
                        facts.has_imported_value_refs |= value_refs
                            .iter()
                            .any(|name| value_ref_ctx.imported.contains(name));
                    }
                }
                DeclarationKind::Generic => {
                    let value_refs =
                        find_identifier_matches(&declaration.value, value_ref_ctx.known);
                    if !value_refs.is_empty() {
                        facts.has_value_refs = true;
                        facts.has_local_value_refs |= value_refs
                            .iter()
                            .any(|name| value_ref_ctx.local.contains(name));
                        facts.has_imported_value_refs |= value_refs
                            .iter()
                            .any(|name| value_ref_ctx.imported.contains(name));
                    }
                }
            }
        }
    }
    facts
}

fn collect_index_names(
    nodes: &[SyntaxNode],
    acc: &mut IndexSummaryAcc,
    parent_selector_names: &[String],
    parent_is_grouped: bool,
) {
    for node in nodes {
        let mut next_parent_names = parent_selector_names.to_vec();
        let mut next_parent_is_grouped = false;
        let mut split_child_branches = false;
        match &node.payload {
            Some(SyntaxNodePayload::Rule(rule)) => {
                let resolved = resolve_rule_selector_names(rule, parent_selector_names);
                if !resolved.is_empty() {
                    let selector_facts = classify_rule_selector_facts(
                        rule,
                        parent_selector_names,
                        parent_is_grouped,
                    );
                    acc.bem_suffix_count += selector_facts.bem_suffix_count;
                    increment_nested_safety_count(
                        &mut acc.nested_safety_counts,
                        selector_facts.nested_safety,
                        resolved.len(),
                    );
                    acc.selector_names.extend(resolved.iter().cloned());
                    let composes_facts = collect_rule_composes_facts(&node.children);
                    if composes_facts.local_class_name_count > 0
                        || composes_facts.imported_class_name_count > 0
                        || composes_facts.global_class_name_count > 0
                    {
                        acc.selectors_with_composes_names
                            .extend(resolved.iter().cloned());
                        let selector_multiplier = resolved.len();
                        if composes_facts.local_class_name_count > 0 {
                            acc.local_composes_selector_names
                                .extend(resolved.iter().cloned());
                            acc.local_composes_class_name_count +=
                                composes_facts.local_class_name_count * selector_multiplier;
                        }
                        if composes_facts.imported_class_name_count > 0 {
                            acc.imported_composes_selector_names
                                .extend(resolved.iter().cloned());
                            acc.imported_composes_class_name_count +=
                                composes_facts.imported_class_name_count * selector_multiplier;
                            acc.composes_import_sources.extend(
                                composes_facts.imported_sources.iter().flat_map(|source| {
                                    std::iter::repeat_n(source.clone(), selector_multiplier)
                                }),
                            );
                        }
                        if composes_facts.global_class_name_count > 0 {
                            acc.global_composes_selector_names
                                .extend(resolved.iter().cloned());
                            acc.global_composes_class_name_count +=
                                composes_facts.global_class_name_count * selector_multiplier;
                        }
                        acc.composes_class_name_count += (composes_facts.local_class_name_count
                            + composes_facts.imported_class_name_count
                            + composes_facts.global_class_name_count)
                            * selector_multiplier;
                    }
                    match selector_facts.nested_safety {
                        NestedSafetyKind::BemSuffixSafe => {
                            acc.bem_suffix_safe_selector_names
                                .extend(resolved.iter().cloned());
                            if let Some(parent_name) = parent_selector_names.first() {
                                acc.bem_suffix_parent_names.push(parent_name.clone());
                            }
                        }
                        NestedSafetyKind::NestedUnsafe => {
                            acc.nested_unsafe_selector_names
                                .extend(resolved.iter().cloned());
                        }
                        NestedSafetyKind::Flat => {}
                    }
                    next_parent_is_grouped = resolved.len() > 1;
                    next_parent_names = resolved;
                    split_child_branches = true;
                }
            }
            Some(SyntaxNodePayload::AtRule(at_rule)) => match at_rule.kind {
                AtRuleKind::Keyframes if !at_rule.params.is_empty() => {
                    acc.keyframes_names.push(at_rule.params.clone());
                }
                AtRuleKind::Keyframes => {}
                AtRuleKind::Value => {
                    if let Some(import_specs) = parse_value_import_specs(&at_rule.params) {
                        acc.value_import_alias_count += import_specs
                            .iter()
                            .filter(|spec| spec.imported_name != spec.local_name)
                            .count();
                        acc.value_import_names
                            .extend(import_specs.iter().map(|spec| spec.local_name.clone()));
                        acc.value_import_source_by_name
                            .extend(import_specs.iter().filter_map(|spec| {
                                spec.from_source
                                    .as_ref()
                                    .map(|source| (spec.local_name.clone(), source.clone()))
                            }));
                        acc.value_import_sources
                            .extend(import_specs.into_iter().filter_map(|spec| spec.from_source));
                    } else if let Some((name, _)) = parse_local_value_decl_parts(&at_rule.params) {
                        acc.value_decl_names.push(name.to_string());
                    }
                }
                _ => {}
            },
            _ => {}
        }
        if split_child_branches {
            for parent_name in &next_parent_names {
                collect_index_names(
                    &node.children,
                    acc,
                    std::slice::from_ref(parent_name),
                    next_parent_is_grouped,
                );
            }
        } else {
            collect_index_names(
                &node.children,
                acc,
                &next_parent_names,
                next_parent_is_grouped,
            );
        }
    }
}

fn collect_index_refs_and_counts(
    nodes: &[SyntaxNode],
    value_ref_ctx: ValueRefContext<'_>,
    known_keyframe_names: &BTreeSet<String>,
    acc: &mut IndexSummaryAcc,
) {
    for node in nodes {
        match &node.payload {
            Some(SyntaxNodePayload::Declaration(declaration)) => {
                match classify_declaration_kind(&declaration.property) {
                    DeclarationKind::Composes => {}
                    DeclarationKind::Animation => {
                        acc.animation_ref_names.extend(find_identifier_matches(
                            &declaration.value,
                            known_keyframe_names,
                        ));
                        extend_value_ref_facts(
                            acc,
                            find_identifier_matches(&declaration.value, value_ref_ctx.known),
                            value_ref_ctx,
                            ValueRefOrigin::Declaration,
                        );
                    }
                    DeclarationKind::AnimationName => {
                        acc.animation_name_ref_names.extend(find_identifier_matches(
                            &declaration.value,
                            known_keyframe_names,
                        ));
                        extend_value_ref_facts(
                            acc,
                            find_identifier_matches(&declaration.value, value_ref_ctx.known),
                            value_ref_ctx,
                            ValueRefOrigin::Declaration,
                        );
                    }
                    DeclarationKind::Generic => {
                        extend_value_ref_facts(
                            acc,
                            find_identifier_matches(&declaration.value, value_ref_ctx.known),
                            value_ref_ctx,
                            ValueRefOrigin::Declaration,
                        );
                    }
                }
            }
            Some(SyntaxNodePayload::AtRule(at_rule)) if at_rule.kind == AtRuleKind::Value => {
                if let Some((name, value)) = parse_local_value_decl_parts(&at_rule.params) {
                    let value_refs: Vec<String> =
                        find_identifier_matches(value, value_ref_ctx.known)
                            .into_iter()
                            .filter(|candidate| candidate != name)
                            .collect();
                    if value_refs
                        .iter()
                        .any(|candidate| value_ref_ctx.local.contains(candidate))
                    {
                        acc.value_decl_names_with_local_refs.push(name.to_string());
                    }
                    if value_refs
                        .iter()
                        .any(|candidate| value_ref_ctx.imported.contains(candidate))
                    {
                        acc.value_decl_names_with_imported_refs
                            .push(name.to_string());
                    }
                    extend_value_ref_facts(
                        acc,
                        value_refs,
                        value_ref_ctx,
                        ValueRefOrigin::ValueDecl,
                    );
                }
            }
            _ => {}
        }
        collect_index_refs_and_counts(&node.children, value_ref_ctx, known_keyframe_names, acc);
    }
}

fn extend_value_ref_facts(
    acc: &mut IndexSummaryAcc,
    value_refs: Vec<String>,
    value_ref_ctx: ValueRefContext<'_>,
    origin: ValueRefOrigin,
) {
    acc.value_ref_names.extend(value_refs.iter().cloned());

    let local_refs: Vec<String> = value_refs
        .iter()
        .filter(|name| value_ref_ctx.local.contains(*name))
        .cloned()
        .collect();
    acc.local_value_ref_names.extend(local_refs);

    let imported_refs: Vec<String> = value_refs
        .iter()
        .filter(|name| value_ref_ctx.imported.contains(*name))
        .cloned()
        .collect();
    acc.imported_value_ref_names
        .extend(imported_refs.iter().cloned());

    let imported_ref_sources: Vec<String> = imported_refs
        .iter()
        .filter_map(|name| acc.value_import_source_by_name.get(name))
        .cloned()
        .collect();
    acc.imported_value_ref_sources
        .extend(imported_ref_sources.iter().cloned());

    match origin {
        ValueRefOrigin::Declaration => {
            acc.declaration_value_ref_names.extend(value_refs);
            acc.declaration_imported_value_ref_sources
                .extend(imported_ref_sources);
        }
        ValueRefOrigin::ValueDecl => {
            acc.value_decl_ref_names.extend(value_refs);
            acc.value_decl_imported_value_ref_sources
                .extend(imported_ref_sources);
        }
    }
}

fn collect_index_selector_attachment_facts(
    nodes: &[SyntaxNode],
    value_ref_ctx: ValueRefContext<'_>,
    known_keyframe_names: &BTreeSet<String>,
    acc: &mut IndexSummaryAcc,
    parent_selector_names: &[String],
    _parent_is_grouped: bool,
) {
    collect_index_selector_attachment_facts_with_context(
        nodes,
        value_ref_ctx,
        known_keyframe_names,
        acc,
        parent_selector_names,
        WrapperContext::default(),
    );
}

fn collect_index_selector_attachment_facts_with_context(
    nodes: &[SyntaxNode],
    value_ref_ctx: ValueRefContext<'_>,
    known_keyframe_names: &BTreeSet<String>,
    acc: &mut IndexSummaryAcc,
    parent_selector_names: &[String],
    wrapper_ctx: WrapperContext,
) {
    for node in nodes {
        let mut next_parent_names = parent_selector_names.to_vec();
        let mut split_child_branches = false;
        let mut child_wrapper_ctx = wrapper_ctx;
        if let Some(SyntaxNodePayload::Rule(rule)) = &node.payload {
            let resolved = resolve_rule_selector_names(rule, parent_selector_names);
            if !resolved.is_empty() {
                let ref_facts = collect_rule_reference_facts(
                    &node.children,
                    value_ref_ctx,
                    known_keyframe_names,
                );
                if ref_facts.has_value_refs {
                    acc.selectors_with_value_refs_names
                        .extend(resolved.iter().cloned());
                    if wrapper_ctx.under_media {
                        acc.selectors_with_value_refs_under_media_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.selectors_with_value_refs_under_supports_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.selectors_with_value_refs_under_layer_names
                            .extend(resolved.iter().cloned());
                    }
                }
                if ref_facts.has_local_value_refs {
                    acc.selectors_with_local_value_refs_names
                        .extend(resolved.iter().cloned());
                    if wrapper_ctx.under_media {
                        acc.selectors_with_local_value_refs_under_media_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.selectors_with_local_value_refs_under_supports_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.selectors_with_local_value_refs_under_layer_names
                            .extend(resolved.iter().cloned());
                    }
                }
                if ref_facts.has_imported_value_refs {
                    acc.selectors_with_imported_value_refs_names
                        .extend(resolved.iter().cloned());
                    if wrapper_ctx.under_media {
                        acc.selectors_with_imported_value_refs_under_media_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.selectors_with_imported_value_refs_under_supports_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.selectors_with_imported_value_refs_under_layer_names
                            .extend(resolved.iter().cloned());
                    }
                }
                if ref_facts.has_animation_refs {
                    acc.selectors_with_animation_ref_names
                        .extend(resolved.iter().cloned());
                    if wrapper_ctx.under_media {
                        acc.selectors_with_animation_refs_under_media_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.selectors_with_animation_refs_under_supports_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.selectors_with_animation_refs_under_layer_names
                            .extend(resolved.iter().cloned());
                    }
                }
                if ref_facts.has_animation_name_refs {
                    acc.selectors_with_animation_name_ref_names
                        .extend(resolved.iter().cloned());
                    if wrapper_ctx.under_media {
                        acc.selectors_with_animation_name_refs_under_media_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.selectors_with_animation_name_refs_under_supports_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.selectors_with_animation_name_refs_under_layer_names
                            .extend(resolved.iter().cloned());
                    }
                }
                let composes_facts = collect_rule_composes_facts(&node.children);
                if composes_facts.local_class_name_count > 0
                    || composes_facts.imported_class_name_count > 0
                    || composes_facts.global_class_name_count > 0
                {
                    if wrapper_ctx.under_media {
                        acc.selectors_with_composes_under_media_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.selectors_with_composes_under_supports_names
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.selectors_with_composes_under_layer_names
                            .extend(resolved.iter().cloned());
                    }
                }
                if composes_facts.local_class_name_count > 0 {
                    if wrapper_ctx.under_media {
                        acc.local_composes_selector_names_under_media
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.local_composes_selector_names_under_supports
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.local_composes_selector_names_under_layer
                            .extend(resolved.iter().cloned());
                    }
                }
                if composes_facts.imported_class_name_count > 0 {
                    if wrapper_ctx.under_media {
                        acc.imported_composes_selector_names_under_media
                            .extend(resolved.iter().cloned());
                        acc.composes_import_sources_under_media.extend(
                            composes_facts.imported_sources.iter().flat_map(|source| {
                                std::iter::repeat_n(source.clone(), resolved.len())
                            }),
                        );
                    }
                    if wrapper_ctx.under_supports {
                        acc.imported_composes_selector_names_under_supports
                            .extend(resolved.iter().cloned());
                        acc.composes_import_sources_under_supports.extend(
                            composes_facts.imported_sources.iter().flat_map(|source| {
                                std::iter::repeat_n(source.clone(), resolved.len())
                            }),
                        );
                    }
                    if wrapper_ctx.under_layer {
                        acc.imported_composes_selector_names_under_layer
                            .extend(resolved.iter().cloned());
                        acc.composes_import_sources_under_layer.extend(
                            composes_facts.imported_sources.iter().flat_map(|source| {
                                std::iter::repeat_n(source.clone(), resolved.len())
                            }),
                        );
                    }
                }
                if composes_facts.global_class_name_count > 0 {
                    if wrapper_ctx.under_media {
                        acc.global_composes_selector_names_under_media
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_supports {
                        acc.global_composes_selector_names_under_supports
                            .extend(resolved.iter().cloned());
                    }
                    if wrapper_ctx.under_layer {
                        acc.global_composes_selector_names_under_layer
                            .extend(resolved.iter().cloned());
                    }
                }
                if wrapper_ctx.under_media {
                    acc.selectors_under_media_names
                        .extend(resolved.iter().cloned());
                }
                if wrapper_ctx.under_supports {
                    acc.selectors_under_supports_names
                        .extend(resolved.iter().cloned());
                }
                if wrapper_ctx.under_layer {
                    acc.selectors_under_layer_names
                        .extend(resolved.iter().cloned());
                }
                next_parent_names = resolved;
                split_child_branches = true;
            }
        } else if let Some(SyntaxNodePayload::AtRule(at_rule)) = &node.payload {
            if at_rule.kind == AtRuleKind::Keyframes && !at_rule.params.is_empty() {
                if wrapper_ctx.under_media {
                    acc.keyframes_names_under_media.push(at_rule.params.clone());
                }
                if wrapper_ctx.under_supports {
                    acc.keyframes_names_under_supports
                        .push(at_rule.params.clone());
                }
                if wrapper_ctx.under_layer {
                    acc.keyframes_names_under_layer.push(at_rule.params.clone());
                }
            }
            match at_rule.kind {
                AtRuleKind::Media => child_wrapper_ctx.under_media = true,
                AtRuleKind::Supports => child_wrapper_ctx.under_supports = true,
                AtRuleKind::Layer => child_wrapper_ctx.under_layer = true,
                _ => {}
            }
        }

        if split_child_branches {
            for parent_name in &next_parent_names {
                collect_index_selector_attachment_facts_with_context(
                    &node.children,
                    value_ref_ctx,
                    known_keyframe_names,
                    acc,
                    std::slice::from_ref(parent_name),
                    child_wrapper_ctx,
                );
            }
        } else {
            collect_index_selector_attachment_facts_with_context(
                &node.children,
                value_ref_ctx,
                known_keyframe_names,
                acc,
                &next_parent_names,
                child_wrapper_ctx,
            );
        }
    }
}

fn parse_local_value_decl_parts(params: &str) -> Option<(&str, &str)> {
    if params.contains(" from ") {
        return None;
    }
    let (name, value) = params.split_once(':')?;
    let trimmed_name = name.trim();
    let trimmed_value = value.trim();
    if trimmed_name.is_empty() || trimmed_value.is_empty() {
        return None;
    }
    Some((trimmed_name, trimmed_value))
}

struct ValueImportSpec {
    imported_name: String,
    local_name: String,
    from_source: Option<String>,
}

fn parse_value_import_specs(params: &str) -> Option<Vec<ValueImportSpec>> {
    let (raw_specs, raw_source) = params.split_once(" from ")?;
    let from_source = parse_quoted_import_source(raw_source);
    let mut specs = Vec::new();
    for raw_spec in raw_specs.split(',') {
        let trimmed = raw_spec.trim();
        if trimmed.is_empty() {
            continue;
        }
        let imported_name = trimmed
            .split_once(" as ")
            .map(|(imported, _)| imported.trim())
            .unwrap_or(trimmed);
        let local_name = trimmed
            .split_once(" as ")
            .map(|(_, local)| local.trim())
            .unwrap_or(trimmed);
        if !imported_name.is_empty() && !local_name.is_empty() {
            specs.push(ValueImportSpec {
                imported_name: imported_name.to_string(),
                local_name: local_name.to_string(),
                from_source: from_source.clone(),
            });
        }
    }
    (!specs.is_empty()).then_some(specs)
}

fn parse_composes_spec(value: &str) -> Option<ComposesSpec> {
    let head = value
        .split_once(" from ")
        .map(|(left, _)| left)
        .unwrap_or(value);
    let class_names: Vec<String> = head
        .split_whitespace()
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .collect();
    if class_names.is_empty() {
        return None;
    }
    let from_source = value
        .split_once(" from ")
        .and_then(|(_, source)| parse_quoted_import_source(source));
    let kind = match value.split_once(" from ").map(|(_, source)| source.trim()) {
        Some("global") => ComposesKind::Global,
        Some(_) => ComposesKind::Imported,
        None => ComposesKind::Local,
    };
    Some(ComposesSpec {
        class_names,
        kind,
        from_source,
    })
}

fn parse_quoted_import_source(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.len() < 2 {
        return None;
    }
    let quote = trimmed.chars().next()?;
    if !matches!(quote, '"' | '\'') || !trimmed.ends_with(quote) {
        return None;
    }
    Some(trimmed[1..trimmed.len() - 1].to_string())
}

fn find_identifier_matches(raw: &str, known_names: &BTreeSet<String>) -> Vec<String> {
    let mut matches = Vec::new();
    let chars: Vec<char> = raw.chars().collect();
    let mut index = 0usize;
    let mut quote: Option<char> = None;
    let mut identifier_start: Option<usize> = None;

    let flush_identifier =
        |end: usize, identifier_start: &mut Option<usize>, matches: &mut Vec<String>| {
            if let Some(start) = *identifier_start {
                let candidate: String = chars[start..end].iter().collect();
                if known_names.contains(&candidate) {
                    matches.push(candidate);
                }
                *identifier_start = None;
            }
        };

    while index < chars.len() {
        let ch = chars[index];
        if let Some(active_quote) = quote {
            if ch == '\\' && index + 1 < chars.len() {
                index += 2;
                continue;
            }
            if ch == active_quote {
                quote = None;
            }
            index += 1;
            continue;
        }

        if ch == '"' || ch == '\'' {
            flush_identifier(index, &mut identifier_start, &mut matches);
            quote = Some(ch);
            index += 1;
            continue;
        }

        if is_value_ident_continue(ch) {
            if identifier_start.is_none() {
                identifier_start = Some(index);
            }
            index += 1;
            continue;
        }

        flush_identifier(index, &mut identifier_start, &mut matches);
        index += 1;
    }

    flush_identifier(chars.len(), &mut identifier_start, &mut matches);
    matches
}

fn is_value_ident_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '$')
}

fn extract_simple_selector_name(prelude: &str) -> Option<String> {
    let trimmed = prelude.trim();
    let rest = trimmed.strip_prefix('.')?;
    if rest.is_empty() {
        return None;
    }
    if rest.contains([' ', ',', ':', '&', '#', '[', '>', '+', '~']) {
        return None;
    }
    Some(rest.to_string())
}

fn resolve_rule_selector_names(
    rule: &RulePayload,
    parent_selector_names: &[String],
) -> Vec<String> {
    let mut names = Vec::new();

    for group in &rule.selector_groups {
        let resolved = extract_group_selector_names(group, parent_selector_names);
        if !resolved.is_empty() {
            names.extend(resolved);
        } else if let Some(local_names) = extract_local_function_selector_names(&group.raw) {
            names.extend(local_names);
        } else if let Some(name) = extract_simple_selector_name(&group.raw) {
            names.push(name);
        }
    }

    names
}

fn extract_group_selector_names(
    group: &SelectorGroup,
    parent_selector_names: &[String],
) -> Vec<String> {
    match group.segments.as_slice() {
        [SelectorSegment::ClassName(name)] => vec![name.clone()],
        [
            SelectorSegment::Ampersand,
            SelectorSegment::BemSuffix(suffix),
        ] => parent_selector_names
            .iter()
            .map(|parent| format!("{parent}{suffix}"))
            .collect(),
        [SelectorSegment::Ampersand, SelectorSegment::ClassName(name)] => vec![name.clone()],
        segments => {
            let last_combinator = segments
                .iter()
                .enumerate()
                .rev()
                .find_map(|(index, segment)| {
                    matches!(segment, SelectorSegment::Combinator(_)).then_some(index)
                });
            let tail = last_combinator
                .map(|index| &segments[index + 1..])
                .unwrap_or(segments);
            let names: Vec<String> = tail
                .iter()
                .filter_map(|segment| match segment {
                    SelectorSegment::ClassName(name) => Some(name.clone()),
                    _ => None,
                })
                .collect();
            if names.is_empty() { Vec::new() } else { names }
        }
    }
}

fn extract_local_function_selector_names(raw: &str) -> Option<Vec<String>> {
    let trimmed = raw.trim();
    let inner = trimmed
        .strip_prefix(":local(")
        .and_then(|rest| rest.strip_suffix(')'))?;
    let mut names = Vec::new();
    let chars: Vec<char> = inner.chars().collect();
    let mut index = 0usize;

    while index < chars.len() {
        if chars[index] == '.' {
            index += 1;
            let start = index;
            while index < chars.len() && is_selector_ident_continue(chars[index]) {
                index += 1;
            }
            if start < index {
                names.push(chars[start..index].iter().collect());
                continue;
            }
        }
        index += 1;
    }

    (!names.is_empty()).then_some(names)
}

fn parse_selector_groups(prelude: &str) -> Vec<SelectorGroup> {
    let mut groups = Vec::new();
    let mut depth_paren = 0usize;
    let mut depth_bracket = 0usize;
    let mut start = 0usize;

    for (index, ch) in prelude.char_indices() {
        match ch {
            '(' => depth_paren += 1,
            ')' => depth_paren = depth_paren.saturating_sub(1),
            '[' => depth_bracket += 1,
            ']' => depth_bracket = depth_bracket.saturating_sub(1),
            ',' if depth_paren == 0 && depth_bracket == 0 => {
                let raw = prelude[start..index].trim();
                if !raw.is_empty() {
                    groups.push(SelectorGroup {
                        raw: raw.to_string(),
                        segments: parse_selector_segments(raw),
                    });
                }
                start = index + ch.len_utf8();
            }
            _ => {}
        }
    }

    let raw = prelude[start..].trim();
    if !raw.is_empty() {
        groups.push(SelectorGroup {
            raw: raw.to_string(),
            segments: parse_selector_segments(raw),
        });
    }

    groups
}

fn parse_selector_segments(raw: &str) -> Vec<SelectorSegment> {
    let chars: Vec<char> = raw.chars().collect();
    let mut index = 0usize;
    let mut segments = Vec::new();

    while index < chars.len() {
        match chars[index] {
            c if c.is_whitespace() => {
                let start = index;
                while index < chars.len() && chars[index].is_whitespace() {
                    index += 1;
                }
                let next = chars.get(index).copied();
                let has_prev = segments.last().is_some();
                let prev_is_combinator =
                    matches!(segments.last(), Some(SelectorSegment::Combinator(_)));
                let next_starts_selector = next.is_some_and(|ch| {
                    matches!(ch, '.' | '&' | ':' | '#' | '*' | '[') || ch.is_ascii_alphabetic()
                });
                if start > 0 && has_prev && !prev_is_combinator && next_starts_selector {
                    segments.push(SelectorSegment::Combinator(" ".to_string()));
                }
            }
            '.' => {
                index += 1;
                let start = index;
                while index < chars.len() && is_selector_ident_continue(chars[index]) {
                    index += 1;
                }
                if start < index {
                    segments.push(SelectorSegment::ClassName(
                        chars[start..index].iter().collect(),
                    ));
                } else {
                    segments.push(SelectorSegment::Other(".".to_string()));
                }
            }
            '&' => {
                segments.push(SelectorSegment::Ampersand);
                index += 1;
                if index + 1 < chars.len()
                    && ((chars[index] == '-' && chars[index + 1] == '-')
                        || (chars[index] == '_' && chars[index + 1] == '_'))
                {
                    let start = index;
                    index += 2;
                    while index < chars.len() && is_selector_ident_continue(chars[index]) {
                        index += 1;
                    }
                    segments.push(SelectorSegment::BemSuffix(
                        chars[start..index].iter().collect(),
                    ));
                }
            }
            ':' => {
                index += 1;
                let start = index;
                while index < chars.len() && is_selector_ident_continue(chars[index]) {
                    index += 1;
                }
                segments.push(SelectorSegment::Pseudo(
                    chars[start..index].iter().collect(),
                ));
                if index < chars.len() && chars[index] == '(' {
                    let mut depth = 1usize;
                    index += 1;
                    while index < chars.len() && depth > 0 {
                        match chars[index] {
                            '(' => depth += 1,
                            ')' => depth = depth.saturating_sub(1),
                            '\'' | '"' => {
                                let quote = chars[index];
                                index += 1;
                                while index < chars.len() {
                                    if chars[index] == '\\' {
                                        index += 2;
                                        continue;
                                    }
                                    if chars[index] == quote {
                                        break;
                                    }
                                    index += 1;
                                }
                            }
                            _ => {}
                        }
                        index += 1;
                    }
                }
            }
            '>' | '+' | '~' => {
                segments.push(SelectorSegment::Combinator(chars[index].to_string()));
                index += 1;
            }
            _ => {
                let start = index;
                index += 1;
                while index < chars.len()
                    && !chars[index].is_whitespace()
                    && !matches!(chars[index], '.' | '&' | ':' | '>' | '+' | '~' | ',')
                {
                    index += 1;
                }
                segments.push(SelectorSegment::Other(chars[start..index].iter().collect()));
            }
        }
    }

    segments
}

fn is_selector_ident_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-') || !ch.is_ascii()
}

fn tokenize(language: StyleLanguage, source: &str) -> (Vec<Token>, Vec<ParseDiagnostic>) {
    let mut tokens = Vec::new();
    let mut diagnostics = Vec::new();
    let bytes = source.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        let start = i;
        let byte = bytes[i];

        if byte.is_ascii_whitespace() {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            tokens.push(Token {
                kind: TokenKind::Whitespace,
                span: TextSpan::new(start, i),
            });
            continue;
        }

        if language.supports_line_comments() && byte == b'/' && bytes.get(i + 1) == Some(&b'/') {
            i += 2;
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            tokens.push(Token {
                kind: TokenKind::LineComment,
                span: TextSpan::new(start, i),
            });
            continue;
        }

        if byte == b'/' && bytes.get(i + 1) == Some(&b'*') {
            i += 2;
            let mut closed = false;
            while i + 1 < bytes.len() {
                if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                    i += 2;
                    closed = true;
                    break;
                }
                i += 1;
            }
            if !closed {
                i = bytes.len();
                diagnostics.push(ParseDiagnostic {
                    message: "unterminated block comment".to_string(),
                    span: TextSpan::new(start, i),
                });
            }
            tokens.push(Token {
                kind: TokenKind::BlockComment,
                span: TextSpan::new(start, i),
            });
            continue;
        }

        if byte == b'"' || byte == b'\'' {
            let quote = byte;
            i += 1;
            let mut closed = false;
            while i < bytes.len() {
                if bytes[i] == b'\\' {
                    i = (i + 2).min(bytes.len());
                    continue;
                }
                if bytes[i] == quote {
                    i += 1;
                    closed = true;
                    break;
                }
                i += 1;
            }
            if !closed {
                diagnostics.push(ParseDiagnostic {
                    message: "unterminated string literal".to_string(),
                    span: TextSpan::new(start, i),
                });
            }
            tokens.push(Token {
                kind: TokenKind::String,
                span: TextSpan::new(start, i),
            });
            continue;
        }

        if byte == b'#' && bytes.get(i + 1) == Some(&b'{') {
            i += 2;
            tokens.push(Token {
                kind: TokenKind::InterpolationStart,
                span: TextSpan::new(start, i),
            });
            continue;
        }

        if is_ident_start(byte) {
            i += 1;
            while i < bytes.len() && is_ident_continue(bytes[i]) {
                i += 1;
            }
            tokens.push(Token {
                kind: TokenKind::Ident,
                span: TextSpan::new(start, i),
            });
            continue;
        }

        if byte.is_ascii_digit() {
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            tokens.push(Token {
                kind: TokenKind::Number,
                span: TextSpan::new(start, i),
            });
            continue;
        }

        let kind = match byte {
            b'.' => TokenKind::Dot,
            b'&' => TokenKind::Ampersand,
            b'#' => TokenKind::Hash,
            b':' => TokenKind::Colon,
            b';' => TokenKind::Semicolon,
            b',' => TokenKind::Comma,
            b'@' => TokenKind::At,
            b'{' => TokenKind::OpenBrace,
            b'}' => TokenKind::CloseBrace,
            b'(' => TokenKind::OpenParen,
            b')' => TokenKind::CloseParen,
            b'[' => TokenKind::OpenBracket,
            b']' => TokenKind::CloseBracket,
            _ => TokenKind::Other,
        };
        i += 1;
        tokens.push(Token {
            kind,
            span: TextSpan::new(start, i),
        });
    }

    (tokens, diagnostics)
}

fn is_ident_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || matches!(byte, b'_' | b'-') || byte >= 0x80
}

fn is_ident_continue(byte: u8) -> bool {
    is_ident_start(byte) || byte.is_ascii_digit()
}

struct Parser<'a> {
    source: &'a str,
    tokens: &'a [Token],
    diagnostics: &'a mut Vec<ParseDiagnostic>,
    cursor: usize,
}

impl<'a> Parser<'a> {
    fn new(
        source: &'a str,
        tokens: &'a [Token],
        diagnostics: &'a mut Vec<ParseDiagnostic>,
    ) -> Self {
        Self {
            source,
            tokens,
            diagnostics,
            cursor: 0,
        }
    }

    fn parse_root(&mut self) -> Vec<SyntaxNode> {
        self.parse_block(false)
    }

    fn parse_block(&mut self, stop_at_close_brace: bool) -> Vec<SyntaxNode> {
        let mut nodes = Vec::new();

        while self.cursor < self.tokens.len() {
            let token = &self.tokens[self.cursor];

            match token.kind {
                TokenKind::Whitespace => {
                    self.cursor += 1;
                }
                TokenKind::LineComment | TokenKind::BlockComment => {
                    nodes.push(SyntaxNode {
                        kind: SyntaxNodeKind::Comment,
                        span: token.span,
                        header_span: None,
                        payload: Some(SyntaxNodePayload::Comment(CommentPayload {
                            text: self.slice(token.span).to_string(),
                        })),
                        children: Vec::new(),
                    });
                    self.cursor += 1;
                }
                TokenKind::CloseBrace if stop_at_close_brace => {
                    self.cursor += 1;
                    return nodes;
                }
                TokenKind::CloseBrace => {
                    self.diagnostics.push(ParseDiagnostic {
                        message: "unexpected closing brace".to_string(),
                        span: token.span,
                    });
                    self.cursor += 1;
                }
                _ => nodes.push(self.parse_statement()),
            }
        }

        if stop_at_close_brace {
            let end = self.tokens.last().map_or(0, |token| token.span.end);
            self.diagnostics.push(ParseDiagnostic {
                message: "unterminated block".to_string(),
                span: TextSpan::new(end, end),
            });
        }

        nodes
    }

    fn parse_statement(&mut self) -> SyntaxNode {
        let start_index = self.cursor;
        let mut index = self.cursor;
        let mut saw_at = self.tokens[index].kind == TokenKind::At;
        let mut saw_colon = false;
        let mut first_colon_index = None;
        let mut paren_depth = 0usize;
        let mut bracket_depth = 0usize;

        while index < self.tokens.len() {
            let token = &self.tokens[index];
            match token.kind {
                TokenKind::OpenParen => paren_depth += 1,
                TokenKind::CloseParen => paren_depth = paren_depth.saturating_sub(1),
                TokenKind::OpenBracket => bracket_depth += 1,
                TokenKind::CloseBracket => bracket_depth = bracket_depth.saturating_sub(1),
                TokenKind::Colon if paren_depth == 0 && bracket_depth == 0 => {
                    saw_colon = true;
                    if first_colon_index.is_none() {
                        first_colon_index = Some(index);
                    }
                }
                TokenKind::At if index == start_index => saw_at = true,
                TokenKind::Semicolon if paren_depth == 0 && bracket_depth == 0 => {
                    let span = TextSpan::new(
                        self.tokens[start_index].span.start,
                        self.tokens[index].span.end,
                    );
                    self.cursor = index + 1;
                    return SyntaxNode {
                        kind: classify_statement_kind(saw_at, saw_colon),
                        span,
                        header_span: Some(TextSpan::new(
                            self.tokens[start_index].span.start,
                            self.tokens[index].span.start,
                        )),
                        payload: self.build_inline_payload(
                            start_index,
                            index,
                            saw_at,
                            first_colon_index,
                        ),
                        children: Vec::new(),
                    };
                }
                TokenKind::OpenBrace if paren_depth == 0 && bracket_depth == 0 => {
                    let header_span = TextSpan::new(
                        self.tokens[start_index].span.start,
                        self.tokens[index].span.start,
                    );
                    self.cursor = index + 1;
                    let children = self.parse_block(true);
                    let end = self
                        .tokens
                        .get(self.cursor.saturating_sub(1))
                        .map_or(self.tokens[index].span.end, |token| token.span.end);
                    return SyntaxNode {
                        kind: if saw_at {
                            SyntaxNodeKind::AtRule
                        } else {
                            SyntaxNodeKind::Rule
                        },
                        span: TextSpan::new(self.tokens[start_index].span.start, end),
                        header_span: Some(header_span),
                        payload: Some(if saw_at {
                            SyntaxNodePayload::AtRule(
                                self.build_at_rule_payload(start_index, index),
                            )
                        } else {
                            let prelude = self.slice_trimmed(header_span).to_string();
                            SyntaxNodePayload::Rule(RulePayload {
                                selector_groups: parse_selector_groups(&prelude),
                                prelude,
                            })
                        }),
                        children,
                    };
                }
                TokenKind::CloseBrace => break,
                _ => {}
            }
            index += 1;
        }

        let end = self
            .tokens
            .get(index.saturating_sub(1))
            .map_or(self.tokens[start_index].span.end, |token| token.span.end);
        self.cursor = index.max(start_index + 1);
        let span = TextSpan::new(self.tokens[start_index].span.start, end);
        SyntaxNode {
            kind: classify_statement_kind(saw_at, saw_colon),
            span,
            header_span: Some(span),
            payload: self.build_inline_payload(start_index, index, saw_at, first_colon_index),
            children: Vec::new(),
        }
    }

    fn build_inline_payload(
        &self,
        start_index: usize,
        end_index: usize,
        saw_at: bool,
        first_colon_index: Option<usize>,
    ) -> Option<SyntaxNodePayload> {
        if saw_at {
            return Some(SyntaxNodePayload::AtRule(
                self.build_at_rule_payload(start_index, end_index),
            ));
        }

        let colon_index = first_colon_index?;
        let property_span = TextSpan::new(
            self.tokens[start_index].span.start,
            self.tokens[colon_index].span.start,
        );
        let value_start = self.tokens[colon_index].span.end;
        let value_end = self
            .tokens
            .get(end_index.saturating_sub(1))
            .map_or(value_start, |token| token.span.end);
        Some(SyntaxNodePayload::Declaration(DeclarationPayload {
            property: self.slice_trimmed(property_span).to_string(),
            value: self
                .slice_trimmed(TextSpan::new(value_start, value_end))
                .to_string(),
        }))
    }

    fn build_at_rule_payload(&self, start_index: usize, end_index: usize) -> AtRulePayload {
        let name = self
            .tokens
            .get(start_index + 1)
            .map(|token| self.slice(token.span))
            .unwrap_or_default()
            .trim()
            .to_string();
        let params_start = self
            .tokens
            .get(start_index + 2)
            .map_or(self.tokens[start_index].span.end, |token| token.span.start);
        let params_end = self
            .tokens
            .get(end_index.saturating_sub(1))
            .map_or(params_start, |token| token.span.end);
        AtRulePayload {
            kind: classify_at_rule_kind(&name),
            name,
            params: self
                .slice_trimmed(TextSpan::new(params_start, params_end))
                .to_string(),
        }
    }

    fn slice(&self, span: TextSpan) -> &'a str {
        &self.source[span.start..span.end]
    }

    fn slice_trimmed(&self, span: TextSpan) -> &'a str {
        self.slice(span).trim()
    }
}

fn classify_statement_kind(saw_at: bool, saw_colon: bool) -> SyntaxNodeKind {
    if saw_at {
        SyntaxNodeKind::AtRule
    } else if saw_colon {
        SyntaxNodeKind::Declaration
    } else {
        SyntaxNodeKind::Unknown
    }
}

fn classify_at_rule_kind(name: &str) -> AtRuleKind {
    match name {
        "media" => AtRuleKind::Media,
        "supports" => AtRuleKind::Supports,
        "layer" => AtRuleKind::Layer,
        "keyframes" | "-webkit-keyframes" => AtRuleKind::Keyframes,
        "value" => AtRuleKind::Value,
        "at-root" => AtRuleKind::AtRoot,
        _ => AtRuleKind::Generic,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AtRuleKind, AtRulePayload, DeclarationPayload, RulePayload, SelectorGroup, SelectorSegment,
        StyleLanguage, SyntaxNodeKind, SyntaxNodePayload, TextSpan, TokenKind, parse_stylesheet,
    };

    fn token_texts<'a>(source: &'a str, sheet: &super::Stylesheet) -> Vec<(TokenKind, &'a str)> {
        sheet
            .tokens
            .iter()
            .map(|token| (token.kind, &source[token.span.start..token.span.end]))
            .collect()
    }

    #[test]
    fn detects_style_language_from_module_path() {
        assert_eq!(
            StyleLanguage::from_module_path("/x/Button.module.css"),
            Some(StyleLanguage::Css)
        );
        assert_eq!(
            StyleLanguage::from_module_path("/x/Button.module.scss"),
            Some(StyleLanguage::Scss)
        );
        assert_eq!(
            StyleLanguage::from_module_path("/x/Button.module.less"),
            Some(StyleLanguage::Less)
        );
        assert_eq!(StyleLanguage::from_module_path("/x/Button.css"), None);
    }

    #[test]
    fn tokenizes_basic_css_rule() {
        let source = ".button { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Css, source);
        let tokens = token_texts(source, &sheet);
        assert!(tokens.contains(&(TokenKind::Dot, ".")));
        assert!(tokens.contains(&(TokenKind::Ident, "button")));
        assert!(tokens.contains(&(TokenKind::OpenBrace, "{")));
        assert!(tokens.contains(&(TokenKind::Semicolon, ";")));
        assert!(sheet.diagnostics.is_empty());
    }

    #[test]
    fn keeps_css_double_slash_as_regular_tokens() {
        let source = ".button { // not-a-comment\n color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Css, source);
        assert!(
            !sheet
                .tokens
                .iter()
                .any(|token| matches!(token.kind, TokenKind::LineComment))
        );
    }

    #[test]
    fn parses_scss_nested_rules_and_comments() {
        let source = ".button {\n  // note\n  &--primary { color: red; }\n}\n";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        assert_eq!(sheet.nodes.len(), 1);
        let root_rule = &sheet.nodes[0];
        assert_eq!(root_rule.kind, SyntaxNodeKind::Rule);
        assert_eq!(
            root_rule.payload,
            Some(SyntaxNodePayload::Rule(RulePayload {
                prelude: ".button".to_string(),
                selector_groups: vec![SelectorGroup {
                    raw: ".button".to_string(),
                    segments: vec![SelectorSegment::ClassName("button".to_string())],
                }],
            }))
        );
        assert_eq!(root_rule.children.len(), 2);
        assert_eq!(root_rule.children[0].kind, SyntaxNodeKind::Comment);
        assert_eq!(
            root_rule.children[0].payload,
            Some(SyntaxNodePayload::Comment(super::CommentPayload {
                text: "// note".to_string(),
            }))
        );
        assert_eq!(root_rule.children[1].kind, SyntaxNodeKind::Rule);
        assert_eq!(
            root_rule.children[1].payload,
            Some(SyntaxNodePayload::Rule(RulePayload {
                prelude: "&--primary".to_string(),
                selector_groups: vec![SelectorGroup {
                    raw: "&--primary".to_string(),
                    segments: vec![
                        SelectorSegment::Ampersand,
                        SelectorSegment::BemSuffix("--primary".to_string()),
                    ],
                }],
            }))
        );
        assert_eq!(
            root_rule.children[1].children[0].payload,
            Some(SyntaxNodePayload::Declaration(DeclarationPayload {
                property: "color".to_string(),
                value: "red".to_string(),
            }))
        );
        assert!(sheet.diagnostics.is_empty());
    }

    #[test]
    fn parses_less_at_rule_like_variable_assignment() {
        let source = "@color: red;\n.button { color: @color; }";
        let sheet = parse_stylesheet(StyleLanguage::Less, source);
        assert_eq!(sheet.nodes[0].kind, SyntaxNodeKind::AtRule);
        assert_eq!(
            sheet.nodes[0].payload,
            Some(SyntaxNodePayload::AtRule(AtRulePayload {
                kind: AtRuleKind::Generic,
                name: "color".to_string(),
                params: ": red".to_string(),
            }))
        );
        assert_eq!(sheet.nodes[1].kind, SyntaxNodeKind::Rule);
    }

    #[test]
    fn parses_at_rule_header_and_params() {
        let source = "@media screen and (min-width: 10px) { .button { color: red; } }";
        let sheet = parse_stylesheet(StyleLanguage::Css, source);
        assert_eq!(
            sheet.nodes[0].payload,
            Some(SyntaxNodePayload::AtRule(AtRulePayload {
                kind: AtRuleKind::Media,
                name: "media".to_string(),
                params: "screen and (min-width: 10px)".to_string(),
            }))
        );
    }

    #[test]
    fn classifies_keyframes_and_value_at_rules() {
        let source = "@value brand: red;\n@keyframes fade { from { opacity: 0; } }\n";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        assert_eq!(
            sheet.nodes[0].payload,
            Some(SyntaxNodePayload::AtRule(AtRulePayload {
                kind: AtRuleKind::Value,
                name: "value".to_string(),
                params: "brand: red".to_string(),
            }))
        );
        assert_eq!(
            sheet.nodes[1].payload,
            Some(SyntaxNodePayload::AtRule(AtRulePayload {
                kind: AtRuleKind::Keyframes,
                name: "keyframes".to_string(),
                params: "fade".to_string(),
            }))
        );
    }

    #[test]
    fn records_unterminated_block_comment_diagnostic() {
        let source = "/* open";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        assert_eq!(sheet.diagnostics.len(), 1);
        assert_eq!(sheet.diagnostics[0].message, "unterminated block comment");
        assert_eq!(sheet.diagnostics[0].span, TextSpan::new(0, source.len()));
    }

    #[test]
    fn records_unterminated_block_diagnostic() {
        let source = ".button { color: red;";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        assert_eq!(sheet.nodes.len(), 1);
        assert_eq!(sheet.nodes[0].kind, SyntaxNodeKind::Rule);
        assert!(
            sheet
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.message == "unterminated block")
        );
    }

    #[test]
    fn splits_grouped_selectors_into_groups_and_segments() {
        let source = ".a, .b { &--c { color: red; } }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        assert_eq!(
            sheet.nodes[0].payload,
            Some(SyntaxNodePayload::Rule(RulePayload {
                prelude: ".a, .b".to_string(),
                selector_groups: vec![
                    SelectorGroup {
                        raw: ".a".to_string(),
                        segments: vec![SelectorSegment::ClassName("a".to_string())],
                    },
                    SelectorGroup {
                        raw: ".b".to_string(),
                        segments: vec![SelectorSegment::ClassName("b".to_string())],
                    },
                ],
            }))
        );
    }

    #[test]
    fn parity_summary_reconstructs_bem_suffix_names() {
        let source = ".card { &__icon { &--small { color: red; } } }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(
            summary.selector_names,
            vec!["card", "card__icon", "card__icon--small"]
        );
    }

    #[test]
    fn parity_summary_expands_grouped_parent_bem_suffixes() {
        let source = ".a, .b { &--c { color: red; } }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["a", "a--c", "b", "b--c"]);
    }

    #[test]
    fn parity_summary_expands_grouped_parent_nested_bem_suffixes() {
        let source = ".a, .b { &__icon { &--small { color: red; } } }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(
            summary.selector_names,
            vec![
                "a",
                "a__icon",
                "a__icon--small",
                "b",
                "b__icon",
                "b__icon--small"
            ]
        );
    }

    #[test]
    fn parity_summary_keeps_ampersand_class_as_standalone_class() {
        let source = ".a, .b { &.active { color: red; } }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["a", "active", "b"]);
    }

    #[test]
    fn parity_summary_keeps_class_from_pseudo_selector() {
        let source = ".btn:hover { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["btn"]);
    }

    #[test]
    fn parity_summary_keeps_multiple_classes_from_compound_selector() {
        let source = ".btn.active { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["active", "btn"]);
    }

    #[test]
    fn parity_summary_prefers_rightmost_class_after_combinator() {
        let source = ".a > .b { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["b"]);
    }

    #[test]
    fn parity_summary_collects_nested_layer_rule_selectors() {
        let source = "@layer ui { .btn:hover { color: red; } }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["btn"]);
    }

    #[test]
    fn parity_summary_prefers_rightmost_class_after_descendant_combinator() {
        let source = ".a .b { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["b"]);
    }

    #[test]
    fn parity_summary_ignores_classes_inside_pseudo_functions() {
        let source = ".btn:is(.active, .primary) { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["btn"]);
    }

    #[test]
    fn parity_summary_ignores_global_function_classes() {
        let source = ":global(.foo) { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert!(summary.selector_names.is_empty());
    }

    #[test]
    fn parity_summary_ignores_not_function_classes() {
        let source = ".btn:not(.disabled) { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["btn"]);
    }

    #[test]
    fn parity_summary_keeps_local_function_class() {
        let source = ":local(.foo) { color: red; }";
        let sheet = parse_stylesheet(StyleLanguage::Scss, source);
        let summary = super::summarize_parity_lite(&sheet);
        assert_eq!(summary.selector_names, vec!["foo"]);
    }
}
