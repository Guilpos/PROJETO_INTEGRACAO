// ============================================================
// calendario.js — lógica do calendário de lançamentos
// ------------------------------------------------------------
// - Grade "Pendências de Hoje" (3 abas) no topo
// - 4 categorias de alerta (sobre linhas 100% completas)
// - Base da competência (planilha) com edição célula a célula
// ============================================================

// Estado global
let perfilAtual = null;
let competenciaSelecionada = null;
let linhasBase = [];          // todas as linhas da competência selecionada
let lançadores = [];          // usuários com cargo = 'lancador'
let validadores = [];         // usuários com cargo = 'validador'

// ------------------------------------------------------------------
// Linha "NÃO lança": qualquer um dos 4 campos de lançamento vazio
// ------------------------------------------------------------------
function ehNaoLanca(linha) {
    return !linha.lancador_id
        || !linha.validador_id
        || !linha.data_de_corte
        || !linha.data_de_lancamento;
}

// Linha completa (para os alertas)
function linhaCompleta(linha) {
    return !ehNaoLanca(linha);
}

// ------------------------------------------------------------------
// Cálculo dos 4 alertas (apenas sobre linhas completas)
// ------------------------------------------------------------------
function calcularAlertas(linhas) {
    const hoje = new Date(hojeBR());
    const LIMITE_DIAS = 30;

    const alertas = {
        invasao: [],               // ALERTA 1: lançamento >= corte
        fimDeSemana: [],           // ALERTA 2: lançamento sáb/dom
        distanciaLancamento: [],   // ALERTA 3: |lançamento - hoje| > 30
        distanciaCorte: []         // ALERTA 4: |corte - hoje| > 30
    };

    linhas.filter(linhaCompleta).forEach(linha => {
        const lanc = new Date(linha.data_de_lancamento);
        const corte = new Date(linha.data_de_corte);

        // ALERTA 1 — lançamento no mesmo dia ou depois do corte
        if (lanc.getTime() >= corte.getTime()) {
            alertas.invasao.push(linha);
        }

        // ALERTA 2 — lançamento em fim de semana (sáb=6, dom=0)
        const dow = lanc.getDay();
        if (dow === 0 || dow === 6) {
            alertas.fimDeSemana.push({ ...linha, diaSemana: DIAS_SEMANA[dow] });
        }

        // ALERTA 3 — lançamento distante > 30 dias
        const diffLanc = Math.abs((lanc - hoje) / (1000 * 60 * 60 * 24));
        if (diffLanc > LIMITE_DIAS) {
            alertas.distanciaLancamento.push(linha);
        }

        // ALERTA 4 — corte distante > 30 dias
        const diffCorte = Math.abs((corte - hoje) / (1000 * 60 * 60 * 24));
        if (diffCorte > LIMITE_DIAS) {
            alertas.distanciaCorte.push(linha);
        }
    });

    return alertas;
}

// Total de alertas (soma das 4 categorias)
function totalAlertas(alertas) {
    return alertas.invasao.length
        + alertas.fimDeSemana.length
        + alertas.distanciaLancamento.length
        + alertas.distanciaCorte.length;
}

// ------------------------------------------------------------------
// Filtros das abas "Hoje"
// ------------------------------------------------------------------
function filtroLancamentosHoje(linhas) {
    const hoje = hojeBR();
    return linhas.filter(l => l.data_de_lancamento && l.data_de_lancamento.slice(0, 10) === hoje);
}

function filtroCortesHoje(linhas) {
    const hoje = hojeBR();
    return linhas.filter(l => l.data_de_corte && l.data_de_corte.slice(0, 10) === hoje);
}

function filtroPeriodoLancamento(linhas) {
    const hoje = new Date(hojeBR());
    return linhas.filter(l => {
        if (!l.data_de_lancamento || !l.data_de_corte) return false;
        const lanc = new Date(l.data_de_lancamento);
        const corte = new Date(l.data_de_corte);
        return lanc.getTime() <= hoje.getTime() && corte.getTime() >= hoje.getTime();
    });
}

// ------------------------------------------------------------------
// Carregar usuários por cargo (para as dropdowns)
// ------------------------------------------------------------------
async function carregarResponsaveis() {
    const [{ data: l }, { data: v }] = await Promise.all([
        supabase.from('usuarios').select('id, nome_completo').eq('cargo', 'lancador').eq('ativo', true).order('nome_completo'),
        supabase.from('usuarios').select('id, nome_completo').eq('cargo', 'validador').eq('ativo', true).order('nome_completo')
    ]);
    lançadores = l || [];
    validadores = v || [];
}

// ------------------------------------------------------------------
// Carregar competências disponíveis (distinct)
// ------------------------------------------------------------------
async function carregarCompetencias() {
    const { data, error } = await supabase
        .from('calendario_competencias')
        .select('competencia')
        .order('competencia', { ascending: false });
    if (error) { console.error(error); return []; }
    return [...new Set((data || []).map(d => d.competencia))];
}

// ------------------------------------------------------------------
// Carregar as linhas da competência selecionada
// ------------------------------------------------------------------
async function carregarLinhas(competencia) {
    const { data, error } = await supabase
        .from('vw_calendario_completo')
        .select('*')
        .eq('competencia', competencia)
        .order('convenio_nome');
    if (error) { console.error(error); return []; }
    return data || [];
}
