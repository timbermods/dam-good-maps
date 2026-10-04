// Browser executable overrides are diagnostic configuration, never maths or speed tuning.
export function launchOptions(engine) {
 const path=engine==='chromium'?process.env.DGM_CHROMIUM:engine==='firefox'?process.env.DGM_FIREFOX:process.env.DGM_WEBKIT;
 return {headless:true,...(path?{executablePath:path}:{})};
}
