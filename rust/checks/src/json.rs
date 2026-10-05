// The report as plain data, written as `JSON.stringify` writes the TypeScript's objects: keys in the order the
// TypeScript creates them, numbers and strings in JavaScript's text.

use crate::js;

#[derive(Clone, Debug)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

pub fn s(v: impl Into<String>) -> Json {
    Json::Str(v.into())
}
pub fn n(v: f64) -> Json {
    Json::Num(v)
}
pub fn b(v: bool) -> Json {
    Json::Bool(v)
}
pub fn arr(v: Vec<Json>) -> Json {
    Json::Arr(v)
}
pub fn obj(v: Vec<(&str, Json)>) -> Json {
    Json::Obj(v.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}
/// `[x, y]` tiles.
pub fn tiles(t: &[(i64, i64)]) -> Json {
    Json::Arr(t.iter().map(|&(x, y)| Json::Arr(vec![n(x as f64), n(y as f64)])).collect())
}
pub fn strings(v: &[String]) -> Json {
    Json::Arr(v.iter().map(|e| s(e.clone())).collect())
}

impl Json {
    pub fn write(&self, out: &mut String) {
        match self {
            Json::Null => out.push_str("null"),
            Json::Bool(v) => out.push_str(if *v { "true" } else { "false" }),
            Json::Num(v) => out.push_str(&js::json_num(*v)),
            Json::Str(v) => js::json_str(v, out),
            Json::Arr(v) => {
                out.push('[');
                for (k, e) in v.iter().enumerate() {
                    if k > 0 {
                        out.push(',');
                    }
                    e.write(out);
                }
                out.push(']');
            }
            Json::Obj(v) => {
                out.push('{');
                for (k, (key, e)) in v.iter().enumerate() {
                    if k > 0 {
                        out.push(',');
                    }
                    js::json_str(key, out);
                    out.push(':');
                    e.write(out);
                }
                out.push('}');
            }
        }
    }
    pub fn text(&self) -> String {
        let mut out = String::new();
        self.write(&mut out);
        out
    }
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(v) => v.iter().find(|(k, _)| k == key).map(|(_, e)| e),
            _ => None,
        }
    }
}
