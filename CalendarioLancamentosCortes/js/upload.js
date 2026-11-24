// ============================================================
// upload.js — importação de planilha (SheetJS) + match por nome
// ------------------------------------------------------------
// Regras:
//  - mesmo nome (normalizado com unaccent) => mesmo convênio (id)
//  - nome mudado => convênio novo (id novo)
//  - linha com campo vazio => "NÃO lança" (sem dados de lançamento)
// O match pesado fica no RPC 'importar_planilha' (Postgres).
//
// Correções aplicadas:
//  - sheet_to_json com raw:false => células de data vêm como texto,
//    eliminando o fallback de Date do SheetJS que quebrava o .trim()
//  - helper comoTexto() blindado (aceita string, Date, number, vazio)
//  - normalizarData() usando parse_date_code (sem bug de fuso/-1 dia)
//  - try/catch com alerta para nunca falhar em silêncio
// ============================================================

// ------------------------------------------------------------------
// Lê o arquivo .xlsx/.csv e retorna array de objetos
// ------------------------------------------------------------------
async function lerPlanilha(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
  // raw:false faz o SheetJS devolver valores formatados como texto
  // (datas viram string, não objeto Date), evitando erro no .trim()
  const linhas = XLSX.utils.sheet_to_json(primeiraAba, {
    defval: "",
    raw: false,
  });
  return linhas;
}

// ------------------------------------------------------------------
// Helper seguro: qualquer valor (string, Date, number, null) -> string
// ------------------------------------------------------------------
function comoTexto(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();

  // Date do Excel chega como objeto Date em alguns casos
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Número de série do Excel (ex.: 45259)
  if (typeof v === "number") {
    return normalizarData(v);
  }

  return String(v).trim();
}

// ------------------------------------------------------------------
// Converte data de texto ('DD/MM/YYYY' ou 'YYYY-MM-DD') para ISO
// ou número de série do Excel -> 'YYYY-MM-DD' (sem perder um dia)
// ------------------------------------------------------------------
function normalizarData(valor) {
  if (!valor) return "";

  // Número de série do Excel -> parse_date_code resolve fuso de vez
  if (typeof valor === "number") {
    if (XLSX.SSF && XLSX.SSF.parse_date_code) {
      const dc = XLSX.SSF.parse_date_code(valor);
      if (dc) {
        return `${dc.y}-${String(dc.m).padStart(2, "0")}-${String(dc.d).padStart(2, "0")}`;
      }
    }
    return String(valor);
  }

  const s = String(valor).trim();

  // já ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // datetime ISO: YYYY-MM-DDTHH:MM:SS (pega só a data)
  const mIso = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (mIso) return mIso[1];

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, aaaa] = s.split("/");
    return `${aaaa}-${mm}-${dd}`;
  }

  return s;
}

// ------------------------------------------------------------------
// Normaliza as linhas lidas para o formato esperado pelo RPC
// Mapeia as colunas comuns da planilha de origem.
// ------------------------------------------------------------------
function normalizarLinhas(linhasBrutas) {
  return linhasBrutas.map((r) => ({
    nome: comoTexto(r["Convênio"] || r["Convenio"] || r["Nome"] || ""),
    sistema: comoTexto(r["Sistema"] || ""),
    data_corte: normalizarData(comoTexto(r["Data de Corte"] || r["Data_Corte"] || "")),
    data_lancamento: normalizarData(
      comoTexto(
        r["Data de Lançamento"] ||
          r["Data_Lancamento"] ||
          r["Data de Lançamento"] ||
          "",
      ),
    ),
    lancador: comoTexto(
      r["Responsável"] || r["Responsavel"] || r["Lançador"] || r["Lancador"] || "",
    ),
    validador: comoTexto(
      r["Validação"] || r["Validacao"] || r["Validador"] || "",
    ),
  }));
}

// ------------------------------------------------------------------
// Envia as linhas para o RPC importar_planilha
// ------------------------------------------------------------------
async function importarPlanilha(competencia, linhasBrutas, aoProcessar) {
  const linhas = normalizarLinhas(linhasBrutas);

  // Remove linhas completamente vazias (sem nome)
  const validas = linhas.filter((l) => l.nome !== "");

  if (validas.length === 0) {
    return { ok: false, erro: "Nenhuma linha válida encontrada na planilha." };
  }

  try {
    const { data, error } = await clienteSupabase.rpc("importar_planilha", {
      p_competencia: competencia,
      p_linhas: validas,
    });

    if (error) {
      console.error("Erro no importar_planilha:", error);
      return { ok: false, erro: error.message };
    }

    return {
      ok: true,
      resultados: data || [],
    };
  } catch (e) {
    console.error("Falha inesperada no importar_planilha:", e);
    return { ok: false, erro: e.message || String(e) };
  }
}
