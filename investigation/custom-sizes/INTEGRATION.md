# Optional adoption patch

Report only. Do not treat the measurements as generated custom maps or evidence that Timberborn loads them. Product files are unchanged.

`adoption.patch` changes only `src/core/gen/generate.ts`: require an explicit width for `fieldData`, and supply W at its three callers that inferred sqrt(area). Its fourth caller (`withoutSources`) already supplies W. The untimed reproduction in verify.ts shows that a 128×512 dry mask with tile (7,300) is otherwise serialized as (7,150).

This is latent: the ordinary generator's fieldOf currently never supplies dry masks. The patch makes the API safe for future rectangular fields, without changing the size gates, output terrain, forces, calibration, UI, or D357's must-haves. Do not adopt the measurement/reproduction harness into product imports.

Apply from repository root with `git apply investigation/custom-sizes/adoption.patch` when the owning milestone session chooses to adopt it; the patch was checked with `git apply --check`. Then run the typecheck and the document/source-removal tests touching field persistence. The report did not apply it, and did not test an applied product version.

The remaining feature requires coordinated schema/runtime/preset changes, shape-aware generation and a resolution of impossible tiny-map survival constraints, following the authorized game probe. No limit-lifting patch is proposed here.
