// 1. Conexão com o Supabase
const SUPABASE_URL = 'https://jpypbevkeaoitmqurxfz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NvjlhJA3xYZd7_Egqi-Z3w_VgNcAcVw';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Elementos da tela
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('loginError');
const btnSubmit = document.getElementById('btnSubmit');

function mostrarErro(mensagem) {
  loginError.textContent = mensagem;
  loginError.classList.remove('d-none');
}

function limparErro() {
  loginError.textContent = '';
  loginError.classList.add('d-none');
}

// 3. Se já estiver logado, vai direto para a sidebar
async function verificarSessaoExistente() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = './teste.html';
  }
}

verificarSessaoExistente();

// 4. Evento de envio do formulário
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErro();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Entrando...';

  try {
    // Autentica no Supabase Auth
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      const emailNaoConfirmado = authError.code === 'email_not_confirmed'
        || authError.message.toLowerCase().includes('email not confirmed');
      mostrarErro(emailNaoConfirmado
        ? 'Confirme seu e-mail antes de entrar.'
        : 'E-mail ou senha inválidos.');
      return;
    }

    // Busca o perfil na tabela usuarios para checar se está ativo
    const { data: perfil, error: perfilError } = await supabaseClient
      .from('usuarios')
      .select('id, nome_completo, tipo_usuario, cargo, ativo')
      .eq('id', authData.user.id)
      .single();

    if (perfilError || !perfil) {
      await supabaseClient.auth.signOut();
      mostrarErro('Perfil de usuário não encontrado no sistema.');
      return;
    }

    if (!perfil.ativo) {
      await supabaseClient.auth.signOut();
      mostrarErro('Seu acesso está inativo. Procure o administrador.');
      return;
    }

    // Salva os dados básicos do usuário e redireciona para o painel
    localStorage.setItem('akrk_usuario', JSON.stringify(perfil));
    window.location.href = './teste.html';

  } catch (err) {
    console.error(err);
    mostrarErro('Erro de conexão ao tentar entrar. Tente novamente.');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Entrar';
  }
});