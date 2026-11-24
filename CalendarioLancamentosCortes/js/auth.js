// ============================================================
// auth.js — autenticação do módulo iframe
// ------------------------------------------------------------
// Este arquivo NÃO faz login e NÃO persiste sessão. A sidebar do
// colega envia o access_token via fragmento (#). O supabase.js já
// leu o token e o injeta no header Authorization das requisições.
// Aqui só validamos se existe token e devolvemos o contexto.
// ============================================================

// ------------------------------------------------------------------
// Verifica se há token disponível (lido pelo supabase.js)
// ------------------------------------------------------------------
async function importarTokensDaURL() {
  // O token já foi capturado no supabase.js (variável accessToken).
  // Como o supabase.js roda ANTES do auth.js, a variável existe.
  return typeof accessToken !== "undefined" && accessToken ? accessToken : null;
}

// ------------------------------------------------------------------
// Obtém a sessão: com o token no header, basta confirmar a presença.
// ------------------------------------------------------------------
async function obterSessao() {
  const token = await importarTokensDaURL();
  if (!token) return null;
  return { access_token: token };
}

// ------------------------------------------------------------------
// Inicializa a página: devolve { sessao, perfil } ou null.
// ------------------------------------------------------------------
async function inicializarSessao() {
  const sessao = await obterSessao();
  if (!sessao) return null;

  // userIdAtual vem do JWT decodificado no supabase.js
  const userId =
    typeof userIdAtual !== "undefined" && userIdAtual ? userIdAtual : null;

  return { sessao, perfil: null, userId };
}

// ------------------------------------------------------------------
// Verifica se o usuário pode editar (master ou admin)
// ------------------------------------------------------------------
function podeEditar(perfil) {
  return (
    perfil &&
    (perfil.tipo_usuario === "master" || perfil.tipo_usuario === "admin")
  );
}
