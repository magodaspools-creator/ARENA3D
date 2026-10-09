const SUPABASE_URL = 'https://qnfqeprgvmyapgagmcqf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RmJoMDzSSqC46U1nNZR1XA_--7pm3y8';
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export async function installAccountMenu(game) {
  let supabase = window.malUpadosSupabase || null;
  let saveBusy = false;

  async function client() {
    if (supabase?.auth?.getSession) return supabase;
    const { createClient } = await import(SUPABASE_CDN);
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    window.malUpadosSupabase = supabase;
    game.supabaseClient = supabase;
    return supabase;
  }

  function openDialog(title, description) {
    const dialog = document.getElementById('menu-dialog');
    const custom = document.getElementById('menu-dialog-custom');
    if (!dialog || !custom) throw new Error('O painel da conta não está disponível.');
    document.getElementById('menu-dialog-title').textContent = title;
    document.getElementById('menu-dialog-description').textContent = description;
    document.getElementById('menu-settings-options')?.classList.add('hidden');
    document.getElementById('menu-dialog-confirm')?.classList.add('hidden');
    custom.classList.remove('hidden');
    custom.innerHTML = '';
    dialog.classList.remove('hidden');
    return custom;
  }

  function closeDialog() {
    game.closeMenuDialog?.();
  }

  function renderAuth(mode = 'login', intent = 'new') {
    const custom = openDialog(mode === 'signup' ? 'Criar conta Mal Upados' : 'Entrar na conta', 'Use a mesma conta do site Mal Upados para manter seus personagens vinculados.');
    custom.innerHTML = `<div class="menu-auth-tabs"><button type="button" data-mode="login" class="${mode === 'login' ? 'active' : ''}">Entrar</button><button type="button" data-mode="signup" class="${mode === 'signup' ? 'active' : ''}">Criar conta</button></div>
      <form id="menu-auth-form" class="menu-auth-form">
        ${mode === 'signup' ? '<label>Nome de usuário<input name="username" minlength="3" maxlength="24" autocomplete="username" required placeholder="Nome que aparece no site"></label>' : ''}
        <label>${mode === 'signup' ? 'E-mail' : 'E-mail ou nome de usuário'}<input name="identifier" type="${mode === 'signup' ? 'email' : 'text'}" autocomplete="${mode === 'signup' ? 'email' : 'username'}" required placeholder="${mode === 'signup' ? 'voce@email.com' : 'E-mail ou nome de usuário'}"></label>
        <label>Senha<input name="password" type="password" minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required placeholder="Mínimo de 6 caracteres"></label>
        ${mode === 'signup' ? '<label>Confirmar senha<input name="confirmPassword" type="password" minlength="6" autocomplete="new-password" required></label>' : ''}
        <p class="menu-auth-feedback" id="menu-auth-feedback" role="status"></p>
        <button class="main-menu-btn primary" type="submit" id="menu-auth-submit"><span>${mode === 'signup' ? 'Criar conta' : 'Entrar'}</span><b>›</b></button>
      </form>`;
    custom.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => renderAuth(button.dataset.mode, intent)));
    custom.querySelector('#menu-auth-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = custom.querySelector('#menu-auth-feedback');
      const submit = custom.querySelector('#menu-auth-submit');
      const identifier = form.elements.identifier.value.trim();
      const password = form.elements.password.value;
      submit.disabled = true;
      feedback.textContent = 'Conectando...';
      feedback.className = 'menu-auth-feedback';
      try {
        const sb = await client();
        if (mode === 'signup') {
          const username = form.elements.username.value.trim();
          if (password !== form.elements.confirmPassword.value) throw new Error('As senhas não conferem.');
          if (username.length < 3 || !/^[\p{L}\p{N}_ -]+$/u.test(username)) throw new Error('Nome de usuário inválido. Use letras, números, espaços, _ ou -.');
          const result = await sb.auth.signUp({ email: identifier, password, options: { data: { username } } });
          if (result.error) throw result.error;
          if (!result.data.session) {
            feedback.textContent = 'Conta criada. Confirme o e-mail recebido e depois entre por aqui.';
            submit.disabled = false;
            return;
          }
        } else if (identifier.includes('@')) {
          const result = await sb.auth.signInWithPassword({ email: identifier, password });
          if (result.error) throw result.error;
        } else {
          const response = await fetch(SUPABASE_URL + '/functions/v1/login-username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
            body: JSON.stringify({ username: identifier, password })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.session?.access_token || !payload.session?.refresh_token) {
            throw new Error(payload.error || payload.message || 'Não foi possível entrar com esse nome de usuário.');
          }
          const result = await sb.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
          if (result.error) throw result.error;
        }
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) throw error;
        if (!session?.user) throw new Error('Confirme seu e-mail e entre novamente para continuar.');
        game.supabaseClient = sb;
        if (intent === 'continue') await showCharacterList(session.user);
        else renderCreator(session.user);
      } catch (error) {
        feedback.textContent = error?.message || 'Não foi possível autenticar.';
        feedback.className = 'menu-auth-feedback error';
        submit.disabled = false;
      }
    });
  }

  async function waitForGraphics() {
    if (game.graphicsReady) return;
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (game.graphicsReady) { clearInterval(poll); resolve(); }
        else if (Date.now() - started > 60000) {
          clearInterval(poll);
          reject(new Error('A preparação dos gráficos demorou demais. Volte às configurações e use Baixa ou Mínima.'));
        }
      }, 150);
    });
  }

  async function launch(character, isNew = false) {
    const { VOCATIONS } = await import('./vocations.js');
    const vocationId = Object.keys(VOCATIONS).find(id => VOCATIONS[id].name === character.vocation);
    if (!vocationId) throw new Error('A vocação desse personagem não existe nesta versão do jogo.');
    await waitForGraphics();
    const gameState = character.game_state || {};
    const arena3d = gameState.arena3d || {};
    game.activeCharacterGameState = gameState;
    try {
      if (arena3d.character) localStorage.setItem(`arena.character.v1.${character.id}`, JSON.stringify(arena3d.character));
      if (arena3d.world && !isNew) localStorage.setItem(`arena.world.v1.${character.id}`, JSON.stringify(arena3d.world));
      if (isNew) localStorage.removeItem(`arena.world.v1.${character.id}`);
    } catch (error) { console.warn('[ARENA] Could not hydrate character cache:', error); }
    closeDialog();
    document.getElementById('main-menu')?.classList.add('hidden');
    await game.start(vocationId, {
      characterId: character.id,
      name: character.name,
      gender: character.gender || 'male',
      isNew,
      gameState
    });
  }

  function validateCharacterName(rawValue) {
    // Keep this in sync with public.arena_characters_name_format and
    // public.arena_characters_name_length in Supabase. Uppercase/lowercase
    // letters and accents are allowed; digits and other punctuation are not.
    const name = String(rawValue || '').trim();
    if (!name) return { valid: false, message: 'Digite um nome para continuar.' };
    if (name.length < 3) return { valid: false, message: 'Use pelo menos 3 caracteres.' };
    if (name.length > 24) return { valid: false, message: 'O limite é de 24 caracteres.' };
    if (!/^[\p{L}_ -]+$/u.test(name)) {
      return { valid: false, message: 'Use apenas letras (maiúsculas ou minúsculas), espaços, _ ou -.' };
    }
    return { valid: true, message: 'Nome válido.' };
  }

  function updateCharacterNameStatus(rawValue, showEmpty = false) {
    const input = document.getElementById('menu-character-name');
    const icon = document.getElementById('menu-character-name-icon');
    const feedback = document.getElementById('menu-character-name-feedback');
    if (!input || !icon || !feedback) return validateCharacterName(rawValue);
    const value = String(rawValue || '');
    if (!value && !showEmpty) {
      input.classList.remove('is-valid', 'is-invalid');
      input.setAttribute('aria-invalid', 'false');
      icon.textContent = '';
      icon.className = 'menu-name-icon';
      feedback.textContent = 'Use de 3 a 24 caracteres.';
      feedback.className = 'menu-name-feedback';
      return { valid: false, message: 'Digite um nome para continuar.' };
    }
    const result = validateCharacterName(value);
    input.classList.toggle('is-valid', result.valid);
    input.classList.toggle('is-invalid', !result.valid);
    input.setAttribute('aria-invalid', String(!result.valid));
    icon.textContent = result.valid ? '✓' : '×';
    icon.className = 'menu-name-icon ' + (result.valid ? 'valid' : 'invalid');
    feedback.textContent = result.message;
    feedback.className = 'menu-name-feedback ' + (result.valid ? 'valid' : 'invalid');
    return result;
  }

  async function renderCreator(user) {
    const custom = openDialog('Criar personagem', `Conta conectada: ${user.user_metadata?.username || user.email}. Um novo personagem começa na Floresta de Vhal, no nível 1.`);
    const { VOCATIONS } = await import('./vocations.js');
    const options = Object.entries(VOCATIONS).map(([id, vocation]) => `<option value="${id}">${vocation.name} — ${vocation.title}</option>`).join('');
    custom.innerHTML = `<form id="menu-character-form" class="menu-auth-form">
      <label>Nome do personagem
        <div class="menu-name-field">
          <input id="menu-character-name" name="name" minlength="3" maxlength="24" required autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Digite o nome do herói" aria-describedby="menu-character-name-feedback" aria-invalid="false">
          <span id="menu-character-name-icon" class="menu-name-icon" aria-hidden="true"></span>
        </div>
        <span id="menu-character-name-feedback" class="menu-name-feedback" aria-live="polite">Use de 3 a 24 caracteres.</span>
      </label>
      <label>Sexo<select name="gender"><option value="male">Masculino</option><option value="female">Feminino</option></select></label>
      <label>Vocação<select name="vocation">${options}</select></label>
      <p class="menu-auth-feedback" id="menu-character-feedback" role="status"></p>
      <button class="main-menu-btn primary" id="menu-character-submit" type="submit"><span>Criar e jogar</span><b>↗</b></button>
    </form>`;
    const nameInput = custom.querySelector('#menu-character-name');
    nameInput.addEventListener('input', () => updateCharacterNameStatus(nameInput.value));
    nameInput.addEventListener('blur', () => {
      if (nameInput.value) updateCharacterNameStatus(nameInput.value, true);
    });
    custom.querySelector('#menu-character-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = custom.querySelector('#menu-character-feedback');
      const button = custom.querySelector('#menu-character-submit');
      const rawName = form.elements.name.value;
      const name = rawName.trim();
      const gender = form.elements.gender.value;
      const vocationId = form.elements.vocation.value;
      const nameCheck = validateCharacterName(rawName);
      if (!nameCheck.valid) {
        updateCharacterNameStatus(name, true);
        feedback.textContent = nameCheck.message;
        feedback.className = 'menu-auth-feedback error';
        form.elements.name.focus();
        return;
      }
      button.disabled = true;
      feedback.textContent = 'Preparando a jornada...';
      feedback.className = 'menu-auth-feedback';
      try {
        const sb = await client();
        const { data: { user: currentUser }, error: authError } = await sb.auth.getUser();
        if (authError || !currentUser) throw new Error('Sua sessão expirou. Entre novamente.');
        await waitForGraphics();
        const { VOCATIONS } = await import('./vocations.js');
        const { data, error } = await sb.from('arena_characters').insert({
          user_id: currentUser.id,
          name,
          gender,
          vocation: VOCATIONS[vocationId].name,
          game_state: { arena3d: { version: 1, character: null, world: null } }
        }).select('id,name,gender,vocation,game_state').single();
        if (error) throw error;
        await launch(data, true);
      } catch (error) {
        console.error('[ARENA] Character creation failed:', error);
        const constraint = error?.code === '23514' ? String(error?.message || '') : '';
        if (constraint.includes('arena_characters_name_format')) {
          feedback.textContent = 'Nome inválido. Use apenas letras, espaços, _ ou - (sem números).';
        } else if (constraint.includes('arena_characters_name_length')) {
          feedback.textContent = 'O nome precisa ter entre 3 e 24 caracteres.';
        } else {
          feedback.textContent = error?.message || 'Não foi possível criar o personagem.';
        }
        feedback.className = 'menu-auth-feedback error';
        button.disabled = false;
      }
    });
  }

  async function showCharacterList(user) {
    const custom = openDialog('Seus personagens', `Conta conectada: ${user.user_metadata?.username || user.email}. Selecione uma jornada para continuar.`);
    custom.innerHTML = '<div class="menu-character-list" id="menu-character-list"><p>Carregando personagens...</p></div><button type="button" class="main-menu-btn primary" id="menu-list-new"><span>Criar personagem</span><b>+</b></button>';
    custom.querySelector('#menu-list-new').addEventListener('click', () => renderCreator(user));
    const sb = await client();
    const { data, error } = await sb.from('arena_characters').select('id,name,gender,vocation,game_state,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (error) {
      custom.querySelector('#menu-character-list').innerHTML = '<p class="menu-auth-feedback error">Não foi possível carregar os personagens.</p>';
      console.error('[ARENA] Character list failed:', error);
      return;
    }
    const list = custom.querySelector('#menu-character-list');
    if (!data?.length) { list.innerHTML = '<p>Você ainda não criou personagens.</p>'; return; }
    list.innerHTML = '';
    for (const character of data) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-character-card';
      const name = document.createElement('strong');
      name.textContent = character.name;
      const meta = document.createElement('span');
      meta.textContent = `${character.vocation} · ${character.gender === 'female' ? 'Feminino' : 'Masculino'}`;
      button.append(name, meta);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await launch(character, false); }
        catch (error) { console.error('[ARENA] Could not launch character:', error); button.disabled = false; }
      });
      list.appendChild(button);
    }
  }

  async function saveCloudCharacter() {
    if (saveBusy || !game.activeCharacterId || !game.character || !game.supabaseClient) return;
    saveBusy = true;
    try {
      const sb = await client();
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) return;
      const key = game.worldStorageKey?.();
      let world = null;
      try { world = key ? JSON.parse(localStorage.getItem(key) || 'null') : null; } catch {}
      const current = game.activeCharacterGameState && typeof game.activeCharacterGameState === 'object' ? game.activeCharacterGameState : {};
      const game_state = { ...current, arena3d: { version: 1, character: game.character.data, world } };
      const { error } = await sb.from('arena_characters').update({ game_state, updated_at: new Date().toISOString() }).eq('id', game.activeCharacterId).eq('user_id', user.id);
      if (error) console.warn('[ARENA] Cloud save failed:', error);
      else game.activeCharacterGameState = game_state;
    } catch (error) {
      console.warn('[ARENA] Cloud save skipped:', error);
    } finally { saveBusy = false; }
  }

  game.supabaseClient = supabase;
  window.addEventListener('arena:new-character', async () => {
    try {
      const sb = await client();
      const { data: { session }, error } = await sb.auth.getSession();
      if (error) throw error;
      if (!session?.user) renderAuth('login', 'new');
      else renderCreator(session.user);
    } catch (error) {
      console.error('[ARENA] Account initialization failed:', error);
      game.showMenuMessage?.('Conta indisponível', 'Não foi possível conectar à conta Mal Upados. Confira a conexão e tente novamente.');
    }
  });
  window.addEventListener('arena:continue', async () => {
    try {
      const sb = await client();
      const { data: { session }, error } = await sb.auth.getSession();
      if (error) throw error;
      if (!session?.user) renderAuth('login', 'continue');
      else await showCharacterList(session.user);
    } catch (error) {
      console.error('[ARENA] Could not load account:', error);
      game.showMenuMessage?.('Conta indisponível', 'Não foi possível consultar seus personagens no Supabase. Tente novamente.');
    }
  });
  window.addEventListener('arena:character-started', saveCloudCharacter);
  window.addEventListener('pagehide', saveCloudCharacter, { capture: true });
  setInterval(saveCloudCharacter, 20000);
}
