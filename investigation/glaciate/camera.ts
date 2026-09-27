import type {View} from '../forces-core/demo/view';
import type {Station} from './model';
/** Actual perspective camera on the new floor; no rescaled vertical geometry. */
export function valleyView(view:View,path:Station[]){
 const at=path[Math.floor(path.length*.9)],look=path[Math.floor(path.length*.18)];
 view.controls.maxPolarAngle=Math.PI*.65;view.controls.enableDamping=false;view.camera.fov=60;
 view.camera.position.set(at.x,at.floor+4.5,-at.y);view.controls.target.set(look.x,look.floor+3,-look.y);
 view.camera.updateProjectionMatrix();view.controls.update();view.top=false;
}
