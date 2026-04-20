use serde::Serialize;

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
    let mut selector_names = Vec::new();
    let mut keyframes_names = Vec::new();
    let mut value_decl_names = Vec::new();
    collect_parity_names(
        &sheet.nodes,
        &mut selector_names,
        &mut keyframes_names,
        &mut value_decl_names,
    );
    selector_names.sort();
    selector_names.dedup();
    keyframes_names.sort();
    keyframes_names.dedup();
    value_decl_names.sort();
    value_decl_names.dedup();

    ParserParityLiteSummaryV0 {
        schema_version: "0",
        language: match sheet.language {
            StyleLanguage::Css => "css",
            StyleLanguage::Scss => "scss",
            StyleLanguage::Less => "less",
        },
        selector_names,
        keyframes_names,
        value_decl_names,
        diagnostic_count: sheet.diagnostics.len(),
    }
}

fn collect_parity_names(
    nodes: &[SyntaxNode],
    selector_names: &mut Vec<String>,
    keyframes_names: &mut Vec<String>,
    value_decl_names: &mut Vec<String>,
) {
    for node in nodes {
        match &node.payload {
            Some(SyntaxNodePayload::Rule(rule)) => {
                if let Some(name) = extract_simple_selector_name(&rule.prelude) {
                    selector_names.push(name);
                }
            }
            Some(SyntaxNodePayload::AtRule(at_rule)) => match at_rule.kind {
                AtRuleKind::Keyframes => {
                    if !at_rule.params.is_empty() {
                        keyframes_names.push(at_rule.params.clone());
                    }
                }
                AtRuleKind::Value => {
                    if let Some((name, _)) = at_rule.params.split_once(':') {
                        let trimmed = name.trim();
                        if !trimmed.is_empty() {
                            value_decl_names.push(trimmed.to_string());
                        }
                    }
                }
                _ => {}
            },
            _ => {}
        }
        collect_parity_names(
            &node.children,
            selector_names,
            keyframes_names,
            value_decl_names,
        );
    }
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
                            SyntaxNodePayload::Rule(RulePayload {
                                prelude: self.slice_trimmed(header_span).to_string(),
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
        AtRuleKind, AtRulePayload, DeclarationPayload, RulePayload, StyleLanguage, SyntaxNodeKind,
        SyntaxNodePayload, TextSpan, TokenKind, parse_stylesheet,
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
}
