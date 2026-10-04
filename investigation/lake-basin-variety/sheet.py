from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import sys
label=sys.argv[1]
caption='round 3' if label == 'after' else label
root=Path('investigation/lake-basin-variety/local')
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
cols=3; w=cols*528+16; h=70+10*288
sheet=Image.new('RGB',(w,h),'#171b20'); draw=ImageDraw.Draw(sheet)
draw.text((16,12),'Lake Basin | 128 x 128 | seeds 1-30 | round 2 (left) / '+caption+' (right)',font=font,fill='white')
for seed in range(1,31):
 x=16+((seed-1)%cols)*528; y=60+((seed-1)//cols)*288
 draw.text((x,y),f'Seed {seed}    round 2                                   {caption}',font=font,fill='white')
 for k,phase in enumerate(['round2',label]):
  p=root/phase/(str(seed)+'.png')
  if p.exists(): sheet.paste(Image.open(p),(x+k*260,y+24))
out=Path('docs/sheets/lake-basin-variety-r3-128.jpg') if label == 'after' else root/(label+'-sheet.jpg')
out.parent.mkdir(parents=True,exist_ok=True)
sheet.save(out,quality=90)
print(out)
