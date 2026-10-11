import re, sys, os

D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(D)

def parts(path):
    s = open(path, encoding='utf-8').read()
    css = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
    dom = s[s.index('</style>') + 8: s.index('<script>')]
    js = re.search(r'<script>(.*)</script>', s, re.S).group(1)
    return css, dom, js

def scope_css(css, pfx):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = []
    i = 0
    n = len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        sel = css[i:j].strip()
        # matching brace
        depth = 0
        k = j
        while k < n:
            if css[k] == '{':
                depth += 1
            elif css[k] == '}':
                depth -= 1
                if depth == 0:
                    break
            k += 1
        body = css[j + 1:k]
        if sel.startswith('@media') or sel.startswith('@supports'):
            out.append(sel + '{' + scope_css(body, pfx) + '}')
        elif sel.startswith('@'):
            out.append(sel + '{' + body + '}')
        else:
            sels = []
            for s in sel.split(','):
                s = s.strip()
                if s in (':root', 'body', 'html'):
                    sels.append(pfx)
                elif s == '*':
                    sels.append(pfx + ' *')
                else:
                    sels.append(pfx + ' ' + s)
            out.append(','.join(sels) + '{' + body + '}')
        i = k + 1
    return '\n'.join(out)

def prefix_dom(dom, p):
    dom = re.sub(r'\bid="([^"]+)"', lambda m: f'id="{p}-{m.group(1)}"', dom)
    dom = re.sub(r'\bfor="([^"]+)"', lambda m: f'for="{p}-{m.group(1)}"', dom)
    dom = re.sub(r'aria-labelledby="([^"]+)"', lambda m: f'aria-labelledby="{p}-{m.group(1)}"', dom)
    dom = dom.replace(f'<textarea id="{p}-rBox" readonly></textarea>',
                      f'<textarea id="{p}-rBox" readonly></textarea>\n          <button type="button" class="primary" data-return>Retour au récit</button>')
    assert 'data-return' in dom, p
    return dom

def must(s, old, new, count=1):
    c = s.count(old)
    if c < 1:
        sys.exit(f'PATCH NOT FOUND: {old[:80]}')
    return s.replace(old, new) if count == 0 else s.replace(old, new, count)

GATE = 'function frame(now){if(window.__ENG!=="%s"){requestAnimationFrame(frame);return;}'
TITLE = "(window.__CFG&&window.__CFG.%s&&window.__CFG.%s.title||'%s')"

# ---------- Bataille spatiale ----------
css, dom, js = parts(os.path.join(SRC, 'kessaria.html'))
sp_css = scope_css(css, '#eng-space')
sp_dom = prefix_dom(dom, 'sp')
js = re.sub(r"getElementById\('([^']+)'\)", lambda m: f"getElementById('sp-{m.group(1)}')", js)
js = must(js, 'function frame(now){', GATE % 'space')
js = must(js, "  initEnemyHull=ships.filter(s=>s.side==='e')", """  if(window.__CFG&&window.__CFG.space){const C=window.__CFG.space;ships=[];
    const PS=[[250,430],[210,650],[330,230],[380,560],[420,330],[440,460],[160,300],[150,560]];
    (C.player||[]).slice(0,8).forEach((u,i)=>{const s=mkShip('p',u.type,u.name,PS[i][0],PS[i][1],!!u.flag);if(u.hull!=null&&u.hull<1)s.hull=Math.max(1,Math.round(s.hullMax*u.hull));if(u.pilot)s.ace=Math.max(-.1,Math.min(.2,(u.pilot-10)*.025));s.style=u.style||C.pStyle||'imp';const p=settle(s,s.x,s.y);s.x=p.x;s.y=p.y;ships.push(s);});
    if(!ships.some(s=>s.flag)&&ships[0])ships[0].flag=true;
    const en=(C.enemy||[]).slice(0,8),n=en.length;
    en.forEach((u,i)=>{const y=n===1?430:140+i*(560/Math.max(1,n-1));const x=(u.type==='cruiser'?1400:u.type==='frigate'?1320:1240)+rnd(-30,30);const s=mkShip('e',u.type,u.name,x,y);s.style=u.style||C.eStyle||'reb';const p=settle(s,s.x,s.y);s.x=p.x;s.y=p.y;ships.push(s);});
    comp.length=0;en.forEach(u=>comp.push(u.type));
  }
  initEnemyHull=ships.filter(s=>s.side==='e')""")
js = must(js, "endBattle(false,'L’Inexorable a été détruit. Privée de son vaisseau amiral, la flotte du secteur se replie en désordre.')",
          "endBattle(false,`${flag.name} a été détruit. Privée de son vaisseau amiral, la flotte se replie en désordre.`)")
js = must(js, "'La flotte insurgée a été anéantie au-dessus de Kessaria IV.'", "'La flotte ennemie a été anéantie.'")
js = must(js, "L’orbite de Kessaria IV est à vous.", "L’espace est à vous.")
js = must(js, "vaisseaux insurgés sortent de l’hyperespace au-dessus de Kessaria IV.", "vaisseaux ennemis sortent de l’hyperespace.")
js = must(js, "`BATAILLE DE KESSARIA IV — ", "`${" + (TITLE % ('space', 'space', 'Bataille spatiale')) + ".toUpperCase()} — ")
js = must(js, "document.getElementById('sp-over').hidden=false;\n  renderUI();\n}",
          "document.getElementById('sp-over').hidden=false;\n  window.__engineEnd&&window.__engineEnd('space',{win,text,report:lines.join('\\n'),lost:pl.filter(s=>!s.alive).map(s=>s.name),fled,state:pl.map(s=>({name:s.name,alive:s.alive,hull:s.alive?s.hull/s.hullMax:0}))});\n  renderUI();\n}")
js = must(js, "newBattle();\nrequestAnimationFrame(frame);\n})();", """newBattle();
requestAnimationFrame(frame);
window.ENGINES=window.ENGINES||{};
window.ENGINES.space={start(){const C=window.__CFG&&window.__CFG.space;const sec=document.getElementById('eng-space');
  SCENE=SCENES[C&&C.decor]||SCENES.planete;canFlee=!!(C&&C.canFlee);
  if(C){sec.querySelector('h1').textContent=C.title||'Bataille spatiale';sec.querySelector('.eyebrow').textContent='Bataille spatiale';
    const fl=(C.player||[]).find(u=>u.flag)||(C.player||[])[0];sec.querySelector('.brief').textContent=C.solo?`Abattez ou faites fuir vos poursuivants. Si ${fl?fl.name:'votre vaisseau'} est détruit, c’est perdu. Dès le tour 3, vous pouvez sauter en hyperespace.`:`Détruisez la flotte ennemie ou forcez-la à fuir. Si ${fl?fl.name:'votre vaisseau amiral'} tombe, la bataille est perdue.${C.canFlee?' Dès le tour 3, vous pouvez sauter en hyperespace.':''}`;}
  newBattle();resize();}};
})();""")
sp_js = js

# ---------- Bataille terrestre ----------
css, dom, js = parts(os.path.join(SRC, 'assaut-kessaria.html'))
gr_css = scope_css(css, '#eng-ground')
gr_dom = prefix_dom(dom, 'gr')
js = re.sub(r"getElementById\('([^']+)'\)", lambda m: f"getElementById('gr-{m.group(1)}')", js)
js = must(js, 'function frame(now){', GATE % 'ground')
js = must(js, "  initEnemy=units.filter(u=>u.side==='e'&&!u.T.static)", """  if(window.__CFG&&window.__CFG.ground){const C=window.__CFG.ground;
    units=units.filter(u=>u.side==='e'&&u.T.static).slice(0,C.turrets==null?1:C.turrets);
    const PP=[[170,500],[300,370],[300,640],[230,250],[90,690],[330,505],[200,800],[400,220]];
    const pl=[{type:'cmd',name:C.commander||'Commandement'},...(C.player||[]).filter(u=>u.type!=='cmd').slice(0,7)];
    pl.forEach((u,i)=>{const m=mkUnit('p',u.type,u.name,PP[i][0],PP[i][1],i===0);if(u.hp!=null&&u.hp<1)m.hp=Math.max(1,Math.round(m.hpMax*u.hp));const p=settle(m,m.x,m.y);m.x=p.x;m.y=p.y;units.push(m);});
    (C.enemy||[]).slice(0,6).forEach((t,i)=>{const guard=MODE==='assaut'&&i%2===0;const x=guard?OBJ.x+rnd(-170,-60):rnd(1000,1200),y=guard?OBJ.y+rnd(-200,200):rnd(120,880);const u=mkUnit('e',t.type,t.name,x,y);u.role=guard?'guard':'assault';const p=settle(u,u.x,u.y);u.x=p.x;u.y=p.y;units.push(u);});
    orbital=C.orbital?1:0;
  }
  initEnemy=units.filter(u=>u.side==='e'&&!u.T.static)""")
js = must(js, "  sel=units[0];\n  log(`Les barges ont touché le sol. ${comp.length+tur} positions insurgées repérées autour du générateur.`,'kill');",
          "  sel=units.find(u=>u.side==='p');\n  log(`Les barges ont touché le sol. ${units.filter(u=>u.side==='e').length} positions ennemies repérées autour du générateur.`,'kill');")
js = must(js, "'L’Inexorable ouvre le feu depuis l’orbite.'", "'Votre flotte ouvre le feu depuis l’orbite.'")
js = must(js, "`ASSAUT SUR KESSARIA IV — ", "`${" + (TITLE % ('ground', 'ground', 'Bataille terrestre')) + ".toUpperCase()} — ")
js = must(js, "  document.getElementById('gr-over').hidden=false;\n  renderUI();\n}",
          "  document.getElementById('gr-over').hidden=false;\n  window.__engineEnd&&window.__engineEnd('ground',{win,text,report:lines.join('\\n'),lost:pl.filter(u=>!u.alive&&u.type!=='cmd').map(u=>u.name),state:pl.map(u=>({name:u.name,type:u.type,alive:u.alive,hp:u.alive?u.hp/u.hpMax:0}))});\n  renderUI();\n}")
js = must(js, "newBattle();\nrequestAnimationFrame(frame);\n})();", """newBattle();
requestAnimationFrame(frame);
window.ENGINES=window.ENGINES||{};
window.ENGINES.ground={start(){const C=window.__CFG&&window.__CFG.ground;const sec=document.getElementById('eng-ground');
  BIOME=BIOMES[C&&C.terrain]||BIOMES.tempere;MODE=C&&['assaut','elimination','defense'].includes(C.mode)?C.mode:'assaut';HOLD=C&&C.hold||6;
  if(C){sec.querySelector('h1').textContent=C.title||'Bataille terrestre';sec.querySelector('.eyebrow').textContent='Bataille terrestre';
    const cmd=`Si l’escouade de ${C.commander||'commandement'} tombe, la bataille est perdue.`;
    sec.querySelector('.brief').textContent=MODE==='defense'?`Tenez la position jusqu’au tour ${HOLD} face à un ennemi plus nombreux. ${cmd}`:MODE==='elimination'?`Anéantissez l’ennemi ou mettez-le en déroute. ${cmd}`:`Anéantissez l’ennemi ou tenez le générateur deux tours d’affilée. ${cmd}`;}
  newBattle();resize();}};
})();""")
gr_js = js

# ---------- Arène (combat rapproché) ----------
css, dom, js = parts(os.path.join(SRC, 'arene.html'))
css = css.replace('canvas#cv', 'canvas#ar-cv')
ar_css = scope_css(css, '#eng-duel')
ar_dom = prefix_dom(dom, 'ar')
js = re.sub(r"getElementById\('([^']+)'\)", lambda m: f"getElementById('ar-{m.group(1)}')", js)
js = must(js, "const $=id=>document.getElementById(id);", "const $=id=>document.getElementById('ar-'+id);")
js = must(js, "document.querySelector('#setupView')", "document.querySelector('#ar-setupView')")
js = must(js, "document.querySelectorAll('#techs input:checked')", "document.querySelectorAll('#ar-techs input:checked')")
js = must(js, 'function frame(now){', GATE % 'duel')
js = must(js, "debout sur le toit détrempé.`", "debout.`")
js = must(js, "sous la pluie de Nar Shaddaa.`", "au combat.`")
js = must(js, "`COMBAT SUR LES TOITS DE NAR SHADDAA — ", "`${" + (TITLE % ('duel', 'duel', 'Combat')) + ".toUpperCase()} — ")
js = must(js, "  setTimeout(()=>{$('over').hidden=false;},900);log(text,'kill');renderCombat();",
          "  setTimeout(()=>{$('over').hidden=false;},900);log(text,'kill');renderCombat();\n  window.__engineEnd&&window.__engineEnd('duel',{win,text,report:lines.join('\\n'),lost:fighters.filter(f=>f.side==='p'&&!f.alive).map(f=>f.name),state:fighters.filter(f=>f.side==='p').map(f=>({name:f.name,hero:!!f.hero,alive:f.alive,pv:Math.max(0,f.pv),pvMax:f.pvMax}))});")
js = must(js, "showView('setup');\nrequestAnimationFrame(frame);\n})();", """showView('setup');
requestAnimationFrame(frame);
window.ENGINES=window.ENGINES||{};
window.ENGINES.duel={start(){const C=window.__CFG&&window.__CFG.duel;const sec=document.getElementById('eng-duel');
    if(!C)return;sec.querySelector('h1').textContent=C.title||'Combat';sec.querySelector('.eyebrow').textContent='Combat rapproché';
    DSC=DUEL_SCENES[C.decor]?C.decor:'toits';renderBG();
    roster={p:C.p.map(f=>({...clone(f),side:'p'})),e:C.e.map(f=>({...clone(f),side:'e'}))};startCombat();resize();},
  preview(canvas,get){let f=null,last='';const g=canvas.getContext('2d');
    function loop(now){if(!canvas.isConnected)return;let fc=null;try{fc=get();}catch(e){}
      if(fc){const k=JSON.stringify(fc);if(k!==last){last=k;f=mkFighter({...clone(fc),side:'p'});f.dir=1;f.x=0;f.zOff=0;f.depth=1;}}
      if(f){updateAnim([f],now);const gr=g.createLinearGradient(0,0,0,canvas.height);gr.addColorStop(0,'#1a0a1c');gr.addColorStop(1,'#3a1024');g.fillStyle=gr;g.fillRect(0,0,canvas.width,canvas.height);
        g.fillStyle='#120a10';g.fillRect(0,canvas.height-80,canvas.width,80);g.fillStyle='rgba(255,90,140,.35)';g.fillRect(0,canvas.height-80,canvas.width,1.5);
        drawFighter(g,f,now,canvas.width/2-10,canvas.height-80,1.6*(f.look.h||1));}
      requestAnimationFrame(loop);}
    requestAnimationFrame(loop);}};
})();""")
ar_js = js

def section(name, dom):
    return (f'<section id="eng-{name}" class="engine" hidden>\n'
            f'<div class="engbar"><span>Combat en cours · le résultat reviendra dans le récit</span></div>\n'
            f'{dom}\n</section>\n')

shell = open(os.path.join(D, 'shell.html'), encoding='utf-8').read()
shell = must(shell, '/*ENGINE_CSS*/', sp_css + '\n' + gr_css + '\n' + ar_css)
shell = must(shell, '<!--ENGINES-->', section('space', sp_dom) + section('ground', gr_dom) + section('duel', ar_dom))
shell = must(shell, '/*ENGINE_JS*/', sp_js + '\n' + gr_js + '\n' + ar_js)
out = os.path.join(SRC, 'chroniques.html')
open(out, 'w', encoding='utf-8').write(shell)
print('OK', out, len(shell))
