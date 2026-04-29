use engine_style_parser::{ParserBoundarySyntaxFactsV0, StyleSemanticFactsV0};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignTokenSemanticSummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub status: &'static str,
    pub resolution_scope: &'static str,
    pub declaration_count: usize,
    pub reference_count: usize,
    pub resolved_reference_count: usize,
    pub unresolved_reference_count: usize,
    pub selectors_with_references_count: usize,
    pub context_signal: DesignTokenContextSignalV0,
    pub resolution_signal: DesignTokenResolutionSignalV0,
    pub capabilities: DesignTokenSemanticCapabilitiesV0,
    pub blocking_gaps: Vec<&'static str>,
    pub next_priorities: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignTokenContextSignalV0 {
    pub declaration_context_selector_count: usize,
    pub declaration_wrapper_context_count: usize,
    pub media_context_selector_count: usize,
    pub supports_context_selector_count: usize,
    pub layer_context_selector_count: usize,
    pub wrapper_context_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignTokenResolutionSignalV0 {
    pub declaration_fact_count: usize,
    pub reference_fact_count: usize,
    pub occurrence_resolved_reference_count: usize,
    pub occurrence_unresolved_reference_count: usize,
    pub context_matched_reference_count: usize,
    pub context_unmatched_reference_count: usize,
    pub root_declaration_count: usize,
    pub selector_scoped_declaration_count: usize,
    pub wrapper_scoped_declaration_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesignTokenSemanticCapabilitiesV0 {
    pub same_file_resolution_ready: bool,
    pub wrapper_context_signal_ready: bool,
    pub occurrence_resolution_signal_ready: bool,
    pub selector_context_resolution_ready: bool,
    pub theme_override_context_signal_ready: bool,
    pub cross_file_import_graph_ready: bool,
    pub cross_package_cascade_ranking_ready: bool,
    pub theme_override_context_ready: bool,
}

pub fn summarize_design_token_semantics(
    parser_facts: &ParserBoundarySyntaxFactsV0,
    semantic_facts: &StyleSemanticFactsV0,
) -> DesignTokenSemanticSummaryV0 {
    let media_context_selector_count = parser_facts
        .custom_properties
        .selectors_with_refs_under_media_names
        .len();
    let supports_context_selector_count = parser_facts
        .custom_properties
        .selectors_with_refs_under_supports_names
        .len();
    let layer_context_selector_count = parser_facts
        .custom_properties
        .selectors_with_refs_under_layer_names
        .len();
    let declaration_wrapper_context_count =
        parser_facts.custom_properties.decl_names_under_media.len()
            + parser_facts
                .custom_properties
                .decl_names_under_supports
                .len()
            + parser_facts.custom_properties.decl_names_under_layer.len();
    let wrapper_context_count = media_context_selector_count
        + supports_context_selector_count
        + layer_context_selector_count;
    let declaration_context_selector_count =
        parser_facts.custom_properties.decl_context_selectors.len();
    let reference_count = semantic_facts.custom_properties.ref_names.len();
    let declaration_count = semantic_facts.custom_properties.decl_names.len();
    let resolution_signal = summarize_design_token_resolution_signal(parser_facts);

    let status = if reference_count == 0 && declaration_count == 0 {
        "empty"
    } else if resolution_signal.occurrence_resolution_ready() {
        "context-aware-resolution-seed"
    } else if wrapper_context_count > 0 {
        "context-aware-seed"
    } else {
        "same-file-seed"
    };

    let mut blocking_gaps = Vec::new();
    if reference_count > 0 || declaration_count > 0 {
        blocking_gaps.push("crossFileImportGraph");
        blocking_gaps.push("crossPackageCascadeRanking");
        blocking_gaps.push("themeOverrideContext");
    }
    if !semantic_facts
        .custom_properties
        .unresolved_ref_names
        .is_empty()
    {
        blocking_gaps.push("unresolvedDesignTokenRefs");
    }

    let next_priorities = if reference_count == 0 && declaration_count == 0 {
        vec!["designTokenSeed"]
    } else {
        vec![
            "crossFileImportGraph",
            "crossPackageCascadeRanking",
            "themeOverrideContext",
        ]
    };

    DesignTokenSemanticSummaryV0 {
        schema_version: "0",
        product: "omena-semantic.design-token-semantics",
        status,
        resolution_scope: "same-file",
        declaration_count,
        reference_count,
        resolved_reference_count: semantic_facts.custom_properties.resolved_ref_names.len(),
        unresolved_reference_count: semantic_facts.custom_properties.unresolved_ref_names.len(),
        selectors_with_references_count: semantic_facts
            .custom_properties
            .selectors_with_refs_names
            .len(),
        context_signal: DesignTokenContextSignalV0 {
            declaration_context_selector_count,
            declaration_wrapper_context_count,
            media_context_selector_count,
            supports_context_selector_count,
            layer_context_selector_count,
            wrapper_context_count,
        },
        resolution_signal: resolution_signal.clone(),
        capabilities: DesignTokenSemanticCapabilitiesV0 {
            same_file_resolution_ready: declaration_count > 0 || reference_count > 0,
            wrapper_context_signal_ready: wrapper_context_count > 0,
            occurrence_resolution_signal_ready: resolution_signal.occurrence_resolution_ready(),
            selector_context_resolution_ready: resolution_signal
                .selector_context_resolution_ready(),
            theme_override_context_signal_ready: declaration_context_selector_count > 0
                || declaration_wrapper_context_count > 0,
            cross_file_import_graph_ready: false,
            cross_package_cascade_ranking_ready: false,
            theme_override_context_ready: false,
        },
        blocking_gaps,
        next_priorities,
    }
}

fn summarize_design_token_resolution_signal(
    parser_facts: &ParserBoundarySyntaxFactsV0,
) -> DesignTokenResolutionSignalV0 {
    let custom_properties = &parser_facts.custom_properties;
    let mut occurrence_resolved_reference_count = 0;
    let mut occurrence_unresolved_reference_count = 0;

    for reference in &custom_properties.ref_facts {
        if custom_properties
            .decl_facts
            .iter()
            .any(|declaration| custom_property_context_matches(declaration, reference))
        {
            occurrence_resolved_reference_count += 1;
        } else {
            occurrence_unresolved_reference_count += 1;
        }
    }

    DesignTokenResolutionSignalV0 {
        declaration_fact_count: custom_properties.decl_facts.len(),
        reference_fact_count: custom_properties.ref_facts.len(),
        occurrence_resolved_reference_count,
        occurrence_unresolved_reference_count,
        context_matched_reference_count: occurrence_resolved_reference_count,
        context_unmatched_reference_count: occurrence_unresolved_reference_count,
        root_declaration_count: custom_properties
            .decl_facts
            .iter()
            .filter(|declaration| {
                declaration
                    .selector_contexts
                    .iter()
                    .any(|selector| selector == ":root")
            })
            .count(),
        selector_scoped_declaration_count: custom_properties
            .decl_facts
            .iter()
            .filter(|declaration| {
                declaration
                    .selector_contexts
                    .iter()
                    .any(|selector| selector != ":root")
            })
            .count(),
        wrapper_scoped_declaration_count: custom_properties
            .decl_facts
            .iter()
            .filter(|declaration| {
                declaration.under_media || declaration.under_supports || declaration.under_layer
            })
            .count(),
    }
}

impl DesignTokenResolutionSignalV0 {
    fn occurrence_resolution_ready(&self) -> bool {
        self.declaration_fact_count > 0 || self.reference_fact_count > 0
    }

    fn selector_context_resolution_ready(&self) -> bool {
        self.occurrence_resolution_ready()
            && (self.root_declaration_count > 0 || self.selector_scoped_declaration_count > 0)
    }
}

fn custom_property_context_matches(
    declaration: &engine_style_parser::ParserIndexCustomPropertyDeclFactV0,
    reference: &engine_style_parser::ParserIndexCustomPropertyRefFactV0,
) -> bool {
    if declaration.name != reference.name {
        return false;
    }
    if declaration.under_media && !reference.under_media {
        return false;
    }
    if declaration.under_supports && !reference.under_supports {
        return false;
    }
    if declaration.under_layer && !reference.under_layer {
        return false;
    }
    if declaration.selector_contexts.is_empty() {
        return true;
    }
    declaration
        .selector_contexts
        .iter()
        .any(|selector| custom_property_selector_context_matches(selector, reference))
}

fn custom_property_selector_context_matches(
    declaration_selector: &str,
    reference: &engine_style_parser::ParserIndexCustomPropertyRefFactV0,
) -> bool {
    declaration_selector == ":root"
        || reference
            .selector_contexts
            .iter()
            .any(|reference_selector| {
                reference_selector == declaration_selector
                    || reference_selector.contains(declaration_selector)
            })
}
