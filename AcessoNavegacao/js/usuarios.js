// ==========================================================
// GESTÃO DE USUÁRIOS (EXCLUSIVO PERFIL MASTER)
// ==========================================================
const btnUsuarios = document.getElementById('btnUsuarios');
const formNovoUsuario = document.getElementById('formNovoUsuario');
const tabelaUsuariosBody = document.getElementById('tabelaUsuariosBody');
const usuariosAlert = document.getElementById('usuariosAlert');
const modalUsuarioErro = document.getElementById('modalUsuarioErro');

function exibirAlertaUsuarios(mensagem, tipo = 'success') {
  if (!usuariosAlert) return;
  usuariosAlert.textContent = mensagem;
  usuariosAlert.className = `alert alert-${tipo}`;
  setTimeout(() => {
    usuariosAlert.classList.add('d-none');
  }, 4000);
}

// 1. Abrir a tela de Usuários ao clicar no botão da Sidebar
if (btnUsuarios) {
  btnUsuarios.addEventListener('click', () => {
    const perfil = JSON.parse(localStorage.getItem('akrk_usuario'));
    if (!perfil || perfil.tipo_usuario !== 'master') return;

    // Atualiza estado ativo na sidebar
    document.querySelectorAll('.nav-item-btn.active, .submenu a.active').forEach(el => {
      el.classList.remove('active');
    });
    btnUsuarios.classList.add('active');

    // Esconde Home e Iframes, mostra tela de Usuários
    homeView.classList.add('d-none');
    document.querySelectorAll('.app-frame').forEach(f => f.classList.remove('active'));
    if (usuariosView) usuariosView.classList.remove('d-none');

    carregarListaUsuarios();
  });
}

// 2. Buscar e renderizar usuários na tabela
async function carregarListaUsuarios() {
  if (!tabelaUsuariosBody) return;

  tabelaUsuariosBody.innerHTML = `
    <tr><td colspan="6" class="text-center py-4 text-secondary">Carregando usuários...</td></tr>
  `;

  const { data: usuarios, error } = await supabaseClient
    .from('usuarios')
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) {
    tabelaUsuariosBody.innerHTML = `
      <tr><td colspan="6" class="text-center py-4 text-danger">Erro ao carregar usuários.</td></tr>
    `;
    return;
  }

  const usuarioAtual = JSON.parse(localStorage.getItem('akrk_usuario'));

  tabelaUsuariosBody.innerHTML = usuarios.map(u => {
    const ehProprioUsuario = usuarioAtual && u.id === usuarioAtual.id;
    const badgeStatus = u.ativo
      ? '<span class="badge bg-success-subtle text-success">Ativo</span>'
      : '<span class="badge bg-danger-subtle text-danger">Inativo</span>';

    return `
      <tr>
        <td class="fw-medium">${u.nome_completo}</td>
        <td class="text-secondary small">${u.email}</td>
        <td>${u.cargo}</td>
        <td>
          <select class="form-select form-select-sm w-auto" 
                  onchange="alterarNivelAcesso('${u.id}', this.value)"
                  ${ehProprioUsuario ? 'disabled' : ''}>
            <option value="viewer" ${u.tipo_usuario === 'viewer' ? 'selected' : ''}>Viewer</option>
            <option value="admin" ${u.tipo_usuario === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="master" ${u.tipo_usuario === 'master' ? 'selected' : ''}>Master</option>
          </select>
        </td>
        <td>${badgeStatus}</td>
        <td class="text-end">
          ${ehProprioUsuario
            ? '<span class="text-muted small">Você</span>'
            : `<button class="btn btn-sm ${u.ativo ? 'btn-outline-danger' : 'btn-outline-success'}"
                       onclick="alternarStatusUsuario('${u.id}', ${!u.ativo})">
                 ${u.ativo ? 'Desativar' : 'Ativar'}
               </button>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

// 3. Cadastrar novo usuário pelo Modal
if (formNovoUsuario) {
  formNovoUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalUsuarioErro.classList.add('d-none');

    const btnSalvar = document.getElementById('btnSalvarUsuario');
    const nome = document.getElementById('novoNome').value.trim();
    const email = document.getElementById('novoEmail').value.trim().toLowerCase();
    const senha = document.getElementById('novaSenha').value;
    const cargo = document.getElementById('novoCargo').value.trim();
    const tipoUsuario = document.getElementById('novoTipo').value;

    btnSalvar.disabled = true;
    btnSalvar.textContent = 'Cadastrando...';

    try {
      const { error: erroCadastro } = await supabaseClient.functions.invoke('criar-usuario', {
        body: {
          nome_completo: nome,
          email,
          senha,
          tipo_usuario: tipoUsuario,
          cargo
        }
      });

      if (erroCadastro) {
        console.error('Erro ao cadastrar usuário:', erroCadastro);
        let mensagemErro = erroCadastro.message;

        if (erroCadastro.context instanceof Response) {
          try {
            const resposta = await erroCadastro.context.clone().json();
            if (typeof resposta.error === 'string') {
              mensagemErro = resposta.error;
            }
          } catch (erroResposta) {
            console.error('Não foi possível ler a resposta do cadastro:', erroResposta);
          }
        }

        modalUsuarioErro.textContent = mensagemErro;
        modalUsuarioErro.classList.remove('d-none');
        return;
      }

      // Fecha o modal, limpa o formulário e recarrega a tabela
      const modalEl = document.getElementById('modalNovoUsuario');
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      modalInstance.hide();
      formNovoUsuario.reset();

      exibirAlertaUsuarios(`Usuário ${nome} cadastrado com sucesso!`);
      await carregarListaUsuarios();

    } catch (err) {
      console.error(err);
      modalUsuarioErro.textContent = 'Erro inesperado ao cadastrar usuário.';
      modalUsuarioErro.classList.remove('d-none');
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = 'Cadastrar';
    }
  });
}

// 4. Alterar nível de acesso (viewer / admin / master) direto na tabela
window.alterarNivelAcesso = async function (userId, novoTipo) {
  const { error } = await supabaseClient
    .from('usuarios')
    .update({ tipo_usuario: novoTipo })
    .eq('id', userId);

  if (error) {
    exibirAlertaUsuarios('Erro ao atualizar nível de acesso.', 'danger');
    carregarListaUsuarios();
  } else {
    exibirAlertaUsuarios('Nível de acesso atualizado!');
  }
};

// 5. Ativar ou Desativar usuário
window.alternarStatusUsuario = async function (userId, novoStatus) {
  const { error } = await supabaseClient
    .from('usuarios')
    .update({ ativo: novoStatus })
    .eq('id', userId);

  if (error) {
    exibirAlertaUsuarios('Erro ao alterar status do usuário.', 'danger');
  } else {
    exibirAlertaUsuarios(novoStatus ? 'Usuário ativado!' : 'Usuário desativado!');
    carregarListaUsuarios();
  }
};