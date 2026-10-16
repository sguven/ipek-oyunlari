# generates zeka/index.html: the jigsaw pictures and sound engine are taken from the Coloring Book (single source)
import re,os
D=os.path.dirname(os.path.abspath(__file__));B=open(os.path.join(D,'../boyama/index.html')).read().split('\n')
def block(a,b):
    i=next(k for k,l in enumerate(B) if l.startswith(a));j=next(k for k,l in enumerate(B) if k>i and l.startswith(b))
    return '\n'.join(B[i:j+1])
pics=block('const R=(x,y,w,h,rx,c)','const PMAP')
pics=re.sub(r'\bG\(','Gp(',pics).replace('const G=(points,c)','const Gp=(points,c)').replace('const Gp=(points,c)','const Gp=(points,c)')
audio=block('const VOICE={tr:null','const boop')
s=open(os.path.join(D,'src.html')).read().replace('@@PICS@@',pics).replace('@@AUDIO@@',audio)
open(os.path.join(D,'index.html'),'w').write(s)
