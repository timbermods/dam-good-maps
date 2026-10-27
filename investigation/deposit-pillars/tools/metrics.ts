export function sediment(before:ArrayLike<number>,heights:ArrayLike<number>,side:number){
 const raised=new Set<number>();const xs:number[]=[],ys:number[]=[];let volume=0,pillars=0;
 const neighbours=(i:number)=>[i%side>0?i-1:-1,i%side+1<side?i+1:-1,i-side,i+side].filter(j=>j>=0&&j<heights.length);
 for(let i=0;i<heights.length;i++)if(heights[i]>before[i]){raised.add(i);volume+=heights[i]-before[i];xs.push(i%side);ys.push((i/side)|0);
  if(neighbours(i).every(j=>heights[i]-heights[j]>=3))pillars++;
 }
 const bodyXs:number[]=[],bodyYs:number[]=[];let wires=0;for(const i of raised){const x=i%side,y=(i/side)|0;let body=false;
  for(const dx of [-1,0])for(const dy of [-1,0])if(x+dx>=0&&y+dy>=0&&x+dx+1<side&&y+dy+1<heights.length/side){
   const j=(y+dy)*side+x+dx;if([j,j+1,j+side,j+side+1].every(k=>raised.has(k)))body=true;
  }if(!body)wires++;else{bodyXs.push(x);bodyYs.push(y);}
 }
 const pending=new Set(raised);const components:number[]=[];
 while(pending.size){const todo=[pending.values().next().value!];pending.delete(todo[0]);let count=0;
  while(todo.length){const i=todo.pop()!;count++;for(const j of neighbours(i))if(pending.delete(j))todo.push(j);}components.push(count);
 }
 return {volume,area:raised.size,xSpan:xs.length?Math.max(...xs)-Math.min(...xs)+1:0,ySpan:ys.length?Math.max(...ys)-Math.min(...ys)+1:0,bodyXSpan:bodyXs.length?Math.max(...bodyXs)-Math.min(...bodyXs)+1:0,bodyYSpan:bodyYs.length?Math.max(...bodyYs)-Math.min(...bodyYs)+1:0,pillars,wires,components,strays:components.filter(n=>n<4).length};
}
