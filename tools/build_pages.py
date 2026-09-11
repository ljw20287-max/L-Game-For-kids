# 用模板生成各物件页面，并给所有本地脚本加上 ?v=修改时间（改了 js 后手机/浏览器不会拿旧缓存）：python3 tools/build_pages.py
import hashlib,json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parent.parent
TPL=(ROOT/'tools/page-template.html').read_text(encoding='utf-8')
# 配音表同时写一份 js：直接双击 html（file://）时 fetch 拿不到 json，会退回系统机器音
import json
LINES=json.loads((ROOT/'voice/lines.json').read_text(encoding='utf-8'))
(ROOT/'voice/lines.js').write_text('window.VOICE_LINES='+json.dumps(LINES,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
WANTED_VOICE_IDS=set(LINES.values())|{'sample'}
PAGES={'car':'汽车','washer':'洗衣机','elevator':'电梯','excavator':'挖掘机','jet':'飞机','dozer':'推土机','crane':'吊车','mixer':'搅拌车','roller':'压路机','loader':'装载机','dump':'翻斗车','firetruck':'消防车','garbage':'垃圾车','towercrane':'塔吊','pumptruck':'水泥泵车','grader':'平地机','piler':'打桩机','forklift':'叉车','sweeper':'洒水车','towtruck':'清障车'}
def stamp(html):
    def sub(m):
        src=m.group(1).split('?')[0];f=ROOT/src
        return f'src="{src}?v={int(f.stat().st_mtime)}"' if f.exists() else m.group(0)
    return re.sub(r'src="([^"]+\.js)(?:\?v=\d+)?"',sub,html)

PWA_ROOT_FILES=['index.html','404.html','LICENSE','manifest.json','sw.js','pwa-assets.js']
PWA_DIRS=['icons','js','lib','pages','scenes','voice']
def build_pwa_assets():
    paths=[]
    for name in PWA_ROOT_FILES:
        if (ROOT/name).is_file() or name=='pwa-assets.js':
            paths.append(name)
    for dirname in PWA_DIRS:
        base=ROOT/dirname
        if not base.exists():
            continue
        for f in sorted(base.rglob('*')):
            if not f.is_file() or f.suffix in {'.pyc'}:
                continue
            if dirname=='voice' and f.suffix=='.mp3' and f.stem not in WANTED_VOICE_IDS:
                continue
            paths.append(f.relative_to(ROOT).as_posix())
    paths=sorted(set(paths))
    digest=hashlib.sha256()
    for rel in paths:
        if rel=='pwa-assets.js':
            continue
        f=ROOT/rel
        digest.update(rel.encode('utf-8')+b'\0')
        digest.update(f.read_bytes())
        digest.update(b'\0')
    version=digest.hexdigest()[:16]
    (ROOT/'pwa-assets.js').write_text(
        "self.PWA_CACHE_VERSION="+json.dumps(version)+";\n"
        "self.PWA_ASSETS="+json.dumps(paths,ensure_ascii=False,separators=(',',':'))+";\n",
        encoding='utf-8'
    )
    print('wrote','pwa-assets.js',len(paths),'assets',version)

for sid,title in PAGES.items():
    (ROOT/'pages').mkdir(exist_ok=True)
    (ROOT/'pages'/f'{sid}.html').write_text(stamp(TPL.replace('__TITLE__',title).replace('__ID__',sid)),encoding='utf-8')
    print('wrote','pages/'+sid+'.html')
idx=ROOT/'index.html';idx.write_text(stamp(idx.read_text(encoding='utf-8')),encoding='utf-8');print('stamped index.html')
build_pwa_assets()
