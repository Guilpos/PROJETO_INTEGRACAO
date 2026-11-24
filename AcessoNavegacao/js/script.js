// ==========================================================
// 1. CONEXÃO COM O SUPABASE E AUTENTICAÇÃO
// ==========================================================
const SUPABASE_URL = 'https://jpypbevkeaoitmqurxfz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NvjlhJA3xYZd7_Egqi-Z3w_VgNcAcVw';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================================
// 2. ELEMENTOS DA SIDEBAR E PALCO PRINCIPAL
// ==========================================================
const sb = document.getElementById('sidebar');
const mainStage = document.getElementById('mainStage');
const homeView = document.getElementById('homeView');
const usuariosView = document.getElementById('usuariosView');
const btnHome = document.getElementById('btnHome');
const btnToggle = document.getElementById('toggle');
const btnLogout = document.getElementById('btnLogout');

// Verifica se o usuário está logado, preenche o rodapé e libera o menu Master
async function validarSessaoEPerfil() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  // Se não houver sessão ativa, bloqueia e manda de volta para o login
  if (!session) {
    localStorage.removeItem('akrk_usuario');
    window.location.href = './login.html';
    return;
  }

  // Busca os dados direto do banco para garantir que o tipo_usuario esteja atualizado
  const { data: perfilBanco } = await supabaseClient
    .from('usuarios')
    .select('id, nome_completo, tipo_usuario, cargo, ativo')
    .eq('id', session.user.id)
    .single();

  const perfilSalvo = perfilBanco || JSON.parse(localStorage.getItem('akrk_usuario'));

  if (perfilSalvo) {
    localStorage.setItem('akrk_usuario', JSON.stringify(perfilSalvo));

    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const userAvatarEl = document.getElementById('userAvatar');

    if (userNameEl && perfilSalvo.nome_completo) {
      userNameEl.textContent = perfilSalvo.nome_completo;
    }
    if (userRoleEl && perfilSalvo.cargo) {
      userRoleEl.textContent = perfilSalvo.cargo;
    }
    if (userAvatarEl && perfilSalvo.nome_completo) {
      userAvatarEl.textContent = perfilSalvo.nome_completo.charAt(0).toUpperCase();
    }

    // Libera o menu de Administração apenas se o usuário for MASTER
    if (perfilSalvo.tipo_usuario === 'master') {
      const menuMaster = document.getElementById('menuMaster');
      if (menuMaster) {
        menuMaster.classList.remove('d-none');
      }
    }
  }
}

validarSessaoEPerfil();

// 3. Recolher ou Expandir a Sidebar
btnToggle.addEventListener('click', () => {
  sb.classList.toggle('collapsed');
  document.querySelector('.show-c').classList.toggle('d-none', !sb.classList.contains('collapsed'));
});

// 4. Se a Sidebar estiver recolhida e o usuário clicar em um grupo com submenu, expande automaticamente
document.querySelectorAll('[data-bs-toggle="collapse"]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (sb.classList.contains('collapsed')) {
      sb.classList.remove('collapsed');
      document.querySelector('.show-c').classList.add('d-none');
    }
  });
});

// 5. Abrir sistemas dentro do iframe enviando o Token de Sessão (SSO)
document.querySelector('nav[aria-label="Menu principal"]').addEventListener('click', async (e) => {
  const link = e.target.closest('a[data-app]');
  if (!link) return;

  e.preventDefault();
  const appId = link.dataset.app;
  const appUrl = link.dataset.url;
  if (!appUrl || appUrl === '#') return;

  document.querySelectorAll('.nav-item-btn.active, .submenu a.active').forEach(el => {
    el.classList.remove('active');
  });
  link.classList.add('active');

  const parentCollapse = link.closest('.collapse');
  if (parentCollapse && parentCollapse.previousElementSibling) {
    parentCollapse.previousElementSibling.classList.add('active');
  }

  homeView.classList.add('d-none');
  if (usuariosView) usuariosView.classList.add('d-none');
  document.querySelectorAll('.app-frame').forEach(f => f.classList.remove('active'));

  const { data } = await supabaseClient.auth.getSession();
  const session = data?.session;
  let urlComToken = appUrl;

  if (session && session.access_token) {
    const url = new URL(appUrl, window.location.href);
    url.hash = new URLSearchParams({
      access_token: session.access_token
    }).toString();
    urlComToken = url.toString();
  }

  let frame = document.getElementById(`frame-${appId}`);
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = `frame-${appId}`;
    frame.className = 'app-frame active';
    frame.src = urlComToken;
    mainStage.appendChild(frame);
  } else {
    if (frame.src !== urlComToken) {
      frame.src = urlComToken;
    }
    frame.classList.add('active');
  }

});

// 5.1. Carregar sistemas nos grupos indicados pela coluna "grupo"
async function carregarSistemasSidebar() {
  const listasPorGrupo = new Map(
    Array.from(document.querySelectorAll('.submenu[data-sistema-grupo]'))
      .map(lista => [lista.dataset.sistemaGrupo, lista])
  );
  const loading = document.querySelectorAll('.sistemas-loading');
  try {
    const { data: sistemas, error } = await supabaseClient
      .from('sistemas')
      .select('*');

    if (error) throw error;
    loading.forEach(item => item.remove());
    if (!sistemas || sistemas.length === 0) return;

    sistemas.forEach((sistema, index) => {
      if (Object.prototype.hasOwnProperty.call(sistema, 'ativo') && sistema.ativo === false) return;

      const nome = sistema.nome
        || sistema.nome_sistema
        || sistema.titulo
        || sistema.name
        || sistema.sistema
        || 'Sistema';

      const url = sistema.url
        || sistema.url_sistema
        || sistema.link
        || sistema.link_sistema
        || sistema.agenda_url
        || sistema.url_agenda;

      if (!url) return;

      const lista = listasPorGrupo.get(sistema.grupo || 'lancamentos');
      if (!lista) {
        console.warn(`Grupo "${sistema.grupo}" não existe na sidebar; sistema ignorado.`);
        return;
      }

      const item = document.createElement('li');
      const link = document.createElement('a');
      const identificadorBase = sistema.id || sistema.id_sistema || `${nome}-${index}`;
      const identificador = String(identificadorBase)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-');

      link.href = '#';
      link.dataset.app = `sistema-${identificador}`;
      link.dataset.url = url;
      link.textContent = nome;
      item.appendChild(link);
      lista.appendChild(item);
    });
  } catch (err) {
    console.error('Erro ao carregar sistemas da sidebar:', err);
    loading.forEach(item => {
      item.textContent = 'Não foi possível carregar os sistemas.';
    });
  }
}

carregarSistemasSidebar();

// 6. Voltar para a tela "Início"
btnHome.addEventListener('click', () => {
  document.querySelectorAll('.nav-item-btn.active, .submenu a.active').forEach(el => {
    el.classList.remove('active');
  });
  btnHome.classList.add('active');

  document.querySelectorAll('.app-frame').forEach(f => f.classList.remove('active'));
  if (usuariosView) usuariosView.classList.add('d-none');
  homeView.classList.remove('d-none');
});

// 7. Botão Deslogar (#btnLogout)
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    btnLogout.disabled = true;

    try {
      await supabaseClient.auth.signOut();
    } catch (err) {
      console.error('Erro ao encerrar sessão:', err);
    } finally {
      localStorage.removeItem('akrk_usuario');
      window.location.href = './login.html';
    }
  });

  // 8. Botão darktheme (#btnTheme)
  const btnDarkTheme = document.getElementById('btnTheme');

  
  function aplicarTema(tema) {
  document.documentElement.dataset.theme = tema;
  localStorage.setItem('akrk_tema', tema);

  const icone = btnTheme?.querySelector('i');
  if (icone) {
    icone.classList.toggle('bi-sun', tema === 'light');
    icone.classList.toggle('bi-moon', tema === 'dark');
  }

  if (btnTheme) {
    btnTheme.title = tema === 'dark' ? 'Tema claro' : 'Tema escuro';
    btnTheme.setAttribute('aria-label', btnTheme.title);
  }
}

aplicarTema(localStorage.getItem('akrk_tema') || 'light');

btnTheme?.addEventListener('click', () => {
  const temaAtual = document.documentElement.dataset.theme;
  aplicarTema(temaAtual === 'dark' ? 'light' : 'dark');
});

}