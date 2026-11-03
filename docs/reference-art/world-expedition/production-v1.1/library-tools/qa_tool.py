"""READ-ONLY QA metrics tool. Never writes next to inputs; only writes to the --out dir given."""
import sys,json,os,hashlib
import numpy as np,cv2
from PIL import Image,ImageDraw,ImageFont
from scipy import ndimage as ndi
PARCH=(247,233,205);NAVY=(14,32,64);GRAY=(128,128,128)
def chk(sz,c=8):
    y,x=np.mgrid[:sz[1],:sz[0]];m=((x//c+y//c)%2)[...,None]
    return Image.fromarray(np.where(m,np.uint8(235),np.uint8(190)).repeat(3,2).astype(np.uint8)).convert('RGBA')
def four_bg(im,z=3):
    im=im.resize((im.width*z,im.height*z),Image.LANCZOS);tiles=[]
    for lab,bg in (('checkerboard',None),('parchment',PARCH),('dark navy',NAVY),('mid gray',GRAY)):
        b=chk(im.size) if bg is None else Image.new('RGBA',im.size,bg+(255,));b.alpha_composite(im)
        t=Image.new('RGB',(im.width,im.height+18),'white');t.paste(b.convert('RGB'),(0,18));ImageDraw.Draw(t).text((3,3),lab,fill=(0,0,0),font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',11));tiles.append(t)
    P=Image.new('RGB',(sum(t.width for t in tiles)+18,tiles[0].height),'white');x=0
    for t in tiles:P.paste(t,(x,0));x+=t.width+6
    return P
def analyze(path):
    im=Image.open(path).convert('RGBA');a=np.array(im);al=a[...,3].astype(np.float32)/255;rgb=a[...,:3].astype(np.float32);H,W=al.shape
    r={'file':path,'size':[W,H],'mode_ok':Image.open(path).mode=='RGBA'}
    b=2
    r['border_opaque']={'left':float((al[:,:b]>0.3).mean()),'right':float((al[:,-b:]>0.3).mean()),'top':float((al[:b]>0.3).mean()),'bottom':float((al[-b:]>0.3).mean())}
    l,n=ndi.label(al>0.1,structure=np.ones((3,3)));sz=ndi.sum(al>0.1,l,range(1,n+1)) if n else []
    r['components']=sorted([int(s) for s in sz],reverse=True)[:6]
    core=al>0.5;depth=ndi.distance_transform_edt(core);edge=core&(depth<=2.0);ref=depth>=4.5
    if edge.any() and ref.any():
        idx=ndi.distance_transform_edt(~ref,return_indices=True)[1];refc=rgb[idx[0],idx[1]]
        lum=lambda x:x@np.array([.299,.587,.114])
        dL=lum(rgb)-lum(refc);dist=np.linalg.norm(rgb-np.array(PARCH,np.float32),axis=2)
        r['edge_brighter_frac']=float(((dL>22)&edge).sum()/edge.sum())
        r['edge_parchlike_frac']=float(((dist<22)&edge).sum()/edge.sum())
    else:r['edge_brighter_frac']=r['edge_parchlike_frac']=None
    semi=((al>0.02)&(al<0.25));r['faint_alpha_frac']=float(semi.sum()/max(1,(al>0.02).sum()))
    s=min(109/W,196/H);r['cell_fit']={'scale':round(s,3),'placed_w':round(W*s),'placed_h':round(H*s),'fits_109':bool(round(W*s)<=109),'fits_height':bool(round(H*s)<=196)}
    # near-white fringe check on navy: pixels with alpha<0.6 that are lighter than 200
    lightfr=((al>0.05)&(al<0.6)&(rgb.mean(2)>215));r['light_fringe_px']=int(lightfr.sum())
    return r
if __name__=='__main__':
    out=sys.argv[1];os.makedirs(out,exist_ok=True);res=[]
    for p in sys.argv[2:]:
        r=analyze(p);nm=os.path.basename(os.path.dirname(p))+'_'+os.path.basename(p)
        four_bg(Image.open(p).convert('RGBA')).save(os.path.join(out,nm.replace('.png','_4bg.png')));res.append(r)
    json.dump(res,open(os.path.join(out,'qa_metrics.json'),'w'),indent=1)
