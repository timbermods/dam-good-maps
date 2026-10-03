// Small helpers the checks call outside src/core/validate: a polygon's tiles (features/geometry.ts
// `polygonMask`), a channel's bed (features/route.ts `channelTiles`), fix ids (math/hash.ts `guidFrom`), the
// official ranges (gen/calibrated.ts `officialRange`), tile runs (math/grid.ts `tilesToRuns`) and the badwater
// rule (resources/badwater.ts `asksForBadwater`).

use crate::tables::*;
use std::collections::HashSet;

/// `polygonMask`: tiles whose centre lies inside the polygon (even-odd).
pub fn polygon_mask(poly: &[(f64, f64)], w: usize, h: usize) -> Vec<u8> {
    let mut mask = vec![0u8; w * h];
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for &(_, py) in poly {
        if py < min_y {
            min_y = py;
        }
        if py > max_y {
            max_y = py;
        }
    }
    let y0 = portable::max(0.0, min_y.ceil());
    let y1 = portable::min(h as f64 - 1.0, max_y.floor());
    let mut xs: Vec<f64> = vec![];
    let mut y = y0;
    while y <= y1 {
        xs.clear();
        let mut j = poly.len().wrapping_sub(1);
        for i in 0..poly.len() {
            let (xi, yi) = poly[i];
            let (xj, yj) = poly[j];
            if (yi > y) != (yj > y) {
                xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
            }
            j = i;
        }
        xs.sort_by(|a, b| {
            let d = a - b;
            if d < 0.0 {
                std::cmp::Ordering::Less
            } else if d > 0.0 {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        });
        let mut k = 0;
        while k + 1 < xs.len() {
            let xa = portable::max(0.0, xs[k].ceil());
            let xb = portable::min(w as f64 - 1.0, xs[k + 1].floor());
            let mut x = xa;
            while x <= xb {
                mask[(y * w as f64 + x) as usize] = 1;
                x += 1.0;
            }
            k += 2;
        }
        y += 1.0;
    }
    mask
}

/// The bed tiles of `channelTiles` (the tiles a carved channel writes its bed to).
pub fn channel_bed(tiles: &[f64], levels: &[f64], width: f64, w: usize, h: usize) -> HashSet<usize> {
    let r = ((width - 1.0) as i64) >> 1;
    let mut bed = HashSet::new();
    for k in 0..levels.len() {
        let x = tiles[2 * k] as i64;
        let y = tiles[2 * k + 1] as i64;
        for dy in -r..=r {
            for dx in -r..=r {
                let nx = x + dx;
                let ny = y + dy;
                if nx < 0 || ny < 0 || nx >= w as i64 || ny >= h as i64 {
                    continue;
                }
                bed.insert(ny as usize * w + nx as usize);
            }
        }
    }
    bed
}

fn fmix32(mut h: u32) -> u32 {
    h ^= h >> 16;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^= h >> 16;
    h
}

/// MurmurHash3 x86_32 (`murmur3`).
fn murmur3(bytes: &[u8], seed: u32) -> u32 {
    let mut h = seed;
    let n = bytes.len();
    let blocks = n & !3;
    let mut i = 0;
    while i < blocks {
        let mut k = u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
        k = k.wrapping_mul(0xcc9e_2d51);
        k = k.rotate_left(15);
        k = k.wrapping_mul(0x1b87_3593);
        h ^= k;
        h = h.rotate_left(13);
        h = h.wrapping_mul(5).wrapping_add(0xe654_6b64);
        i += 4;
    }
    let tail = n & 3;
    if tail != 0 {
        let mut k = 0u32;
        if tail == 3 {
            k ^= (bytes[blocks + 2] as u32) << 16;
        }
        if tail >= 2 {
            k ^= (bytes[blocks + 1] as u32) << 8;
        }
        k ^= bytes[blocks] as u32;
        k = k.wrapping_mul(0xcc9e_2d51);
        k = k.rotate_left(15);
        k = k.wrapping_mul(0x1b87_3593);
        h ^= k;
    }
    h ^= n as u32;
    fmix32(h)
}

/// `guidFrom(...parts)`: parts joined by U+001F, numbers in decimal.
pub fn guid_from(parts: &[&str]) -> String {
    let bytes = parts.join("\u{1f}").into_bytes();
    let lanes = [murmur3(&bytes, 0x9e37_79b9), murmur3(&bytes, 0x85eb_ca6b), murmur3(&bytes, 0xc2b2_ae35), murmur3(&bytes, 0x27d4_eb2f)];
    let mut b = [0u8; 16];
    for i in 0..4 {
        b[i * 4..i * 4 + 4].copy_from_slice(&lanes[i].to_be_bytes());
    }
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    let hex: String = b.iter().map(|v| format!("{:02x}", v)).collect();
    format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..])
}

/// `lnDet`.
fn ln_det(mut x: f64) -> f64 {
    let mut k = 0.0;
    while x >= 2.0 {
        x /= 2.0;
        k += 1.0;
    }
    while x < 1.0 {
        x *= 2.0;
        k -= 1.0;
    }
    let z = (x - 1.0) / (x + 1.0);
    let z2 = z * z;
    let mut term = z;
    let mut sum = 0.0;
    let mut n = 1.0;
    while n < 60.0 {
        sum += term / n;
        term *= z2;
        n += 2.0;
    }
    2.0 * sum + k * 0.6931471805599453
}

fn density(ys: &[f64; 4], area: f64) -> f64 {
    let a = portable::max(area, 1.0);
    if a <= SIZE_ANCHORS[0] {
        return ys[0];
    }
    for i in 1..4 {
        if a <= SIZE_ANCHORS[i] {
            let t = ln_det(a / SIZE_ANCHORS[i - 1]) / ln_det(SIZE_ANCHORS[i] / SIZE_ANCHORS[i - 1]);
            return ys[i - 1] + t * (ys[i] - ys[i - 1]);
        }
    }
    ys[3]
}

pub struct Range {
    pub median: f64,
    pub low: f64,
    pub high: f64,
}

/// `officialRange`.
pub fn official_range(kind: &str, area: f64) -> Range {
    let (median, spread) = match kind {
        "trees" => ((density(&DENSITY_TREES_PER_10K, area) * area) / 1e4, SPREAD_TREES),
        "bushes" => ((density(&DENSITY_BUSHES_PER_10K, area) * area) / 1e4, SPREAD_BUSHES),
        _ => ((density(&DENSITY_SCRAP_PER_1K_TILES, area) * area) / 1e3, SPREAD_SCRAP),
    };
    Range { median, low: median * spread[0], high: median * spread[1] }
}

/// `tilesToRuns`: [y, x0, x1] runs of a tile set.
pub fn tiles_to_runs(tiles: &[usize], w: usize) -> Vec<[usize; 3]> {
    let mut sorted = tiles.to_vec();
    sorted.sort_unstable();
    let mut runs: Vec<[usize; 3]> = vec![];
    for t in sorted {
        let x = t % w;
        let y = t / w;
        match runs.last_mut() {
            Some(last) if last[0] == y && last[2] + 1 == x => last[2] = x,
            _ => runs.push([y, x, x]),
        }
    }
    runs
}

/// `asksForBadwater`: a setting asks unless it is "off"; without one, a description that says No badwater
/// (`/\bNo badwater\b/i`, ASCII case-folded, as JavaScript's regular expressions without the u flag) does not.
pub fn asks_for_badwater(setting: Option<&str>, description: &str) -> bool {
    if let Some(s) = setting {
        if !s.is_empty() {
            return s != "off";
        }
    }
    let d: Vec<u16> = description.encode_utf16().collect();
    let pat: Vec<u16> = "no badwater".encode_utf16().collect();
    let word = |c: u16| c < 128 && ((c as u8).is_ascii_alphanumeric() || c == b'_' as u16);
    let fold = |c: u16| if c < 128 { (c as u8).to_ascii_lowercase() as u16 } else { c };
    if d.len() < pat.len() {
        return true;
    }
    for i in 0..=d.len() - pat.len() {
        if (0..pat.len()).all(|k| fold(d[i + k]) == pat[k]) {
            let before = i == 0 || !word(d[i - 1]);
            let after = i + pat.len() == d.len() || !word(d[i + pat.len()]);
            if before && after {
                return false;
            }
        }
    }
    true
}
