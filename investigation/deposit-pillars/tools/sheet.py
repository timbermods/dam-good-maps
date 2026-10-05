# Procedural scientific heightmap panels; no external assets. Read only generated local arrays.
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
b=Path('investigation/deposit-pillars')
before=json.loads((b/'local/before/samples.json').read_text())
after=json.loads((b/f'local/{sys.argv[1] if len(sys.argv)>1 else "lobes"}/samples.json').read_text())
lookup={(s['theme'],s['seed'],s['k']):s for s in after}
cases=[s for s in before if s['k']<3 and (s['theme'],s['seed'],s['k']) in lookup][:20]
assert len(cases)==20
font_path='C:/Windows/Fonts/segoeui.ttf'
font=ImageFont.truetype(font_path,16); small=ImageFont.truetype(font_path,12); title=ImageFont.truetype(font_path,24)
panel=204; cellw=448; cellh=285
sheet=Image.new('RGB',(cellw*4,120+cellh*5),(245,244,238));draw=ImageDraw.Draw(sheet)
draw.text((20,12),'Deposit | old shaping before / separate sediment lobes after',font=title,fill=(32,45,40))
draw.text((20,48),'20 identical gestures on 128 x 128 generated maps | height + hillshade | orange = deposited, blue = donor cuts',font=font,fill=(48,59,51))
draw.text((20,74),'Each pair shares its height scale and crop. Same 20 gestures, including all seven Power 0 short draws; each keeps its original sediment volume.',font=font,fill=(48,59,51))
manifest=[]
def render(s,crop):
 n=128;h=s['heights'];inp=s['input'];x0,y0,size=crop
 im=Image.new('RGB',(size,size));px=im.load()
 for yy in range(size):
  for xx in range(size):
   x=x0+xx;y=y0+yy;i=y*n+x;v=h[i]
   l=h[y*n+max(0,x-1)];r=h[y*n+min(n-1,x+1)]
   u=h[max(0,y-1)*n+x];d=h[min(n-1,y+1)*n+x]
   shade=max(.55,min(1.30,1.0+(l-r+u-d)*.065))
   t=v/22
   color=[78+t*136,103+t*118,75+t*115]
   dz=v-inp[i]
   if dz>0:color=[185+t*45,113+t*60,49+t*55]
   elif dz<0:color=[63+t*55,112+t*65,149+t*65]
   if any(h[j]!=v for j in [y*n+max(0,x-1),max(0,y-1)*n+x]):shade*=.87
   px[xx,yy]=tuple(int(max(0,min(255,c*shade))) for c in color)
 return im.resize((panel,panel),Image.Resampling.NEAREST)
for k,old in enumerate(cases):
 new=lookup[(old['theme'],old['seed'],old['k'])]
 assert old['input']==new['input']
 indices=[i for i,(v,w,z) in enumerate(zip(old['heights'],new['heights'],old['input'])) if v!=z or w!=z]
 xs=[i%128 for i in indices];ys=[i//128 for i in indices]
 size=min(128,max(32,max(xs)-min(xs)+13,max(ys)-min(ys)+13))
 cx=(min(xs)+max(xs))//2;cy=(min(ys)+max(ys))//2
 crop=(max(0,min(128-size,cx-size//2)),max(0,min(128-size,cy-size//2)),size)
 x=(k%4)*cellw+14;y=120+(k//4)*cellh
 draw.text((x,y),f"{k+1:02d}  {old['theme']}  seed {old['seed']} / use {old['k']} / Power {old['power']}",font=small,fill=(32,45,40))
 draw.text((x,y+20),'BEFORE',font=small,fill=(83,58,42));draw.text((x+216,y+20),'AFTER',font=small,fill=(31,78,53))
 sheet.paste(render(old,crop),(x,y+40));sheet.paste(render(new,crop),(x+216,y+40))
 reason=new.get('reason')
 caption=reason or 'Kept: sediment bodies; no wires or lone pillars'
 if reason=='the map leaves no room for sediment here':caption='Refused: no receiving ground here'
 draw.text((x,y+249),caption,font=small,fill=(50,59,54))
 manifest.append({key:old[key] for key in ['theme','side','seed','k','path','power']}|{'afterReason':reason,'crop':crop})
out=b/'docs/sheets/deposit-pillars.png';out.parent.mkdir(parents=True,exist_ok=True);sheet.save(out,optimize=True)
(b/'docs/sheets/cases.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(out, out.stat().st_size)
