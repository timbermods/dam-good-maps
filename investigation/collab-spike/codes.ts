import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
const PREFIX = 'DGC2.';
// A versioned dictionary packs boilerplate losslessly. No candidate, credential,
// fingerprint or unfamiliar SDP line is discarded.
const DICTIONARY = [
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n',
  's=-\r\nt=0 0\r\n', 'a=group:BUNDLE 0\r\n', 'a=extmap-allow-mixed\r\n',
  'a=msid-semantic: WMS\r\n', 'c=IN IP4 0.0.0.0\r\n',
  'a=ice-options:trickle renomination\r\n', 'a=ice-options:trickle\r\n',
  'a=fingerprint:sha-256 ', 'a=setup:actpass\r\n', 'a=setup:active\r\n',
  'a=mid:0\r\n', 'a=sctp-port:5000\r\n', 'a=max-message-size:262144\r\n',
  'a=end-of-candidates\r\n', 'a=candidate:', ' 1 udp ',
  ' typ host generation 0 network-cost 999\r\n',
  'a=ice-ufrag:', 'a=ice-pwd:', ' IN IP4 127.0.0.1\r\n', 'o=- ', 'v=0\r\n',
];
const TOKENS = Array.from({length:31}, (_,i)=>i+1).filter(i=>i!==10 && i!==13).map(i=>String.fromCharCode(i));
function base64(bytes: Uint8Array): string {
  let s='';
  for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function encode(description: RTCSessionDescriptionInit) {
  const sdp=description.sdp!;
  if(TOKENS.some(t=>sdp.includes(t)))throw Error('Unexpected control character in browser SDP.');
  const json=JSON.stringify([description.type==='offer'?0:1,sdp]);
  const generic=deflateSync(strToU8(json),{level:9});
  let packed=sdp;
  DICTIONARY.forEach((line,i)=>{packed=packed.replaceAll(line,TOKENS[i]);});
  const text=strToU8(packed);
  const payload=new Uint8Array(text.length+1);
  payload[0]=description.type==='offer'?0:1;payload.set(text,1);
  const compressed=deflateSync(payload,{level:9});
  const dictWins=compressed.length<generic.length;
  const code=(dictWins?PREFIX:'DGC1.')+base64(dictWins?compressed:generic);
  return {code,jsonChars:json.length,rawChars:5+base64(strToU8(json)).length,
    deflateOnlyChars:5+base64(generic).length,compressedChars:code.length};
}
export function decode(input: string): RTCSessionDescriptionInit {
  const code=input.replace(/\s/g,'');
  if(!/^DGC[12]\./.test(code)||code.length>100_000)throw Error('Paste a complete Invite or Reply code from this demo.');
  const text=atob(code.slice(5).replaceAll('-','+').replaceAll('_','/'));
  const packed=Uint8Array.from(text,c=>c.charCodeAt(0));
  const out=new Uint8Array(256_000);
  const bytes=inflateSync(packed,{out});
  if(bytes.length>=out.length)throw Error('Code is too large.');
  let type:number,sdp:string;
  if(code.startsWith(PREFIX)){
    type=bytes[0];sdp=strFromU8(bytes.subarray(1));
    DICTIONARY.forEach((line,i)=>{sdp=sdp.replaceAll(TOKENS[i],line);});
  }else{
    const value=JSON.parse(strFromU8(bytes));
    if(!Array.isArray(value))throw Error('This code is damaged.');
    [type,sdp]=value;
  }
  if(![0,1].includes(type)||typeof sdp!=='string'||!sdp.startsWith('v=0\r\n'))throw Error('This code is damaged.');
  return {type:type===0?'offer':'answer',sdp};
}
