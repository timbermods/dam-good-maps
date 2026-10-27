use std::io::Write;
fn main(){
    let id:usize=std::env::args().nth(1).expect("case ID").parse().unwrap();
    rust_props::reset_peak();
    let out=std::panic::catch_unwind(||rust_props::case(id));
    eprintln!("peak={}",rust_props::peak());
    let b=out.unwrap_or_else(|_|{let mut b=vec![];for n in [rust_props::PANIC,0,0,0]{b.extend(n.to_le_bytes())}b});
    std::io::stdout().write_all(&b).unwrap();
}
