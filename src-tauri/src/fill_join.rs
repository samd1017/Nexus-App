//! Single-flight fill per vault DB. A second caller joins the in-flight job
//! instead of opening another writer (that raced to `database is locked` and
//! a malloc crash on 100k Linux Tauri).

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, OnceLock};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JoinedFill {
    pub indexed: i64,
    pub skipped: i64,
    pub errors: i64,
    pub notes: i64,
    pub edges: i64,
}

struct FillSlot {
    value: Mutex<Option<Result<JoinedFill, String>>>,
    cv: Condvar,
}

fn registry() -> &'static Mutex<HashMap<String, Arc<FillSlot>>> {
    static REG: OnceLock<Mutex<HashMap<String, Arc<FillSlot>>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn fill_is_inflight(key: &str) -> bool {
    registry()
        .lock()
        .map(|g| g.contains_key(key))
        .unwrap_or(false)
}

pub enum FillRole {
    Leader(FillLeader),
    Joiner(FillJoiner),
}

pub struct FillLeader {
    key: String,
    slot: Arc<FillSlot>,
    finished: bool,
}

pub struct FillJoiner {
    slot: Arc<FillSlot>,
}

/// Register as the unique fill for `key`, or join the one already running.
pub fn start_or_join(key: &str) -> FillRole {
    let mut map = match registry().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if let Some(slot) = map.get(key) {
        return FillRole::Joiner(FillJoiner {
            slot: slot.clone(),
        });
    }
    let slot = Arc::new(FillSlot {
        value: Mutex::new(None),
        cv: Condvar::new(),
    });
    map.insert(key.to_string(), slot.clone());
    FillRole::Leader(FillLeader {
        key: key.to_string(),
        slot,
        finished: false,
    })
}

fn publish(slot: &FillSlot, result: Result<JoinedFill, String>) {
    let mut g = match slot.value.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if g.is_none() {
        *g = Some(result);
    }
    slot.cv.notify_all();
}

impl FillLeader {
    pub fn finish(mut self, result: Result<JoinedFill, String>) -> Result<JoinedFill, String> {
        self.finished = true;
        publish(&self.slot, result.clone());
        if let Ok(mut map) = registry().lock() {
            map.remove(&self.key);
        }
        result
    }
}

impl Drop for FillLeader {
    fn drop(&mut self) {
        if self.finished {
            return;
        }
        publish(
            &self.slot,
            Err("index fill leader dropped before finish".into()),
        );
        if let Ok(mut map) = registry().lock() {
            map.remove(&self.key);
        }
    }
}

impl FillJoiner {
    pub fn wait(self) -> Result<JoinedFill, String> {
        let mut g = match self.slot.value.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        while g.is_none() {
            g = match self.slot.cv.wait(g) {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
        }
        g.clone().unwrap_or_else(|| Err("index fill join lost result".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    fn sample(n: i64) -> JoinedFill {
        JoinedFill {
            indexed: n,
            skipped: 0,
            errors: 0,
            notes: n,
            edges: n * 2,
        }
    }

    #[test]
    fn second_fill_joins_inflight_and_sees_same_result() {
        let key = format!("join-{}-{}", std::process::id(), "a");
        let ready = Arc::new((Mutex::new(false), Condvar::new()));

        let leader = {
            let key = key.clone();
            let ready = ready.clone();
            thread::spawn(move || match start_or_join(&key) {
                FillRole::Leader(lead) => {
                    *ready.0.lock().unwrap() = true;
                    ready.1.notify_all();
                    thread::sleep(Duration::from_millis(40));
                    lead.finish(Ok(sample(11)))
                }
                FillRole::Joiner(_) => panic!("first caller must lead"),
            })
        };

        {
            let mut g = ready.0.lock().unwrap();
            while !*g {
                g = ready.1.wait(g).unwrap();
            }
        }

        let joiner = {
            let key = key.clone();
            thread::spawn(move || match start_or_join(&key) {
                FillRole::Leader(_) => panic!("second caller must join"),
                FillRole::Joiner(j) => j.wait(),
            })
        };

        let a = leader.join().unwrap().expect("leader ok");
        let b = joiner.join().unwrap().expect("joiner ok");
        assert_eq!(a, sample(11));
        assert_eq!(b, sample(11));
        assert!(!fill_is_inflight(&key), "slot must clear after finish");

        match start_or_join(&key) {
            FillRole::Leader(lead) => {
                lead.finish(Ok(sample(1))).ok();
            }
            FillRole::Joiner(_) => panic!("finished key must accept a new leader"),
        }
    }

    #[test]
    fn joiner_sees_leader_error() {
        let key = format!("join-{}-{}", std::process::id(), "err");
        let ready = Arc::new((Mutex::new(false), Condvar::new()));
        let leader = {
            let key = key.clone();
            let ready = ready.clone();
            thread::spawn(move || match start_or_join(&key) {
                FillRole::Leader(lead) => {
                    *ready.0.lock().unwrap() = true;
                    ready.1.notify_all();
                    thread::sleep(Duration::from_millis(40));
                    lead.finish(Err("boom".into()))
                }
                FillRole::Joiner(_) => panic!("expected leader"),
            })
        };
        {
            let mut g = ready.0.lock().unwrap();
            while !*g {
                g = ready.1.wait(g).unwrap();
            }
        }
        let joiner = {
            let key = key.clone();
            thread::spawn(move || match start_or_join(&key) {
                FillRole::Leader(_) => panic!("expected joiner"),
                FillRole::Joiner(j) => j.wait(),
            })
        };
        assert_eq!(leader.join().unwrap().unwrap_err(), "boom");
        assert_eq!(joiner.join().unwrap().unwrap_err(), "boom");
    }
}
