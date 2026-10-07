use super::parse::{err, Result};
use regex::Regex;
use std::{collections::BTreeSet, sync::OnceLock};

pub(super) fn decode(bytes: &[u8], loc: &str) -> Result<String> {
    let encoding = encoding_rs::Encoding::for_bom(bytes)
        .map(|(e, _)| e)
        .or_else(|| {
            if bytes.starts_with(&[0, b'<', 0, b'?']) {
                Some(encoding_rs::UTF_16BE)
            } else if bytes.starts_with(&[b'<', 0, b'?', 0]) {
                Some(encoding_rs::UTF_16LE)
            } else {
                None
            }
        });
    let text = if let Some(encoding) = encoding {
        let (text, _, errors) = encoding.decode(bytes);
        if errors {
            return Err(err(
                "CORRUPT_ARCHIVE",
                &format!("EPUB XML 编码损坏（{loc}）"),
            ));
        }
        text.into_owned()
    } else {
        std::str::from_utf8(bytes)
            .map_err(|_| {
                err(
                    "CORRUPT_ARCHIVE",
                    &format!("EPUB XML 必须是 UTF-8 或 UTF-16（{loc}）"),
                )
            })?
            .to_owned()
    };
    if text.len() > 16 * 1024 * 1024 {
        return Err(err("LIMIT_EXCEEDED", "解码后的 EPUB XML 超过 16 MiB"));
    }
    Ok(with_named_entities(text))
}

// Only predefined HTML names are supplied locally. Existing declarations keep
// their meaning; unknown names and external entities still fail XML parsing.
// Inject declarations rather than rewriting references, preserving CDATA,
// comments, escaped ampersands, and custom internal entities.
fn with_named_entities(text: String) -> String {
    static REFERENCES: OnceLock<Regex> = OnceLock::new();
    static DECLARATIONS: OnceLock<Regex> = OnceLock::new();
    let references = REFERENCES.get_or_init(|| Regex::new(r"&([A-Za-z][A-Za-z0-9]+);").unwrap());
    let declarations =
        DECLARATIONS.get_or_init(|| Regex::new(r"<!ENTITY\s+([A-Za-z][A-Za-z0-9]+)\s").unwrap());
    let Some((root, doctype)) = prolog(&text) else {
        return text;
    };
    let declared: BTreeSet<_> = doctype
        .map(|(start, end, _)| {
            let dtd = without_comments(&text[start..end]);
            declarations
                .captures_iter(&dtd)
                .map(|c| c[1].to_owned())
                .collect()
        })
        .unwrap_or_default();
    let mut names = BTreeSet::new();
    let mut definitions = String::new();
    for capture in references.captures_iter(&text) {
        let name = &capture[1];
        if matches!(name, "amp" | "lt" | "gt" | "quot" | "apos")
            || declared.contains(name)
            || !names.insert(name.to_owned())
        {
            continue;
        }
        if let Some(&(first, second)) =
            markup5ever::data::NAMED_ENTITIES.get(format!("{name};").as_str())
        {
            if first == 0 {
                continue;
            }
            definitions.push_str(&format!("<!ENTITY {name} \"&#{first};"));
            if second != 0 {
                definitions.push_str(&format!("&#{second};"));
            }
            definitions.push_str("\">");
        }
    }
    if definitions.is_empty() {
        return text;
    }
    let (offset, insertion) = if let Some((_, end, subset_end)) = doctype {
        if let Some(offset) = subset_end {
            (offset, definitions)
        } else {
            (end - 1, format!(" [{definitions}]"))
        }
    } else {
        let name = text[root + 1..]
            .split(|c: char| c.is_whitespace() || c == '>' || c == '/')
            .next()
            .unwrap_or("");
        (root, format!("<!DOCTYPE {name} [{definitions}]>"))
    };
    let mut result = text;
    result.insert_str(offset, &insertion);
    result
}

fn without_comments(text: &str) -> std::borrow::Cow<'_, str> {
    static COMMENTS: OnceLock<Regex> = OnceLock::new();
    COMMENTS
        .get_or_init(|| Regex::new(r"(?s)<!--.*?-->").unwrap())
        .replace_all(text, "")
}

// Locate the actual document type in the prolog, skipping comments and PIs.
// Quoted '>' and internal subsets must not terminate it prematurely.
fn prolog(text: &str) -> Option<(usize, Option<(usize, usize, Option<usize>)>)> {
    let mut offset = 0;
    let mut doctype = None;
    while offset < text.len() {
        let rest = &text[offset..];
        offset += rest.len()
            - rest
                .trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
                .len();
        let rest = &text[offset..];
        if rest.starts_with("<!--") {
            offset += rest.find("-->")? + 3;
        } else if rest.starts_with("<?") {
            offset += rest.find("?>")? + 2;
        } else if rest.starts_with("<!DOCTYPE") {
            let start = offset;
            let mut quote = None;
            let mut depth = 0;
            let mut subset_end = None;
            offset += 9;
            loop {
                let byte = *text.as_bytes().get(offset)?;
                if let Some(q) = quote {
                    if byte == q {
                        quote = None;
                    }
                } else if text[offset..].starts_with("<!--") {
                    offset += text[offset..].find("-->")? + 3;
                    continue;
                } else {
                    match byte {
                        b'\'' | b'"' => quote = Some(byte),
                        b'[' => depth += 1,
                        b']' => {
                            depth -= 1;
                            if depth == 0 {
                                subset_end = Some(offset);
                            }
                        }
                        b'>' if depth == 0 => {
                            offset += 1;
                            break;
                        }
                        _ => {}
                    }
                }
                offset += 1;
                // UTF-8 continuation bytes cannot be delimiters.
                while offset < text.len() && !text.is_char_boundary(offset) {
                    offset += 1;
                }
            }
            if doctype.is_some() {
                return None;
            }
            doctype = Some((start, offset, subset_end));
        } else if rest.starts_with('<') {
            return Some((offset, doctype));
        } else {
            return None;
        }
    }
    None
}

pub(super) fn parse<'a>(text: &'a str, loc: &str) -> Result<roxmltree::Document<'a>> {
    check_structure(text, loc)?;
    roxmltree::Document::parse_with_options(
        text,
        roxmltree::ParsingOptions {
            allow_dtd: true,
            nodes_limit: 1_000_000,
            entity_resolver: None,
        },
    )
    .map_err(|e| {
        err(
            "CORRUPT_ARCHIVE",
            &format!("EPUB XML 无法解析（{loc}）：{e}"),
        )
    })
}

fn check_structure(text: &str, loc: &str) -> Result<()> {
    use quick_xml::events::Event;
    static ENTITY_VALUES: OnceLock<Regex> = OnceLock::new();
    let values = ENTITY_VALUES
        .get_or_init(|| Regex::new(r#"(?s)<!ENTITY\s+[^\s]+\s+(?:"([^"]*)"|'([^']*)')"#).unwrap());
    let mut reader = quick_xml::Reader::from_str(text);
    let mut depth = 0usize;
    loop {
        match reader.read_event().map_err(|e| {
            err(
                "CORRUPT_ARCHIVE",
                &format!("EPUB XML 无法解析（{loc}）：{e}"),
            )
        })? {
            Event::Start(_) => {
                depth += 1;
                if depth > 128 {
                    return Err(err(
                        "LIMIT_EXCEEDED",
                        &format!("EPUB XML 嵌套超过 128 层（{loc}）"),
                    ));
                }
            }
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::DocType(dtd) => {
                // roxmltree recursively parses markup in entity replacement
                // values too. Plain text entities remain supported.
                let dtd = without_comments(dtd.as_ref());
                for capture in values.captures_iter(&dtd) {
                    if capture
                        .get(1)
                        .or_else(|| capture.get(2))
                        .is_some_and(|v| v.as_str().contains('<'))
                    {
                        return Err(err(
                            "UNSUPPORTED_EPUB",
                            &format!("EPUB 自定义实体包含 XML 标记（{loc}）"),
                        ));
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn text(xml: &str) -> String {
        let decoded = decode(xml.as_bytes(), "test.xhtml").unwrap();
        parse(&decoded, "test.xhtml")
            .unwrap()
            .descendants()
            .filter(|n| n.is_text())
            .filter_map(|n| n.text())
            .collect()
    }
    #[test]
    fn local_entities_preserve_custom_declarations_and_literal_text() {
        assert_eq!(
            text(
                r#"<!DOCTYPE html [<!-- <!ENTITY nbsp "custom"> <!ENTITY markup "<div/>"> -->]><html>&nbsp; &copy;</html>"#
            ),
            "\u{a0} ©"
        );
        assert_eq!(
            text(
                r#"<!DOCTYPE html [<!ENTITY nbsp "custom">]><html>&nbsp; &copy; &NotEqualTilde;</html>"#
            ),
            "custom © ≂\u{338}"
        );
        assert_eq!(
            text(
                r#"<?xml version="1.0"?><!-- <!DOCTYPE fake> &nbsp; --><html><![CDATA[&nbsp;]]>&amp;copy; &copy;</html>"#
            ),
            "&nbsp;&copy; ©"
        );
        assert_eq!(
            text(
                r#"<!DOCTYPE html PUBLIC "ID > quoted" "https://example.com/unused"><html>&copy;</html>"#
            ),
            "©"
        );
        assert_eq!(
            text(
                r#"<!DOCTYPE html [<!-- > quoted --><!ENTITY label "中文 >">]><html>&label; &nbsp;</html>"#
            ),
            "中文 > \u{a0}"
        );
    }
    #[test]
    fn malformed_encoding_and_unknown_or_external_entities_are_rejected() {
        for bytes in [
            &[0xff, 0xfe, 0x3c][..],
            &[0xff][..],
            &[0xef, 0xbb, 0xbf, 0xff][..],
        ] {
            assert!(decode(bytes, "bad.xhtml").is_err());
        }
        for xml in [
            r#"<html>&NotAnEntity;</html>"#,
            r#"<!DOCTYPE html [<!ENTITY nbsp SYSTEM "file:///C:/private.txt">]><html>&nbsp;</html>"#,
            r#"<!DOCTYPE html [<!ENTITY secret SYSTEM "https://example.com/private">]><html>&secret; &copy;</html>"#,
            r#"<!DOCTYPE html [<!ENTITY loop "&loop;">]><html>&loop;</html>"#,
            r#"<!DOCTYPE html [<!ENTITY markup "<div>text</div>">]><html>&markup;</html>"#,
        ] {
            let decoded = decode(xml.as_bytes(), "bad.xhtml").unwrap();
            assert!(parse(&decoded, "bad.xhtml").is_err());
        }
    }
}
