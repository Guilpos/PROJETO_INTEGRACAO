// ============================================================
// helpers.js — funções utilitárias compartilhadas
// ------------------------------------------------------------
// Formatação de datas, rótulos de competência, permissões.
// Independente de Supabase e de fonte de dados (funciona no
// modo teste e no modo real).
// ============================================================

// ------------------------------------------------------------------
// Data: 'YYYY-MM-DD' -> 'DD/MM/YYYY' (ou '—' se vazio/nulo)
// ------------------------------------------------------------------
function formatarDataBR(data) {
    if (!data) return '—';
    const s = String(data).slice(0, 10); // aceita 'YYYY-MM-DD' ou timestamp
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return data;
    const [a, m, d] = s.split('-');
    return `${d}/${m}/${a}`;
}

// ------------------------------------------------------------------
// Data de hoje em 'YYYY-MM-DD'
// ------------------------------------------------------------------
function dataHojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ------------------------------------------------------------------
// Competência: 'YYYY-MM' -> 'MM/YYYY' (ex.: '2026-11' -> '11/2026')
// ------------------------------------------------------------------
function competenciaLabel(competencia) {
    if (!competencia) return '';
    const [a, m] = String(competencia).split('-');
    if (!m) return competencia;
    return `${m}/${a}`;
}

// ------------------------------------------------------------------
// Competência atual (mês corrente) em 'YYYY-MM'
// ------------------------------------------------------------------
function competenciaAtual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ------------------------------------------------------------------
// Próxima competência a partir de uma base 'YYYY-MM'
// ------------------------------------------------------------------
function proximaCompetencia(base) {
    if (!base) return competenciaAtual();
    let [a, m] = String(base).split('-').map(Number);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
    return `${a}-${String(m).padStart(2,'0')}`;
}

// ------------------------------------------------------------------
// Permissão de edição (master/admin). No modo teste, sempre true.
// ------------------------------------------------------------------
function podeEditar(perfil) {
    if (window.USAR_MOCK) return true;
    return perfil && (perfil.tipo_usuario === 'master' || perfil.tipo_usuario === 'admin');
}

// ------------------------------------------------------------------
// Dia da semana (em português) de uma data 'YYYY-MM-DD'
// Utilizado pelos alertas de fim de semana.
// ------------------------------------------------------------------
function diaDaSemana(data) {
    if (!data) return '';
    const [a, m, d] = String(data).slice(0, 10).split('-').map(Number);
    const dt = new Date(a, m - 1, d);
    const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    return dias[dt.getDay()];
}

// ------------------------------------------------------------------
// Apelido: hojeBR() -> data de hoje em 'YYYY-MM-DD'
// Usado pelos filtros das abas e pelos alertas (calendario.js).
// Manter este nome porque o calendario.js já o referencia.
// ------------------------------------------------------------------
function hojeBR() {
    return dataHojeISO();
}
