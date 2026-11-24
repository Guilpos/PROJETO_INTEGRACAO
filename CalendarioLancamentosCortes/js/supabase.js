// ============================================================
// supabase.js — inicialização do cliente Supabase (módulo iframe)
// ------------------------------------------------------------
// Esta página roda DENTRO de um <iframe> de terceira origem (IP do
// colega embutindo este IP). Por isso NÃO persistimos sessão em
// localStorage/cookie (o navegador bloqueia Storage Partitioning).
// Em vez disso, o access_token é enviado via header Authorization
// em TODA chamada, e o RLS identifica auth.uid() normalmente.
//
// Credenciais (públicas — podem ir no front):
// ============================================================

const SUPABASE_URL = "https://jpypbevkeaoitmqurxfz.supabase.co";
const SUPABASE_KEY = "sb_publishable_NvjlhJA3xYZd7_Egqi-Z3w_VgNcAcVw";

// ------------------------------------------------------------------
// 1. Lê o access_token vindo da sidebar (após '#' ou '?')
//    A sidebar envia SOMENTE o access_token (nunca o refresh_token),
//    para não disparar a rotação de token do Supabase e derrubar a
//    sessão do app principal.
// ------------------------------------------------------------------
function extrairAccessToken() {
  const raw =
    window.location.hash.substring(1) || window.location.search.substring(1);
  const params = new URLSearchParams(raw);
  return params.get("access_token");
}

const accessToken = extrairAccessToken();

// Limpa o token da barra de endereço por segurança
if (accessToken) {
  try {
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (e) {
    /* alguns navegadores bloqueiam; ignora */
  }
}

// ------------------------------------------------------------------
// 2. Cria o cliente SEM persistir sessão e já injetando o token
//    nas requisições ao banco.
// ------------------------------------------------------------------
const clienteSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  },
);

// ------------------------------------------------------------------
// 3. Decodifica o JWT (access_token) para obter o user.id (campo sub)
//    sem depender de getUser() — que não funciona bem sem sessão
//    persistida dentro do iframe.
// ------------------------------------------------------------------
function decodificarJwt(token) {
  try {
    const parte = token.split(".")[1]; // payload
    const base64 = parte.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json);
  } catch (e) {
    console.error("Falha ao decodificar JWT:", e);
    return null;
  }
}

const payloadJwt = accessToken ? decodificarJwt(accessToken) : null;
const userIdAtual = payloadJwt ? payloadJwt.sub : null;

// ------------------------------------------------------------------
// Helpers de sessão e usuário
// ------------------------------------------------------------------
async function obterSessao() {
  // Sem persistência de sessão, o token está no header, não na sessão.
  return accessToken ? { access_token: accessToken, user: payloadJwt } : null;
}

async function obterUsuario() {
  // userIdAtual vem do JWT (sub), não do getUser().
  if (userIdAtual) {
    return { id: userIdAtual };
  }
  return null;
}

// Pega o perfil (tipo_usuario, cargo, nome) da tabela `usuarios`
// A consulta abaixo funciona normalmente porque o header Authorization
// faz o RLS identificar o auth.uid() deste usuário.
async function obterPerfil(userId) {
  const { data, error } = await clienteSupabase
    .from("usuarios")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    console.error("Erro ao obter perfil:", error);
    return null;
  }
  return data;
}

// ------------------------------------------------------------------
// Helpers de data
// ------------------------------------------------------------------
const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const MESES = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

function formatarDataBR(dataIso) {
  if (!dataIso) return "";
  const s = String(dataIso).slice(0, 10); // 'YYYY-MM-DD'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [yyyy, mm, dd] = s.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function formatarDataISO(ddmmYYYY) {
  if (!ddmmYYYY) return null;
  const [dd, mm, yyyy] = ddmmYYYY.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function competenciaAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

function proximaCompetencia(competencia) {
  const [ano, mes] = competencia.split("-").map(Number);
  let novoMes = mes + 1,
    novoAno = ano;
  if (novoMes > 12) {
    novoMes = 1;
    novoAno++;
  }
  return `${novoAno}-${String(novoMes).padStart(2, "0")}`;
}

function competenciaLabel(competencia) {
  const [ano, mes] = competencia.split("-");
  return `${MESES[Number(mes) - 1]}/${ano}`;
}

function hojeBR() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
