// Compact strong retaining paths for post-session snapshots; raw snapshots remain local.
import {readFileSync,writeFileSync} from 'node:fs';
const file=process.argv[2];if(!file)throw new Error('Pass a local .heapsnapshot');
const h=JSON.parse(readFileSync(file,'utf8')),meta=h.snapshot.meta;
const nf=meta.node_fields,ef=meta.edge_fields,N=nf.length,E=ef.length;
const ni=Object.fromEntries(nf.map((x,i)=>[x,i])),ei=Object.fromEntries(ef.map((x,i)=>[x,i]));
const nt=meta.node_types[ni.type],et=meta.edge_types[ei.type],nodes=h.nodes,edges=h.edges,strings=h.strings;
const count=nodes.length/N,starts=new Uint32Array(count+1),parents=new Int32Array(count).fill(-1),via=new Int32Array(count).fill(-1);
for(let i=0;i<count;i++)starts[i+1]=starts[i]+nodes[i*N+ni.edge_count]*E;
const queue=new Uint32Array(count);let lo=0,hi=1;queue[0]=0;parents[0]=0;
while(lo<hi){const at=queue[lo++];for(let k=starts[at];k<starts[at+1];k+=E){const kind=et[edges[k+ei.type]];if(kind==='weak')continue;const to=edges[k+ei.to_node]/N;if(parents[to]!==-1)continue;parents[to]=at;via[to]=k;queue[hi++]=to;}}
const name=i=>strings[nodes[i*N+ni.name]].slice(0,160),type=i=>nt[nodes[i*N+ni.type]],size=i=>nodes[i*N+ni.self_size];
const edgeName=k=>{const t=et[edges[k+ei.type]],v=edges[k+ei.name_or_index];return `${t}:${['element','hidden'].includes(t)?v:strings[v]}`;};
const path=i=>{const p=[];let n=i;for(let k=0;k<40&&n;k++){p.push({node:n,name:name(n),type:type(n),bytes:size(n),edge:via[n]<0?'':edgeName(via[n])});n=parents[n];if(n<0)break;}return p.reverse();};
const largest=[];for(let i=0;i<count;i++)if(parents[i]!==-1&&size(i)>=65536)largest.push(i);
largest.sort((a,b)=>size(b)-size(a));
const result={file,nodes:count,stronglyReachable:hi,large:largest.slice(0,30).map(i=>({name:name(i),type:type(i),bytes:size(i),path:path(i)}))};
writeFileSync(file+'.paths.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({file,nodes:count,stronglyReachable:hi,large:result.large.map(x=>({bytes:x.bytes,name:x.name,path:x.path.map(p=>p.edge).filter(Boolean).join(' > ').slice(0,500)}))},null,2));
