// The analysis kernels the checks call, from the analysis crate (rust/analysis): never ported again here.

pub(crate) fn k_distance(mask: &[f64], w: usize, h: usize) -> Vec<f64> {
    analysis::kernels::distance_from(mask, w, h)
}
#[allow(clippy::too_many_arguments)]
pub(crate) fn k_walk(ht: &[f64], blocked: &[f64], links: &[f64], sx: f64, sy: f64, limit: f64, w: usize, h: usize) -> Vec<f64> {
    analysis::kernels::walk_distance(ht, blocked, links, sx, sy, limit, w, h)
}
pub(crate) fn k_walk_regions(ht: &[f64], blocked: &[f64], links: &[f64], w: usize, h: usize) -> Vec<f64> {
    analysis::kernels::walk_regions(ht, blocked, links, w, h)
}
pub(crate) fn k_land_regions(ht: &[f64], wet: &[f64], w: usize, h: usize) -> Vec<f64> {
    analysis::kernels::land_regions_of(ht, wet, w, h)
}
/// The labels, then the number of components, then each one's size.
pub(crate) fn k_components(mask: &[f64], eight: bool, w: usize, h: usize) -> Vec<f64> {
    let (mut labels, sizes) = analysis::kernels::components(mask, eight, w, h);
    labels.push(sizes.len() as f64);
    labels.extend(sizes);
    labels
}
pub(crate) fn k_spill(floor: &[f64], dam: &[f64], emitting: &[f64], w: usize, h: usize) -> Vec<f64> {
    analysis::kernels::spill_levels(floor, dam, emitting, w, h)
}
#[allow(clippy::too_many_arguments)]
pub(crate) fn k_dams(ht: &[f64], channel: &[f64], surface: &[f64], sd: &[f64], heights: &[f64], p: [f64; 4], w: usize, h: usize) -> Vec<f64> {
    analysis::kernels::dam_sites(ht, channel, surface, sd, heights, p, w, h)
}
