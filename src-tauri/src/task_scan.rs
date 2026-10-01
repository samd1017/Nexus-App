//! One page of incomplete Markdown tasks from indexed note bodies.
//! The page is a rowid window so a large vault does not scan every body in one call.

use rusqlite::{params, Connection};

pub const TASK_PAGE_DEFAULT: i64 = 48;
const PER_NOTE_CAP: usize = 40;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScannedTask {
    pub note_id: String,
    pub path: String,
    pub title: String,
    pub line: i32,
    pub text: String,
    pub due: Option<String>,
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
    let budget = note_budget.clamp(8, 80);
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
        push_tasks(&mut tasks, &note_id, &path, &title, &body);
    }
    Ok(TaskScanPage {
        tasks,
        next_rowid: next,
        scanned,
        done: scanned < budget,
    })
}

fn push_tasks(out: &mut Vec<ScannedTask>, note_id: &str, path: &str, title: &str, body: &str) {
    let mut n = 0usize;
    for (i, line) in body.lines().enumerate() {
        let Some(text) = open_task_text(line) else { continue };
        if text.is_empty() {
            continue;
        }
        out.push(ScannedTask {
            note_id: note_id.to_string(),
            path: path.to_string(),
            title: if title.is_empty() { path.to_string() } else { title.to_string() },
            line: (i as i32) + 1,
            due: due_on_line(&text),
            text: display_text(&text),
        });
        n += 1;
        if n >= PER_NOTE_CAP {
            break;
        }
    }
}

fn open_task_text(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let rest = trimmed
        .strip_prefix("- [ ]")
        .or_else(|| trimmed.strip_prefix("* [ ]"))?;
    let text = rest.trim();
    if text.is_empty() { None } else { Some(text.to_string()) }
}

fn due_on_line(text: &str) -> Option<String> {
    let idx = text.find('📅')?;
    let after = text[idx + '📅'.len_utf8()..].trim();
    let date: String = after.chars().take(10).collect();
    if date.len() == 10 && date.as_bytes()[4] == b'-' && date.as_bytes()[7] == b'-' && date.chars().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
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
    if after.len() >= 10 {
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
        assert_eq!(page.tasks.len(), 3);
        assert_eq!(page.tasks[0].text, "Buy milk");
        assert_eq!(page.tasks[0].due.as_deref(), Some("2026-04-01"));
        assert_eq!(page.tasks[1].text, "Call home");
        assert_eq!(page.tasks[2].text, "Third");
        let tail = scan_task_page(&conn, page.next_rowid, 8).unwrap();
        assert!(tail.done);
        assert!(tail.tasks.is_empty());
    }
}
