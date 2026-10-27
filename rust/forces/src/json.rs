// The forces' metadata values (the objects, the settings and where; their packed results): the JSON value the
// port was written against (serde_json's `Value` with `preserve_order`), kept here so the crate has no
// dependency with a build script, whose host-specific metadata would change every symbol of the Wasm with the
// machine that builds it (tools/rust/build.ts --check compares the Wasm byte for byte on every OS).
//
// The same behaviour where the port reads it: numbers keep whether they were made from an integer or a float
// (`as_u64` is only an integer's; a float is never equal to an integer), a non-finite float becomes null, an
// object keeps its keys in the order they were inserted, a missing key or index reads as null and a write to
// one makes it, and `json!` builds a value from object and list literals and expressions.

use std::ops::{Index, IndexMut};

#[derive(Clone, Copy, Debug)]
pub enum N {
    PosInt(u64),
    NegInt(i64),
    Float(f64),
}
impl PartialEq for N {
    fn eq(&self, other: &N) -> bool {
        match (self, other) {
            (N::PosInt(a), N::PosInt(b)) => a == b,
            (N::NegInt(a), N::NegInt(b)) => a == b,
            (N::Float(a), N::Float(b)) => a == b,
            _ => false,
        }
    }
}
impl N {
    pub fn as_f64(&self) -> Option<f64> {
        Some(match *self {
            N::PosInt(v) => v as f64,
            N::NegInt(v) => v as f64,
            N::Float(v) => v,
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum V {
    Null,
    Bool(bool),
    Number(N),
    String(String),
    Array(Vec<V>),
    Object(Map),
}

static NULL: V = V::Null;

/// An object: its keys in the order they were first inserted.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Map {
    entries: Vec<(String, V)>,
}
impl Map {
    pub fn new() -> Map {
        Map { entries: vec![] }
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn get(&self, k: &str) -> Option<&V> {
        self.entries.iter().find(|(key, _)| key == k).map(|(_, v)| v)
    }
    pub fn get_mut(&mut self, k: &str) -> Option<&mut V> {
        self.entries.iter_mut().find(|(key, _)| key == k).map(|(_, v)| v)
    }
    /// Sets `k` (where it was, if it was there; else at the end).
    pub fn insert(&mut self, k: String, v: V) -> Option<V> {
        match self.get_mut(&k) {
            Some(old) => Some(std::mem::replace(old, v)),
            None => {
                self.entries.push((k, v));
                None
            }
        }
    }
    /// Removes `k`, the others keeping their order.
    pub fn shift_remove(&mut self, k: &str) -> Option<V> {
        let i = self.entries.iter().position(|(key, _)| key == k)?;
        Some(self.entries.remove(i).1)
    }
    pub fn keys(&self) -> impl Iterator<Item = &String> {
        self.entries.iter().map(|(k, _)| k)
    }
    pub fn iter(&self) -> impl Iterator<Item = (&String, &V)> {
        self.entries.iter().map(|(k, v)| (k, v))
    }
    fn slot(&mut self, k: &str) -> &mut V {
        let i = match self.entries.iter().position(|(key, _)| key == k) {
            Some(i) => i,
            None => {
                self.entries.push((k.to_owned(), V::Null));
                self.entries.len() - 1
            }
        };
        &mut self.entries[i].1
    }
}
impl FromIterator<(String, V)> for Map {
    fn from_iter<T: IntoIterator<Item = (String, V)>>(iter: T) -> Map {
        let mut m = Map::new();
        for (k, v) in iter {
            m.insert(k, v);
        }
        m
    }
}
impl<'a> IntoIterator for &'a Map {
    type Item = (&'a String, &'a V);
    type IntoIter = std::iter::Map<std::slice::Iter<'a, (String, V)>, fn(&'a (String, V)) -> (&'a String, &'a V)>;
    fn into_iter(self) -> Self::IntoIter {
        self.entries.iter().map(|(k, v)| (k, v))
    }
}
impl Index<&str> for Map {
    type Output = V;
    fn index(&self, k: &str) -> &V {
        self.get(k).expect("no such key")
    }
}
impl Index<&String> for Map {
    type Output = V;
    fn index(&self, k: &String) -> &V {
        &self[k.as_str()]
    }
}

impl V {
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            V::Number(n) => n.as_f64(),
            _ => None,
        }
    }
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            V::Number(N::PosInt(v)) => Some(*v),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            V::String(s) => Some(s),
            _ => None,
        }
    }
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            V::Bool(b) => Some(*b),
            _ => None,
        }
    }
    pub fn as_array(&self) -> Option<&Vec<V>> {
        match self {
            V::Array(a) => Some(a),
            _ => None,
        }
    }
    pub fn as_object(&self) -> Option<&Map> {
        match self {
            V::Object(m) => Some(m),
            _ => None,
        }
    }
    pub fn as_object_mut(&mut self) -> Option<&mut Map> {
        match self {
            V::Object(m) => Some(m),
            _ => None,
        }
    }
    pub fn is_array(&self) -> bool {
        matches!(self, V::Array(_))
    }
    pub fn is_object(&self) -> bool {
        matches!(self, V::Object(_))
    }
    pub fn get<I: Key>(&self, i: I) -> Option<&V> {
        i.read(self)
    }
}

/// What indexes a value: a key (an object's) or a position (a list's).
pub trait Key {
    fn read<'a>(&self, v: &'a V) -> Option<&'a V>;
    fn write<'a>(&self, v: &'a mut V) -> &'a mut V;
}
impl Key for &str {
    fn read<'a>(&self, v: &'a V) -> Option<&'a V> {
        v.as_object().and_then(|m| m.get(self))
    }
    fn write<'a>(&self, v: &'a mut V) -> &'a mut V {
        if let V::Null = v {
            *v = V::Object(Map::new());
        }
        match v {
            V::Object(m) => m.slot(self),
            _ => panic!("cannot write key {:?} of a value that is not an object", self),
        }
    }
}
impl Key for usize {
    fn read<'a>(&self, v: &'a V) -> Option<&'a V> {
        v.as_array().and_then(|a| a.get(*self))
    }
    fn write<'a>(&self, v: &'a mut V) -> &'a mut V {
        match v {
            V::Array(a) => &mut a[*self],
            _ => panic!("cannot write index {} of a value that is not a list", self),
        }
    }
}
impl<I: Key> Index<I> for V {
    type Output = V;
    fn index(&self, i: I) -> &V {
        i.read(self).unwrap_or(&NULL)
    }
}
impl<I: Key> IndexMut<I> for V {
    fn index_mut(&mut self, i: I) -> &mut V {
        i.write(self)
    }
}

/// A value from a Rust one, by reference (as serde_json's `to_value(&x)`).
pub trait ToV {
    fn to_v(&self) -> V;
}
impl ToV for V {
    fn to_v(&self) -> V {
        self.clone()
    }
}
impl ToV for bool {
    fn to_v(&self) -> V {
        V::Bool(*self)
    }
}
impl ToV for str {
    fn to_v(&self) -> V {
        V::String(self.to_owned())
    }
}
impl ToV for String {
    fn to_v(&self) -> V {
        V::String(self.clone())
    }
}
impl ToV for std::sync::Arc<str> {
    fn to_v(&self) -> V {
        V::String(self.to_string())
    }
}
macro_rules! unsigned {
    ($($t:ty),*) => {$(impl ToV for $t { fn to_v(&self) -> V { V::Number(N::PosInt(*self as u64)) } })*};
}
macro_rules! signed {
    ($($t:ty),*) => {$(impl ToV for $t { fn to_v(&self) -> V { if *self < 0 { V::Number(N::NegInt(*self as i64)) } else { V::Number(N::PosInt(*self as u64)) } } })*};
}
unsigned!(u8, u16, u32, u64, usize);
signed!(i8, i16, i32, i64, isize);
impl ToV for f64 {
    fn to_v(&self) -> V {
        if self.is_finite() {
            V::Number(N::Float(*self))
        } else {
            V::Null
        }
    }
}
impl ToV for f32 {
    fn to_v(&self) -> V {
        (*self as f64).to_v()
    }
}
impl<T: ToV> ToV for [T] {
    fn to_v(&self) -> V {
        V::Array(self.iter().map(ToV::to_v).collect())
    }
}
impl<T: ToV, const K: usize> ToV for [T; K] {
    fn to_v(&self) -> V {
        self.as_slice().to_v()
    }
}
impl<T: ToV> ToV for Vec<T> {
    fn to_v(&self) -> V {
        self.as_slice().to_v()
    }
}
impl<T: ToV> ToV for Option<T> {
    fn to_v(&self) -> V {
        match self {
            Some(v) => v.to_v(),
            None => V::Null,
        }
    }
}
impl<T: ToV + ?Sized> ToV for &T {
    fn to_v(&self) -> V {
        (**self).to_v()
    }
}

/// A value from object literals (`{"key": value, …}`), list literals (`[value, …]`) and expressions.
macro_rules! json {
    ({ $($tt:tt)* }) => {{
        #[allow(unused_mut)]
        let mut m = $crate::json::Map::new();
        json_object!(m; $($tt)*);
        $crate::json::V::Object(m)
    }};
    ([ $($tt:tt)* ]) => {{
        #[allow(unused_mut)]
        let mut a: Vec<$crate::json::V> = Vec::new();
        json_list!(a; $($tt)*);
        $crate::json::V::Array(a)
    }};
    ($e:expr) => {
        $crate::json::ToV::to_v(&$e)
    };
}
macro_rules! json_object {
    ($m:ident;) => {};
    ($m:ident; $k:literal : { $($v:tt)* } $(, $($rest:tt)*)?) => {
        $m.insert(String::from($k), json!({ $($v)* }));
        json_object!($m; $($($rest)*)?);
    };
    ($m:ident; $k:literal : [ $($v:tt)* ] $(, $($rest:tt)*)?) => {
        $m.insert(String::from($k), json!([ $($v)* ]));
        json_object!($m; $($($rest)*)?);
    };
    ($m:ident; $k:literal : $v:expr $(, $($rest:tt)*)?) => {
        $m.insert(String::from($k), json!($v));
        json_object!($m; $($($rest)*)?);
    };
}
macro_rules! json_list {
    ($a:ident;) => {};
    ($a:ident; { $($v:tt)* } $(, $($rest:tt)*)?) => {
        $a.push(json!({ $($v)* }));
        json_list!($a; $($($rest)*)?);
    };
    ($a:ident; [ $($v:tt)* ] $(, $($rest:tt)*)?) => {
        $a.push(json!([ $($v)* ]));
        json_list!($a; $($($rest)*)?);
    };
    ($a:ident; $v:expr $(, $($rest:tt)*)?) => {
        $a.push(json!($v));
        json_list!($a; $($($rest)*)?);
    };
}
