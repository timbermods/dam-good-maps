from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import os
ROOT=Path('investigation/river-valley-sheets')
round2=os.getenv('RV_SHEET_ROUND')=='2'
modes=['round1','round2'] if round2 else ['dev','round1']
labels=['round 1','round 2'] if round2 else ['dev','after']
OUT=Path('docs/sheets/river-valley-sheets-r2-128.jpg' if round2 else 'docs/sheets/river-valley-sheets-128.jpg')
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',16)
big=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf',23)
w=3*528+16;h=100+10*288+16
im=Image.new('RGB',(w,h),'#20262b');d=ImageDraw.Draw(im)
d.text((16,12),'River Valley | 128 x 128 | Normal | Seeds 1-30',font=big,fill='white')
d.text((16,46),f'Each pair: {labels[0]} left / {labels[1]} right | North up | Red start | Purple badwater | 256 px per map',font=font,fill='#d0d6db')
for s in range(1,31):
 k=s-1;x=16+(k%3)*528;y=92+(k//3)*288
 d.text((x,y),f'Seed {s}       {labels[0]}                                      {labels[1]}',font=font,fill='white')
 for j,mode in enumerate(modes):im.paste(Image.open(ROOT/'local'/mode/f'{s}.png').resize((256,256),Image.Resampling.NEAREST),(x+j*256,y+25))
OUT.parent.mkdir(parents=True,exist_ok=True);im.save(OUT,quality=87,subsampling=0)
seeds=[6,12,27] if round2 else [12,19,5,21,22,26]
if all((ROOT/'local'/m/'3d'/f'{s}.jpg').exists() for m in modes for s in seeds):
 panelW=680;panelH=440
 im=Image.new('RGB',(2*panelW+32,70+len(seeds)*(panelH+28)),'#20262b');d=ImageDraw.Draw(im)
 d.text((16,12),f'River Valley | Opening editor 3D camera | {labels[0]} left / {labels[1]} right',font=big,fill='white')
 for k,s in enumerate(seeds):
  y=65+k*(panelH+28);d.text((16,y),f'Seed {s}',font=font,fill='white')
  for j,mode in enumerate(modes):
   pic=Image.open(ROOT/'local'/mode/'3d'/f'{s}.jpg');pic.thumbnail((panelW,panelH),Image.Resampling.LANCZOS)
   im.paste(pic,(16+j*panelW+(panelW-pic.width)//2,y+26))
 im.save(ROOT/('opening-3d-r2.jpg' if round2 else 'opening-3d.jpg'),quality=85,subsampling=0)
