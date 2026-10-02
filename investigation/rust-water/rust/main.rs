use std::{
    env, fs,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::Instant,
};
fn main() {
    let args: Vec<_> = env::args().collect();
    if args.len() < 3 {
        eprintln!(
            "water-batch INPUT OUTPUT | --batch MANIFEST THREADS (manifest: input<TAB>output)"
        );
        std::process::exit(2);
    }
    if args[1] == "--bench" {
        let input = fs::read(&args[2]).expect("input");
        let reps: usize = args[4].parse().expect("repetitions");
        let mut times = vec![];
        let mut output = rust_water::execute(&input); // warm-up, excluded
        for _ in 0..reps {
            let start = Instant::now();
            output = rust_water::execute(&input);
            times.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        fs::write(&args[3], output).expect("output");
        eprintln!("{{\"times\":{:?}}}", times);
    } else if args[1] == "--batch" {
        let jobs: Vec<(String, String)> = fs::read_to_string(&args[2])
            .expect("manifest")
            .lines()
            .map(|l| {
                let (a, b) = l.split_once('\t').expect("input TAB output");
                (a.into(), b.into())
            })
            .collect();
        let threads = args
            .get(3)
            .map(|v| v.parse().unwrap())
            .unwrap_or_else(|| thread::available_parallelism().unwrap().get());
        let jobs = Arc::new(jobs);
        let next = Arc::new(AtomicUsize::new(0));
        let start = Instant::now();
        let mut handles = vec![];
        for _ in 0..threads {
            let jobs = jobs.clone();
            let next = next.clone();
            handles.push(thread::spawn(move || loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= jobs.len() {
                    break;
                }
                run(&jobs[i].0, &jobs[i].1);
            }));
        }
        for h in handles {
            h.join().expect("worker failed");
        }
        eprintln!(
            "{{\"jobs\":{},\"threads\":{},\"seconds\":{}}}",
            jobs.len(),
            threads,
            start.elapsed().as_secs_f64()
        );
    } else {
        run(&args[1], &args[2]);
    }
}
fn run(input: &str, output: &str) {
    let b = fs::read(input).expect("input");
    let out = rust_water::execute(&b);
    fs::write(output, out).expect("output");
}
