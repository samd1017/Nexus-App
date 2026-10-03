//! One page of Markdown task lines from indexed note bodies.
//! The page is a rowid window so a large vault does not scan every body in one call.
//! Each hit carries the raw line; the renderer reads tokens with the same grammar it
//! uses for loaded notes, so the two paths cannot disagree.

use rusqlite::{params, Connection};

pub const TASK_PAGE_DEFAULT: i64 = 400;
const PER_NOTE_CAP: usize = 2000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScannedTask {
    pub note_id: String,
    pub path: String,
    pub title: String,
    pub line: i32,
    /// The whole line as stored.
    pub raw: String,
    /// The checkbox symbol: ' ', 'x', '/', '-', or another single character.
    pub symbol: String,
    /// Description with the 📅 token removed (open tasks only had this before).
    pub text: String,
    /// The line's 📅 date, else the note `due:`.
    pub due: Option<String>,
    /// The note `due:` alone.
    pub note_due: Option<String>,
    /// Text of the nearest heading above the task.
    pub heading: Option<String>,
}

#[derive(Clone, Debug)]
pub struct TaskScanPage {
    pub tasks: Vec<ScannedTask>,
    pub next_rowid: i64,
    pub scanned: i64,
    pub done: bool,
}

pub fn scan_task_page(
    conn: &Connection,
    after_rowid: i64,
    note_budget: i64,
) -> Result<TaskScanPage, String> {
    let budget = note_budget.clamp(8, 2000);
    let mut stmt = conn
        .prepare(
            "SELECT rowid, note_id, COALESCE(title, ''), COALESCE(path, ''), COALESCE(body, '')
             FROM note_fts
             WHERE rowid > ?1
             ORDER BY rowid
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![after_rowid, budget], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut tasks = Vec::new();
    let mut scanned = 0i64;
    let mut next = after_rowid;
    for row in rows {
        let (rowid, note_id, title, path, body) = row.map_err(|e| e.to_string())?;
        scanned += 1;
        next = rowid;
        if body.contains('[') {
            push_tasks(&mut tasks, &note_id, &path, &title, &body);
        }
    }
    Ok(TaskScanPage {
        tasks,
        next_rowid: next,
        scanned,
        done: scanned < budget,
    })
}

fn push_tasks(out: &mut Vec<ScannedTask>, note_id: &str, path: &str, title: &str, body: &str) {
    let note_due = due_from_frontmatter(body);
    let mut heading: Option<String> = None;
    let mut n = 0usize;
    let mut fence: Option<char> = None;
    let mut in_yaml = body.trim_start_matches('\u{feff}').starts_with("---\n") || body.trim_start_matches('\u{feff}').starts_with("---\r\n");
    for (i, line) in body.lines().enumerate() {
        if in_yaml {
            if i > 0 && (line.trim() == "---" || line.trim() == "...") {
                in_yaml = false;
            }
            continue;
        }
        let bare = line.trim_start().trim_start_matches(|c: char| c == '>' || c == ' ' || c == '\t');
        if bare.starts_with("```") || bare.starts_with("~~~") {
            let mark = bare.chars().next().unwrap_or('`');
            fence = match fence {
                Some(open) if open == mark => None,
                Some(open) => Some(open),
                None => Some(mark),
            };
            continue;
        }
        if fence.is_some() {
            continue;
        }
        if let Some(found) = heading_text(line) {
            heading = Some(found);
            continue;
        }
        let Some((symbol, text)) = task_parts(line) else { continue };
        out.push(ScannedTask {
            note_id: note_id.to_string(),
            path: path.to_string(),
            title: if title.is_empty() { path.to_string() } else { title.to_string() },
            line: (i as i32) + 1,
            raw: line.to_string(),
            symbol: symbol.to_string(),
            due: due_on_line(text).or_else(|| note_due.clone()),
            text: display_text(text),
            note_due: note_due.clone(),
            heading: heading.clone(),
        });
        n += 1;
        if n >= PER_NOTE_CAP {
            break;
        }
    }
}

/// `## Title ##` → `Title`: up to three spaces, one to six `#`, then a space.
fn heading_text(line: &str) -> Option<String> {
    let lead = line.len() - line.trim_start_matches(' ').len();
    if lead > 3 {
        return None;
    }
    let rest = &line[lead..];
    let hashes = rest.chars().take_while(|c| *c == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    let after = &rest[hashes..];
    if !after.starts_with([' ', '\t']) {
        return None;
    }
    let mut text = after.trim();
    let closing = text.trim_end_matches('#');
    if closing.len() < text.len() && (closing.is_empty() || closing.ends_with([' ', '\t'])) {
        text = closing.trim_end();
    }
    Some(text.to_string())
}

/// `- [ ] text`, `* [x] text`, `+ [/] text`, `1. [-] text`, `> - [ ] text`: the symbol and the text.
fn task_parts(line: &str) -> Option<(char, &str)> {
    let mut rest = line.trim_start_matches([' ', '\t']);
    while let Some(after) = rest.strip_prefix('>') {
        rest = after.trim_start_matches([' ', '\t']);
    }
    let after_marker = if let Some(r) = rest.strip_prefix(['-', '*', '+']) {
        r
    } else {
        let digits = rest.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits == 0 || digits > 9 {
            return None;
        }
        rest[digits..].strip_prefix(['.', ')'])?
    };
    if !after_marker.starts_with([' ', '\t']) {
        return None;
    }
    let boxed = after_marker.trim_start_matches([' ', '\t']).strip_prefix('[')?;
    let mut chars = boxed.chars();
    let symbol = chars.next()?;
    if symbol == ']' || symbol == '\n' {
        return None;
    }
    let after_box = chars.as_str().strip_prefix(']')?;
    if !after_box.starts_with([' ', '\t']) {
        return None;
    }
    let text = after_box.trim();
    if text.is_empty() {
        None
    } else {
        Some((symbol, text))
    }
}

/// Leading `---` block only. Nested and list YAML are ignored.
fn due_from_frontmatter(body: &str) -> Option<String> {
    let body = body.strip_prefix('\u{feff}').unwrap_or(body);
    let yaml = if let Some(rest) = body.strip_prefix("---\r\n") {
        rest.split_once("\r\n---")?.0
    } else if let Some(rest) = body.strip_prefix("---\n") {
        rest.split_once("\n---")?.0
    } else {
        return None;
    };
    let mut due = None;
    for line in yaml.lines() {
        if line.is_empty() || line.starts_with('#') || line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else { continue };
        if !key.trim().eq_ignore_ascii_case("due") {
            continue;
        }
        due = normalize_due_value(value.trim());
    }
    due
}

fn normalize_due_value(value: &str) -> Option<String> {
    let v = if (value.starts_with('"') && value.ends_with('"') && value.len() >= 2)
        || (value.starts_with('\'') && value.ends_with('\'') && value.len() >= 2)
    {
        value[1..value.len() - 1].trim()
    } else {
        value
    };
    if is_ymd(v) {
        Some(v.to_string())
    } else {
        None
    }
}

fn is_ymd(v: &str) -> bool {
    v.len() == 10
        && v.as_bytes()[4] == b'-'
        && v.as_bytes()[7] == b'-'
        && v.chars().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn due_on_line(text: &str) -> Option<String> {
    let idx = text.find('📅')?;
    let after = text[idx + '📅'.len_utf8()..].trim();
    let date: String = after.chars().take(10).collect();
    if is_ymd(&date) {
        Some(date)
    } else {
        None
    }
}

fn display_text(text: &str) -> String {
    let Some(idx) = text.find('📅') else {
        return text.split_whitespace().collect::<Vec<_>>().join(" ");
    };
    let before = text[..idx].trim();
    let mut after = text[idx + '📅'.len_utf8()..].trim();
    if after.len() >= 10 && after.is_char_boundary(10) {
        after = after[10..].trim();
    }
    let joined = if before.is_empty() {
        after.to_string()
    } else if after.is_empty() {
        before.to_string()
    } else {
        format!("{before} {after}")
    };
    joined.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn page_reads_open_tasks_and_stops() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE note_fts USING fts5(note_id UNINDEXED, title, path, body);
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n1', 'Day', 'Day.md', '- [ ] Buy milk 📅 2026-04-01\n- [x] Done\n* [ ] Call home');
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n2', 'Later', 'Later.md', 'no tasks here');
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n3', 'More', 'More.md', '- [ ] Third');",
        )
        .unwrap();
        let page = scan_task_page(&conn, 0, 8).unwrap();
        assert_eq!(page.scanned, 3);
        assert!(page.done);
        assert_eq!(page.tasks.len(), 4);
        assert_eq!(page.tasks[0].text, "Buy milk");
        assert_eq!(page.tasks[0].due.as_deref(), Some("2026-04-01"));
        assert_eq!(page.tasks[0].raw, "- [ ] Buy milk 📅 2026-04-01");
        assert_eq!(page.tasks[1].symbol, "x");
        assert_eq!(page.tasks[1].line, 2);
        assert_eq!(page.tasks[2].text, "Call home");
        assert_eq!(page.tasks[3].text, "Third");
        let tail = scan_task_page(&conn, page.next_rowid, 8).unwrap();
        assert!(tail.done);
        assert!(tail.tasks.is_empty());
    }

    #[test]
    fn yaml_due_fills_open_tasks_without_emoji() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE note_fts USING fts5(note_id UNINDEXED, title, path, body);
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n1', 'Draft', 'Draft.md', '---\ndue: 2026-10-15\n---\n\n- [ ] Inherit\n- [ ] Line wins 📅 2026-10-05\n- [x] Done');
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n2', 'Plain', 'Plain.md', '- [ ] No due');
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n3', 'Quoted', 'Quoted.md', '---\ndue: \"2026-11-01\"\n---\n* [ ] Quoted');",
        )
        .unwrap();
        let page = scan_task_page(&conn, 0, 8).unwrap();
        assert_eq!(page.tasks.len(), 5);
        assert_eq!(page.tasks[0].text, "Inherit");
        assert_eq!(page.tasks[0].due.as_deref(), Some("2026-10-15"));
        assert_eq!(page.tasks[0].note_due.as_deref(), Some("2026-10-15"));
        assert_eq!(page.tasks[1].text, "Line wins");
        assert_eq!(page.tasks[1].due.as_deref(), Some("2026-10-05"));
        assert_eq!(page.tasks[2].symbol, "x");
        assert_eq!(page.tasks[3].text, "No due");
        assert_eq!(page.tasks[3].due, None);
        assert_eq!(page.tasks[4].text, "Quoted");
        assert_eq!(page.tasks[4].due.as_deref(), Some("2026-11-01"));
    }

    #[test]
    fn every_marker_and_status_but_not_code_or_yaml() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE note_fts USING fts5(note_id UNINDEXED, title, path, body);
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n1', 'Mix', 'Mix.md', '---\ntitle: - [ ] not a task\n---\n+ [/] Doing\n1. [-] Dropped\n> - [ ] Quoted\n  - [ ] Nested\n```\n- [ ] In code\n```\n- [ ]\n- [ ]no space\n-[ ] no gap\n- [ ] After fence');",
        )
        .unwrap();
        let page = scan_task_page(&conn, 0, 8).unwrap();
        let texts: Vec<&str> = page.tasks.iter().map(|t| t.text.as_str()).collect();
        assert_eq!(texts, vec!["Doing", "Dropped", "Quoted", "Nested", "After fence"]);
        assert_eq!(page.tasks[0].symbol, "/");
        assert_eq!(page.tasks[1].symbol, "-");
        assert_eq!(page.tasks[1].line, 5);
        assert_eq!(page.tasks[2].raw, "> - [ ] Quoted");
        assert_eq!(page.tasks[4].line, 14);
    }

    #[test]
    fn each_task_carries_the_heading_above_it() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE note_fts USING fts5(note_id UNINDEXED, title, path, body);
             INSERT INTO note_fts(note_id, title, path, body) VALUES
               ('n1', 'H', 'H.md', '- [ ] Before\n# Week ##\n- [ ] One\n#tag line\n```\n## Not a heading\n```\n- [ ] Two\n  ## Errands\n- [ ] Three');",
        )
        .unwrap();
        let page = scan_task_page(&conn, 0, 8).unwrap();
        let headings: Vec<Option<&str>> = page.tasks.iter().map(|t| t.heading.as_deref()).collect();
        assert_eq!(headings, vec![None, Some("Week"), Some("Week"), Some("Errands")]);
    }
}
