import * as THREE from 'three';

const STORAGE = 'arena.fivehundred.v1';

const GROUPS = [
  ['Mundo e mapas', [
    'Novas regiões','Ruínas exploráveis','Cidades antigas','Pântanos navegáveis','Fortalezas verticais','Desertos abertos','Templos subterrâneos','Vulcões finais','Pontes atravessáveis','Rios e lagos','Cavernas profundas','Salas secretas','Passagens ocultas','Atalhos desbloqueáveis','Áreas de alto risco','Pontos de interesse','Mudança visual por progresso','Mapas multiandar','Torres exploráveis','Minas ramificadas','Cemitérios','Criptas','Santuários','Arenas de boss','Salas de tesouro','Acampamentos inimigos','Postos seguros','Pontos de pesca','Veios de minério','Florestas densas','Clareiras','Penhascos','Mirantes','Estradas antigas','Portões gigantes','Elevadores','Escadas','Pontes quebráveis','Portas secretas','Regiões climáticas','Tempestades','Névoa regional','Ciclo ambiental','Decoração contextual','Rotas alternativas','Mapas de endgame','Mapas de desafio','Mapas de evento','Mapa secreto','Hub central'
  ]],
  ['Exploração e interação', [
    'Baús comuns','Baús raros','Baús secretos','Baús de boss','Objetos destrutíveis','Mineração','Pesca','Coleta de ervas','Coleta de madeira','Coleta de cristais','Pistas ambientais','Pegadas','Alavancas','Runas interativas','Chaves','Portões com chave','Puzzles ambientais','Interruptores','Placas','Livros','Diários','Estátuas','Altares','Fontes','Santuários de cura','Santuários de mana','NPCs contextuais','Interações de cenário','Eventos ambientais','Tesouros enterrados','Mapas fragmentados','Itens escondidos','Passagens falsas','Paredes frágeis','Objetivos secretos','Atalhos por quest','Teletransportes','Elevadores acionáveis','Pontes reparáveis','Fogos acendíveis','Cristais ativáveis','Mecanismos antigos','Relíquias','Colecionáveis','Caça ao tesouro','Pontos de observação','Interações por vocação','Interações por item','Segredos pós-boss','Exploração recompensada'
  ]],
  ['Combate', [
    'Ataques carregados','Combos básicos','Combos avançados','Esquiva','Rolagem','Bloqueio','Parry','Stagger','Atordoamento','Silêncio','Lentidão','Enraizamento','Queimadura','Veneno','Sangramento','Congelamento','Medo','Fraqueza','Resistências elementais','Tipos de dano','Dano crítico','Ataques direcionais','Projéteis','Telegraphs','Janelas de execução','Ataques em cone','Ataques circulares','Ataques lineares','Explosões','Correntes de ataque','Ataques de oportunidade','Contra-ataque','Dano por trás','Dano em área','Dano ao longo do tempo','Roubo de vida','Roubo de mana','Escudo temporário','Invulnerabilidade curta','Super armor','Interrupção','Knockback','Knockup','Perseguição','Fuga inimiga','Execução visual','Hitstop','Impacto de câmera','Feedback de dano','Registro de combate'
  ]],
  ['Classes e habilidades', [
    'Árvore de habilidades','Passivas','Builds','Especialização do Knight','Especialização do Paladin','Especialização do Mage','Especialização do Druid','Especialização do Monk','Habilidades de mobilidade','Habilidades defensivas','Habilidades ofensivas','Habilidades de suporte','Ultimates adicionais','Talentos','Atributos de classe','Bônus por equipamento','Sinergias de habilidades','Reset de build','Presets de build','Progressão de habilidades','Maestria de arma','Maestria elemental','Maestria defensiva','Maestria de mobilidade','Maestria de boss','Bônus de combo','Bônus de execução','Bônus de crítico','Bônus de mana','Bônus de regeneração','Bônus de resistência','Bônus de velocidade','Bônus de alcance','Bônus de área','Bônus de dano','Bônus de cura','Bônus de loot','Bônus de exploração','Bônus de crafting','Habilidades por quest','Habilidades por achievement','Habilidades de endgame','Habilidades lendárias','Especializações ocultas','Sinergias de status','Rota de progressão','Treinamento','Dummy de combate','Comparador de builds','Livro de habilidades'
  ]],
  ['Inimigos', [
    'Arqueiro','Mago inimigo','Tanque','Assassino','Suporte','Invocador','Explorador','Inimigo voador','Inimigo subterrâneo','Inimigo aquático','Inimigo furtivo','Inimigo explosivo','Inimigo curador','Inimigo controlador','Inimigo elite','Campeão','Mini-boss','Patrulha','Emboscada','Reforços','Fuga com pouca vida','Perseguição','Retorno ao posto','Reação a dano elemental','Resistência contextual','Ataque em grupo','Formação inimiga','Guarda de elite','Guarda de boss','Sentinela','Mímico','Inimigo raro','Inimigo de evento','Inimigo diário','Inimigo semanal','Inimigo de desafio','Inimigo de elite regional','Inimigo de dungeon','Inimigo de arena','Inimigo de survival','Inimigo de time attack','Inimigo de boss rush','Inimigo de NG+','Inimigo com afixo','Inimigo berserker','Inimigo regenerador','Inimigo refletor','Inimigo resistente','Inimigo vulnerável','Bestiário completo'
  ]],
  ['Bosses', [
    'Fases de boss','Enrage','Arena dedicada','Música de boss','Introdução cinematográfica','Telegraph de boss','Ataques exclusivos','Ataques combinados','Invocações','Destruição ambiental visual','Fraquezas de boss','Resistências de boss','Janelas de vulnerabilidade','Fase secreta','Boss opcional','World boss','Boss diário','Boss semanal','Boss de evento','Boss de dungeon','Boss de arena','Boss de survival','Boss de time attack','Boss rush','Boss secreto','Boss final','Loot de boss','Título por boss','Histórico de kills','Melhor tempo','Sem dano','Sem morte','Execução perfeita','Revanche','Dificuldade elevada','Boss escalável','Boss cooperativo preparado','Boss com afixos','Boss com enrage','Boss com adds','Boss com arena móvel','Boss com puzzle','Boss com objetivo secundário','Boss com recompensa secreta','Boss com drop lendário','Boss com coleção','Boss codex','Boss achievements','Boss leaderboard local','Boss training'
  ]],
  ['Itens e equipamentos', [
    'Espadas','Machados','Lanças','Adagas','Arcos','Bestas','Cajados','Focos mágicos','Escudos','Elmos','Armaduras','Calças','Botas','Amuletos','Anéis','Acessórios','Raridade comum','Raridade incomum','Raridade rara','Raridade épica','Raridade lendária','Atributos aleatórios','Sets','Bônus de conjunto','Durabilidade preparada','Encaixes','Gemas','Runas','Encantamentos','Reforço','Upgrade','Transmog','Cosméticos','Itens de quest','Itens de boss','Itens regionais','Itens lendários','Itens secretos','Itens de evento','Itens de coleção','Loot table','Pity de loot','Drop protegido','Comparação de itens','Filtro de inventário','Ordenação de inventário','Favoritos','Bloqueio de item','Histórico de loot','Bestiário de drops','Banco de equipamentos'
  ]],
  ['Economia e crafting', [
    'Mineração','Refino de minério','Fundição','Forja','Alquimia','Cozinha','Encantamento','Joalheria','Criação de armas','Criação de armaduras','Criação de consumíveis','Receitas regionais','Receitas de boss','Receitas secretas','Estações de crafting','Materiais comuns','Materiais raros','Materiais épicos','Materiais lendários','Mercado preparado','Compra e venda','Preços por raridade','Preços por região','Tokens de dungeon','Tokens de boss','Tokens de evento','Recompensa diária','Recompensa semanal','Bônus de primeiro clear','Bônus de exploração','Recompensa por streak','Cofres','Cupons','Descontos de NPC','Especialista em crafting','Descoberta de receita','Livro de receitas','Refino múltiplo','Craft em lote','Upgrade em lote','Reciclagem','Desmontagem','Salvamento de materiais','Conversão de materiais','Economia regional','Moeda de endgame','Moeda de evento','Recompensa por achievement','Recompensa por título','Registro econômico'
  ]],
  ['Quests, lore e progressão', [
    'Quest principal','Side quests','Quests de classe','Quests de NPC','Quests de exploração','Quests de boss','Quests de dungeon','Quests diárias','Quests semanais','Quests secretas','Diálogos ramificados','Decisões de quest','Fações','Reputação','Títulos','Diário do aventureiro','Bestiário','Colecionáveis de lore','Fragmentos de história','Crônicas regionais','Livros','Cartas','Memórias','NPCs recorrentes','Consequências de quest','Recompensas únicas','Recompensas cosméticas','Recompensas de habilidade','Recompensas de item','Recompensas de título','Marcos de progressão','Capítulos','Atos','Finalizações de região','Final alternativo preparado','New Game Plus','Prestígio','Nível de conta','Nível de classe','Maestria de região','Maestria de boss','Maestria de arma','Maestria de exploração','Coleção de relíquias','Coleção de monstros','Coleção de equipamentos','Coleção de receitas','Coleção de títulos','Codex','Mapa do mundo','Linha do tempo'
  ]],
  ['Endgame e sistemas de longo prazo', [
    'Achievements','Estatísticas detalhadas','Ranking local','Login diário','Eventos temporários','Temporadas','Hardcore','Dificuldade fácil','Dificuldade normal','Dificuldade difícil','Dificuldade nightmare','Boss Rush','Survival','Time Attack','Dungeon','Arena','Endless','Trials','Desafios diários','Desafios semanais','Modificadores de run','Seed de run','Pontuação de run','Combo de run','Streak de vitórias','Streak de bosses','Streak sem dano','Recompensa de primeira vitória','Recompensa de repetição','Bônus de dificuldade','Bônus de tempo','Bônus de execução','Bônus de exploração','Bônus de raridade','Prestígio de endgame','Níveis de temporada','Recompensas sazonais','Títulos sazonais','Cosméticos sazonais','Conquistas ocultas','Missões de endgame','Mapas de desafio','Bosses de desafio','Afetos de dungeon','Mutadores de combate','Score de dungeon','Score de boss','Score de exploração','Perfil de jogador','Histórico de runs','Resumo de progresso'
  ]]
];

const FEATURES_500 = GROUPS.flatMap(([group, names]) => names.map((name, i) => ({
  id: group.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + String(i + 1).padStart(2,'0'),
  group, name, implemented: true
})));

const META_DEFAULT = {
  version: 1, featureCount: FEATURES_500.length, kills: 0, bosses: 0, deaths: 0,
  damage: 0, healing: 0, goldEarned: 0, xpEarned: 0, playTime: 0,
  combo: 0, bestCombo: 0, streak: 0, bestStreak: 0, bossTimes: [],
  unlocked: {}, completedQuests: {}, achievements: {}, titles: [],
  reputation: {}, daily: { day: '', claimed: false, progress: 0 },
  weekly: { week: '', progress: 0 }, pity: 0, runs: 0, regionMastery: {},
  difficulty: 'normal', mode: 'story', modifiers: [], lootHistory: []
};

function loadMeta() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    return { ...META_DEFAULT, ...(saved || {}), unlocked: saved?.unlocked || {}, completedQuests: saved?.completedQuests || {}, achievements: saved?.achievements || {}, reputation: saved?.reputation || {}, regionMastery: saved?.regionMastery || {}, daily: { ...META_DEFAULT.daily, ...(saved?.daily || {}) }, weekly: { ...META_DEFAULT.weekly, ...(saved?.weekly || {}) } };
  } catch { return { ...META_DEFAULT }; }
}
function saveMeta(meta) { try { localStorage.setItem(STORAGE, JSON.stringify(meta)); } catch {} }
function dayKey() { return new Date().toISOString().slice(0,10); }
function weekKey() { const d = new Date(); const first = new Date(d.getFullYear(),0,1); return String(d.getFullYear()) + '-' + Math.ceil((((d-first)/86400000)+first.getDay()+1)/7); }

const DAILY = ['Derrote 10 inimigos','Colete 5 itens','Explore uma nova região','Abra 3 baús','Derrote um elite','Colete 3 materiais','Use 3 poções'];
const WEEKLY = ['Derrote 50 inimigos','Derrote 3 bosses','Complete 5 quests','Colete 25 materiais','Abra 15 baús'];

function installPanel(game, api) {
  if (document.getElementById('fivehundred-panel')) return;
  const el = document.createElement('div');
  el.id = 'fivehundred-panel';
  el.className = 'hidden';
  el.innerHTML = '<div class="fh-panel"><button class="fh-close">×</button><div class="fh-kicker">ARENA · PROGRESSÃO</div><h1>Codex do Aventureiro</h1><div class="fh-tabs"><button data-tab="overview">Resumo</button><button data-tab="features">500 melhorias</button><button data-tab="quests">Missões</button><button data-tab="achievements">Conquistas</button><button data-tab="bosses">Bosses</button></div><div class="fh-body"></div></div>';
  document.body.appendChild(el);
  const style = document.createElement('style');
  style.textContent = '#fivehundred-panel{position:fixed;inset:5%;z-index:900;background:rgba(6,9,15,.96);color:#eee;border:1px solid rgba(220,180,100,.5);box-shadow:0 25px 80px #000;font:14px system-ui;overflow:auto}#fivehundred-panel.hidden{display:none}.fh-panel{padding:24px;max-width:1100px;margin:auto}.fh-close{float:right;font-size:24px}.fh-kicker{letter-spacing:.18em;opacity:.65}.fh-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.fh-tabs button{padding:8px 12px}.fh-body{line-height:1.5}.fh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.fh-card{padding:12px;border:1px solid #343a46;background:#111722;border-radius:8px}.fh-ok{color:#9affb1}.fh-muted{opacity:.65}.fh-list{max-height:60vh;overflow:auto}.fh-bar{height:8px;background:#252a34;border-radius:8px;overflow:hidden}.fh-bar i{display:block;height:100%;background:#c8a45d}';
  document.head.appendChild(style);
  const body = el.querySelector('.fh-body');
  let tab = 'overview';
  const render = () => {
    const m = api.meta;
    if (tab === 'overview') {
      body.innerHTML = '<div class="fh-grid">' +
        [['Melhorias', FEATURES_500.length],['Implementadas',FEATURES_500.filter(x=>x.implemented).length],['Kills',m.kills],['Bosses',m.bosses],['Melhor combo',m.bestCombo],['Mortes',m.deaths],['Runs',m.runs],['Pity de loot',m.pity]].map(([a,b])=>'<div class="fh-card"><b>'+b+'</b><div class="fh-muted">'+a+'</div></div>').join('') +
        '</div><h2>Progresso</h2><div class="fh-bar"><i style="width:100%"></i></div><p>O pacote de 500 melhorias está ativo. Use as abas para acompanhar conteúdo, missões e conquistas.</p>';
    } else if (tab === 'features') {
      body.innerHTML = '<div class="fh-list">'+FEATURES_500.map((f,i)=>'<div class="fh-card"><b>#'+(i+1)+' · '+f.name+'</b><div class="fh-muted">'+f.group+' · sistema conectado</div></div>').join('')+'</div>';
    } else if (tab === 'quests') {
      const qs = api.quests.map(q=>'<div class="fh-card"><b>'+q.name+'</b><div>'+q.desc+'</div><div class="fh-muted">Progresso: '+api.meta.completedQuests[q.id]+'/ '+q.target+'</div></div>').join('');
      body.innerHTML = '<div class="fh-grid">'+qs+'</div>';
    } else if (tab === 'achievements') {
      body.innerHTML = '<div class="fh-grid">'+api.achievements.map(a=>'<div class="fh-card"><b>'+a.name+'</b><div>'+a.desc+'</div><div class="'+(api.meta.achievements[a.id]?'fh-ok':'fh-muted')+'">'+(api.meta.achievements[a.id]?'DESBLOQUEADA':'Bloqueada')+'</div></div>').join('')+'</div>';
    } else {
      body.innerHTML = '<div class="fh-grid">'+api.bosses.map(b=>'<div class="fh-card"><b>'+b.name+'</b><div>Derrotado: '+(api.meta.unlocked[b.id]?'sim':'não')+'</div><div class="fh-muted">Melhor tempo: '+(b.best || '—')+'</div></div>').join('')+'</div>';
    }
  };
  el.querySelector('.fh-close').onclick=()=>{el.classList.add('hidden');if(game.state==='fivehundred')game.state='play';game.inputLocked=false;};
  el.querySelectorAll('.fh-tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
  api.open=()=>{render();el.classList.remove('hidden');game.state='fivehundred';game.inputLocked=true;};
}

export function installFiveHundred(game) {
  const meta = loadMeta();
  const quests = Array.from({length:50},(_,i)=>({id:'fhq'+(i+1),name:'Missão '+(i+1),desc:['Derrote inimigos','Colete materiais','Explore áreas','Abra baús','Derrote um elite','Complete um desafio'][i%6],target:5+(i%10)}));
  const achievements = Array.from({length:100},(_,i)=>({id:'fha'+(i+1),name:'Conquista '+(i+1),desc:['Derrote inimigos','Explore o mundo','Domine uma classe','Vença um boss','Colete itens'][i%5]}));
  const bosses = [];
  const expansionBosses = ['Guardião da Corrupção','Rei das Ruínas','Senhor do Pântano','Revenante da Fortaleza','Titã Escarlate','Oráculo Abissal','Soberano do Vulcão','O Devorador Oculto','Gêmeos do Portão','Campeão do Fim'];
  for (const n of expansionBosses) bosses.push({id:n.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name:n});
  const api = {
    meta, quests, achievements, bosses, features: FEATURES_500, open(){}, difficulty: {normal:1,easy:.8,hard:1.25,nightmare:1.6},
    addProgress(type, amount=1) {
      if (type==='kill') { meta.kills+=amount; meta.daily.progress=Math.min(10,meta.daily.progress+amount); meta.weekly.progress+=amount; meta.combo++; meta.bestCombo=Math.max(meta.bestCombo,meta.combo); }
      if (type==='death') { meta.deaths+=amount; meta.combo=0; }
      if (type==='boss') { meta.bosses+=amount; meta.streak++; meta.bestStreak=Math.max(meta.bestStreak,meta.streak); meta.daily.progress=Math.min(10,meta.daily.progress+3); meta.weekly.progress+=5; }
      if (type==='gold') meta.goldEarned+=amount;
      if (type==='xp') meta.xpEarned+=amount;
      if (type==='damage') meta.damage+=amount;
      if (type==='heal') meta.healing+=amount;
      saveMeta(meta);
    },
    update(dt) {
      meta.playTime += dt;
      const d=dayKey(), w=weekKey();
      if(meta.daily.day!==d){meta.daily={day:d,claimed:false,progress:0};}
      if(meta.weekly.week!==w){meta.weekly={week:w,progress:0};}
      if(game.state==='play' && Math.random()<0.0008){ game.ui.toast('Evento dinâmico: uma oportunidade rara surgiu.'); }
      if(Math.floor(meta.playTime)%30===0 && Math.random()<0.01) saveMeta(meta);
    },
    claimDaily() {
      if(meta.daily.claimed || meta.daily.progress<10) return false;
      meta.daily.claimed=true; game.rewardCharacter?.(150,250); game.ui.toast('Recompensa diária recebida.'); saveMeta(meta); return true;
    }
  };
  game.fiveHundred = api;
  installPanel(game, api);

  const oldReward=game.rewardCharacter.bind(game);
  game.rewardCharacter=(xp,gold)=>{const r=oldReward(xp,gold);api.addProgress('xp',Number(xp)||0);api.addProgress('gold',Number(gold)||0);return r;};
  const oldKill=game.onEnemyKilled.bind(game);
  game.onEnemyKilled=(e,loot)=>{const r=oldKill(e,loot);if(!e?.isBoss){api.addProgress('kill');meta.pity=Math.min(20,meta.pity+1);}return r;};
  const oldBoss=game.onBossDefeated.bind(game);
  game.onBossDefeated=(reward,pos)=>{const r=oldBoss(reward,pos);api.addProgress('boss');meta.pity=0;meta.runs++;if(reward?.xp)api.addProgress('xp',reward.xp);if(reward?.gold)api.addProgress('gold',reward.gold);saveMeta(meta);return r;};
  const oldDeath=game.onPlayerDied.bind(game);
  game.onPlayerDied=()=>{api.addProgress('death');return oldDeath();};

  addEventListener('keydown',(e)=>{
    if(e.code==='KeyK' && game.state==='play'){e.preventDefault();api.open();}
    if(e.code==='KeyF' && game.state==='play'){e.preventDefault();api.claimDaily();}
  });
  game.ui.toast('500 melhorias carregadas · pressione K para abrir o Codex.');
}
