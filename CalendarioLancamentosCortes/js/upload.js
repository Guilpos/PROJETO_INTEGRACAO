// ============================================================
// upload.js — importação de planilha (SheetJS) + match por nome
// ------------------------------------------------------------
// Regras:
//  - mesmo nome (normalizado com unaccent) => mesmo convênio (id)
//  - nome mudado => convênio novo (id novo)
//  - linha com campo vazio => "NÃO lança" (sem dados de lançamento)
// O match pesado fica no RPC 'importar_planilha' (Postgres).
// ============================================================

// ------------------------------------------------------------------
// Lê o arquivo .xlsx/.csv e retorna array de objetos
// ------------------------------------------------------------------
async function lerPlanilha(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(primeiraAba, { defval: '' });
    return linhas;
}

// ------------------------------------------------------------------
// Normaliza as linhas lidas para o formato esperado pelo RPC
// Mapeia as colunas comuns da planilha de origem.
// ------------------------------------------------------------------
function normalizarLinhas(linhasBrutas) {
    return linhasBrutas.map(r => ({
        nome: (r['Convênio'] || r['Convenio'] || r['Nome'] || '').trim(),
        sistema: (r['Sistema'] || '').trim(),
        data_corte: (r['Data de Corte'] || r['Data_Corte'] || '').trim(),
        data_lancamento: (r['Data de Lançamento'] || r['Data_Lancamento'] || r['Data de Lançamento'] || '').trim(),
        lancador: (r['Responsavel'] || r['Responsável'] || r['Lançador'] || r['Lancador'] || '').trim(),
        validador: (r['Validação'] || r['Validacao'] || r['Validador'] || '').trim()
    }));
}

// ------------------------------------------------------------------
// Converte data de texto ('DD/MM/YYYY' ou 'YYYY-MM-DD') para ISO
// ------------------------------------------------------------------
function normalizarData(valor) {
    if (!valor) return '';
    // Se for número de série do Excel (ex.: 45259), converte
    if (typeof valor === 'number') {
        const d = XLSX.SSF ? new Date((valor - 25569) * 86400 * 1000) : new Date(valor);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    const s = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;       // já ISO
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {            // DD/MM/YYYY
        const [dd, mm, aaaa] = s.split('/');
        return `${aaaa}-${mm}-${dd}`;
    }
    return s;
}

// ------------------------------------------------------------------
// Envia as linhas para o RPC importar_planilha
// ------------------------------------------------------------------
async function importarPlanilha(competencia, linhasBrutas, aoProcessar) {
    const linhas = normalizarLinhas(linhasBrutas).map(l => ({
        ...l,
        data_corte: normalizarData(l.data_corte),
        data_lancamento: normalizarData(l.data_lancamento)
    }));

    const { data, error } = await supabase.rpc('importar_planilha', {
        p_competencia: competencia,
        p_linhas: linhas
    });

    if (error) {
        console.error(error);
        return { ok: false, erro: error.message };
    }

    if (aoProcessar) aoProcessar(data);
    return { ok: true, resultados: data };
}
