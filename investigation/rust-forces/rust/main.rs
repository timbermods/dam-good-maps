use std::{
    env, fs,
    io::{Read, Write},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::Instant,
};
fn main() {
    let args: Vec<_> = env::args().collect();
    let export_fixtures = args.get(1).map(String::as_str) == Some("--serve-fixtures-export");
    if export_fixtures || args.get(1).map(String::as_str) == Some("--serve-fixtures") {
        // Cold fixture I/O only. Retain one process for large identity corpora;
        // timing continues to use --bench-plan and its typed retained Job.
        let stdin = std::io::stdin();
        let stdout = std::io::stdout();
        let mut input = stdin.lock();
        let mut output = stdout.lock();
        loop {
            let mut header = [0u8; 4];
            match input.read_exact(&mut header) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
                Err(e) => panic!("fixture header: {}", e),
            }
            let mut bytes = vec![0; u32::from_le_bytes(header) as usize];
            input.read_exact(&mut bytes).expect("fixture input");
            let mut task = rust_forces::prepare(&bytes);
            rust_forces::plan(&mut task);
            let result = rust_forces::pack(&task);
            output
                .write_all(&(result.len() as u32).to_le_bytes())
                .expect("fixture length");
            output.write_all(&result).expect("fixture output");
            if export_fixtures {
                let entities = rust_forces::pack_export_entities(&task);
                output
                    .write_all(&(entities.len() as u32).to_le_bytes())
                    .expect("entity length");
                output.write_all(&entities).expect("entity output");
            }
            output.flush().expect("fixture flush");
        }
        return;
    }
    if args.len() < 3 {
        eprintln!(
            "forces-batch INPUT OUTPUT | --batch MANIFEST THREADS (manifest: input<TAB>output)"
        );
        std::process::exit(2);
    }
    if args[1] == "--bench-plan" {
        let input = fs::read(&args[2]).expect("input");
        let mut task = rust_forces::prepare(&input);
        let mut cold = vec![];
        for _ in 0..3 {
            rust_forces::reset(&mut task);
            let start = Instant::now();
            rust_forces::plan(&mut task);
            cold.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        for _ in 0..5 {
            rust_forces::reset(&mut task);
            rust_forces::plan(&mut task);
        }
        let reps: usize = args[4].parse().expect("repetitions");
        let mut times = vec![];
        #[cfg(feature = "bench-clock")]
        let mut compute = vec![];
        for _ in 0..reps {
            rust_forces::reset(&mut task);
            let start = Instant::now();
            rust_forces::plan(&mut task);
            times.push(start.elapsed().as_secs_f64() * 1000.0);
            #[cfg(feature = "bench-clock")]
            compute.push(rust_forces::compute_ms(&task));
        }
        fs::write(&args[3], rust_forces::pack(&task)).expect("output");
        #[cfg(feature = "bench-clock")]
        eprintln!(
            "{{\"times\":{:?},\"compute\":{:?},\"preWarmup\":{:?}}}",
            times, compute, cold
        );
        #[cfg(not(feature = "bench-clock"))]
        eprintln!("{{\"times\":{:?},\"preWarmup\":{:?}}}", times, cold);
    } else if args[1] == "--bench" {
        let input = fs::read(&args[2]).expect("input");
        let reps: usize = args[4].parse().expect("repetitions");
        let mut times = vec![];
        let mut output = rust_forces::execute(&input); // warm-up, excluded
        for _ in 0..reps {
            let start = Instant::now();
            output = rust_forces::execute(&input);
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
    let out = rust_forces::execute(&b);
    fs::write(output, out).expect("output");
}
