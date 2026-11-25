// ============================================================
// app.js — orquestração da interface (VERSÃO REAL — Supabase)
// ------------------------------------------------------------
// Sessão via auth.js (token # do app do colega).
// Fonte: view vw_calendario_completo + clienteSupabase.
// Recursos: edição célula a célula, excluir, ordenar, filtro
// por coluna e REGISTRO DE ATIVIDADES (log_atividades).
// ============================================================

const SISTEMA_ATUAL = "Agenda de Lançamento";

let abaAtiva = "lancamentos";

// ------------------------------------------------------------------
// Registra uma atividade no log (chama o RPC registrar_atividade)
// ------------------------------------------------------------------
async function registrarLog(atividade, opcoes = {}) {
  try {
    await clienteSupabase.rpc("registrar_atividade", {
      p_sistema: SISTEMA_ATUAL,
      p_atividade: atividade,
      p_alvo_tipo: opcoes.alvoTipo || null,
      p_alvo_descricao: opcoes.alvo || null,
      p_competencia: opcoes.competencia || competenciaSelecionada || null,
      p_detalhe: opcoes.detalhe || {},
    });
  } catch (e) {
    // Log nunca deve travar a ação principal
    console.error("Falha ao registrar atividade:", e);
  }
}

// ------------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------------
(async function init() {
  try {
    await inicializarSessao();
  } catch (e) {
    console.error("Falha ao inicializar sessão:", e);
  }

  perfilAtual = await obterSessaoPerfil();
  if (!perfilAtual) {
    mostrarSemSessao();
    return;
  }

  // ------------------------------------------------------------------
  // Busca o perfil COMPLETO do usuário logado na tabela 'usuarios'.
  // Retorna { id, nome_completo, email, cargo, tipo_usuario, ativo } ou null.
  // ------------------------------------------------------------------
  async function obterSessaoPerfil() {
    try {
      const userId =
        typeof userIdAtual !== "undefined" && userIdAtual ? userIdAtual : null;

      if (!userId) {
        // fallback: tenta decodificar o JWT para achar o sub
        const sessao = await obterSessao();
        if (!sessao) return null;

        const { data, error } = await clienteSupabase.auth.getUser();
        if (error || !data || !data.user) return null;

        const id = data.user.id;
        const { data: perfil } = await clienteSupabase
          .from("usuarios")
          .select("id, nome_completo, email, cargo, tipo_usuario, ativo")
          .eq("id", id)
          .maybeSingle();

        return perfil || null;
      }

      const { data: perfil, error } = await clienteSupabase
        .from("usuarios")
        .select("id, nome_completo, email, cargo, tipo_usuario, ativo")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar perfil:", error);
        return null;
      }

      return perfil || null;
    } catch (e) {
      console.error("Falha ao obter perfil:", e);
      return null;
    }
  }

  const podeEd = podeEditar(perfilAtual);
  if (!podeEd) {
    const b1 = document.getElementById("btn-nova-competencia");
    const b2 = document.getElementById("btn-upload");
    const b3 = document.getElementById("btn-novo-convenio");
    if (b1) b1.disabled = true;
    if (b2) b2.disabled = true;
    if (b3) b3.disabled = true;
  }

  const agora = new Date();
  const hojeTitulo =
    String(agora.getDate()).padStart(2, "0") +
    "/" +
    String(agora.getMonth() + 1).padStart(2, "0") +
    "/" +
    agora.getFullYear();
  const elHoje = document.getElementById("data-hoje");
  if (elHoje) elHoje.textContent = hojeTitulo;

  await carregarResponsaveis();
  const competencias = await carregarCompetencias();
  await recarregarSeletor(competencias);
  if (competencias.length > 0) {
    competenciaSelecionada = competencias[0];
  }

  await renderizar();
  bindEventos();
})();

function mostrarSemSessao() {
  const aviso = document.getElementById("aviso-pendencias");
  if (aviso) {
    aviso.textContent =
      "Você não está autenticado. Faça login no app do colega.";
    aviso.style.display = "block";
  }
  const tp = document.getElementById("tabela-pendencias");
  const tb = document.getElementById("tabela-base");
  if (tp) tp.innerHTML = "";
  if (tb) tb.innerHTML = "";
  const card = document.getElementById("card-alertas");
  if (card) card.style.display = "none";
}

async function recarregarSeletor(competencias) {
  const seletor = document.getElementById("seletor-competencia");
  if (!seletor) return;
  seletor.innerHTML = "";
  if (!competencias || competencias.length === 0) {
    const opc = document.createElement("option");
    opc.value = "";
    opc.textContent = "Sem competências";
    seletor.appendChild(opc);
    return;
  }
  competencias.forEach((c) => {
    const opc = document.createElement("option");
    opc.value = c;
    opc.textContent = competenciaLabel(c);
    seletor.appendChild(opc);
  });
  seletor.value = competencias[0];
}

async function renderizar() {
  if (!competenciaSelecionada) return;
  const lbl = document.getElementById("label-competencia");
  if (lbl) lbl.textContent = competenciaLabel(competenciaSelecionada);

  linhasBase = await carregarLinhas(competenciaSelecionada);

  try {
    renderizarPendencias();
  } catch (e) {
    console.error("Pendências:", e);
  }
  try {
    renderizarAlertas();
  } catch (e) {
    console.error("Alertas:", e);
  }
  try {
    renderizarBase();
  } catch (e) {
    console.error("Base:", e);
  }
}

function renderizarPendencias() {
  let linhas;
  if (abaAtiva === "lancamentos") linhas = filtroLancamentosHoje(linhasBase);
  else if (abaAtiva === "cortes") linhas = filtroCortesHoje(linhasBase);
  else linhas = filtroPeriodoLancamento(linhasBase);

  const aviso = document.getElementById("aviso-pendencias");
  const hojeTxt = formatarDataBR(hojeBR());

  if (linhas.length === 0) {
    aviso.textContent =
      "Nenhum convênio nesta categoria para hoje (" + hojeTxt + ").";
  } else {
    const rotulo = {
      lancamentos: "lançar",
      cortes: "que cortam",
      periodo: "em período de lançamento",
    }[abaAtiva];
    aviso.textContent =
      "Atenção: Existem " +
      linhas.length +
      " convênio(s) para " +
      rotulo +
      " hoje (" +
      hojeTxt +
      ")!";
  }
  aviso.style.display = "block";

  const tbody = document.querySelector("#tabela-pendencias tbody");
  tbody.innerHTML = "";
  linhas.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      escapar(l.convenio_nome) +
      "</td>" +
      "<td>" +
      formatarDataBR(l.data_de_corte) +
      "</td>" +
      "<td>" +
      formatarDataBR(l.data_de_lancamento) +
      "</td>" +
      "<td>" +
      escapar(l.lancador_nome || "—") +
      "</td>" +
      "<td>" +
      escapar(l.validador_nome || "—") +
      "</td>";
    tbody.appendChild(tr);
  });
}

function renderizarAlertas() {
  const alertas = calcularAlertas(linhasBase);
  const total = totalAlertas(alertas);
  const titulo = document.getElementById("titulo-alertas");
  if (titulo) titulo.textContent = "\u{1F514} Alertas (" + total + ")";

  const lista = document.getElementById("lista-alertas");
  if (!lista) return;
  lista.innerHTML = "";
  if (total === 0) {
    lista.innerHTML = '<div class="alerta-item">Sem alertas.</div>';
    return;
  }
  function bloco(txt, itens, fmt) {
    if (itens.length === 0) return "";
    let h = '<strong style="color:#ff7b72;">\u26A0\uFE0F ' + txt + "</strong>";
    itens.forEach((it) => {
      h +=
        '<div class="alerta-item">• <strong>' +
        escapar(it.convenio_nome) +
        "</strong>: " +
        fmt(it) +
        "</div>";
    });
    return h;
  }
  lista.innerHTML = [
    bloco(
      "Lançamento no mesmo dia ou depois do corte",
      alertas.invasao,
      (it) =>
        formatarDataBR(it.data_de_lancamento) +
        " \u2265 " +
        formatarDataBR(it.data_de_corte),
    ),
    bloco(
      "Data de Lançamento em fim de semana",
      alertas.fimDeSemana,
      (it) => formatarDataBR(it.data_de_lancamento) + " (" + it.diaSemana + ")",
    ),
    bloco(
      "Data de Lançamento com mais de 30 dias de distância",
      alertas.distanciaLancamento,
      (it) => formatarDataBR(it.data_de_lancamento),
    ),
    bloco(
      "Data de Corte com mais de 30 dias de distância",
      alertas.distanciaCorte,
      (it) => formatarDataBR(it.data_de_corte),
    ),
  ].join("");
}

function renderizarBase() {
  const inputBusca = document.getElementById("busca-base");
  const termo = (inputBusca ? inputBusca.value : "").trim().toLowerCase();
  const selCampo = document.getElementById("filtro-campo-base");
  const campoFiltro = selCampo ? selCampo.value : "todos";

  let linhasFiltradas = linhasBase.filter((l) => {
    if (!termo) return true;
    if (campoFiltro === "todos") {
      const campos = [
        l.convenio_nome,
        l.sistema,
        l.lancador_nome,
        l.validador_nome,
        l.data_de_corte,
        l.data_de_lancamento,
      ];
      return campos.some((c) => c && String(c).toLowerCase().includes(termo));
    }
    const valor = l[campoFiltro];
    if (valor === null || valor === undefined) return false;
    if (
      campoFiltro === "data_de_corte" ||
      campoFiltro === "data_de_lancamento"
    ) {
      const iso = String(valor).slice(0, 10);
      const br = formatarDataBR(valor);
      return (
        iso.toLowerCase().includes(termo) || br.toLowerCase().includes(termo)
      );
    }
    return String(valor).toLowerCase().includes(termo);
  });

  if (ordenacaoBase.campo) {
    linhasFiltradas = ordenarLinhas(
      linhasFiltradas,
      ordenacaoBase.campo,
      ordenacaoBase.direcao,
    );
  }

  const tbody = document.querySelector("#tabela-base tbody");
  tbody.innerHTML = "";
  linhasFiltradas.forEach((l) => {
    const tr = document.createElement("tr");
    const naoLanca = ehNaoLanca(l);
    tr.innerHTML =
      "<td>" +
      escapar(l.convenio_nome) +
      (naoLanca ? ' <span class="badge-nao-lanca">(não lança)</span>' : "") +
      "</td>" +
      "<td>" +
      escapar(l.sistema || "—") +
      "</td>" +
      '<td><input type="date" data-campo="data_de_corte" data-id="' +
      l.id +
      '" value="' +
      (l.data_de_corte ? String(l.data_de_corte).slice(0, 10) : "") +
      '"></td>' +
      '<td><input type="date" data-campo="data_de_lancamento" data-id="' +
      l.id +
      '" value="' +
      (l.data_de_lancamento ? String(l.data_de_lancamento).slice(0, 10) : "") +
      '"></td>' +
      "<td>" +
      selectResponsavel("lancador_id", l, lançadores) +
      "</td>" +
      "<td>" +
      selectResponsavel("validador_id", l, validadores) +
      "</td>" +
      '<td><button class="btn-excluir" data-id="' +
      l.id +
      '" data-nome="' +
      escapar(l.convenio_nome) +
      '" title="Excluir linha desta competência">🗑</button></td>';
    tbody.appendChild(tr);
  });

  tbody
    .querySelectorAll("input[data-campo], select[data-campo]")
    .forEach((el) => {
      el.addEventListener("change", (e) => salvarCelula(e.target));
    });
  tbody.querySelectorAll(".btn-excluir").forEach((btn) => {
    btn.addEventListener("click", () =>
      excluirLinha(btn.dataset.id, btn.dataset.nome),
    );
  });
  renderizarIndicadoresOrdenacao();
}

function renderizarIndicadoresOrdenacao() {
  document.querySelectorAll("#tabela-base th[data-sort]").forEach((th) => {
    const campo = th.dataset.sort;
    th.innerHTML = th.dataset.label;
    if (ordenacaoBase.campo === campo) {
      th.innerHTML += ordenacaoBase.direcao === 1 ? " ▲" : " ▼";
    }
  });
}

function selectResponsavel(campo, linha, lista) {
  const idAtual = linha[campo] || "";
  let opcoes = '<option value="">—</option>';
  (lista || []).forEach((u) => {
    const sel = u.id === idAtual ? "selected" : "";
    opcoes +=
      '<option value="' +
      u.id +
      '" ' +
      sel +
      ">" +
      escapar(u.nome_completo) +
      "</option>";
  });
  const disabled = perfilAtual && podeEditar(perfilAtual) ? "" : "disabled";
  return (
    '<select data-campo="' +
    campo +
    '" data-id="' +
    linha.id +
    '" ' +
    disabled +
    ">" +
    opcoes +
    "</select>"
  );
}

// ------------------------------------------------------------------
// Salvar edição célula a célula (grava DATE puro + registra log)
// ------------------------------------------------------------------
async function salvarCelula(el) {
  if (perfilAtual && !podeEditar(perfilAtual)) return;

  const id = el.dataset.id;
  const campo = el.dataset.campo;
  const valor = el.value;

  // busca a linha original para montar o "antes" no log
  const linhaAntes = linhasBase.find((l) => String(l.id) === String(id)) || {};
  const valorAntes = linhaAntes[campo] || "";

  const payload = {};
  if (campo === "data_de_corte" || campo === "data_de_lancamento") {
    payload[campo] = valor || null;
  } else {
    payload[campo] = valor || null;
  }

  const { error } = await clienteSupabase
    .from("calendario_competencias")
    .update(payload)
    .eq("id", id);

  if (error) {
    alert("Erro ao salvar: " + error.message);
    return;
  }

  // ---- REGISTRO DE ATIVIDADE ----
  const rotulos = {
    data_de_corte: "Alterou data de corte",
    data_de_lancamento: "Alterou data de lançamento",
    lancador_id: "Alterou responsável (lançador)",
    validador_id: "Alterou responsável (validador)",
  };
  const atividade = rotulos[campo] || "Alterou campo";
  await registrarLog(atividade, {
    alvoTipo: "convenio",
    alvo: linhaAntes.convenio_nome || null,
    detalhe: { campo: campo, de: valorAntes, para: valor },
  });

  await renderizar();
}

// ------------------------------------------------------------------
// Excluir linha da competência (mantém o convênio no cadastro)
// ------------------------------------------------------------------
async function excluirLinha(id, nomeConvenio) {
  if (perfilAtual && !podeEditar(perfilAtual)) return;

  const confirmar = window.confirm(
    'Excluir a linha do convênio "' +
      nomeConvenio +
      '" desta competência?\n' +
      "(O convênio em si NÃO será apagado — apenas esta linha.)",
  );
  if (!confirmar) return;

  const { error } = await clienteSupabase
    .from("calendario_competencias")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }

  await registrarLog("Removeu convênio da competência", {
    alvoTipo: "convenio",
    alvo: nomeConvenio || null,
    detalhe: { linha_id: id },
  });

  await renderizar();
}

// ------------------------------------------------------------------
// Nova competência (sem reload + registro de log)
// ------------------------------------------------------------------
async function criarCompetencia() {
  if (perfilAtual && !podeEditar(perfilAtual)) return;

  const base = competenciaSelecionada || competenciaAtual();
  const nova = proximaCompetencia(base);
  const confirmar = window.confirm(
    "Criar a competência " +
      competenciaLabel(nova) +
      "?\n" +
      "Serão criadas as linhas de todos os convênios ativos, em branco.",
  );
  if (!confirmar) return;

  const { data, error } = await clienteSupabase.rpc("criar_competencia", {
    nova_competencia: nova,
  });
  if (error) {
    alert("Erro: " + error.message);
    return;
  }

  await registrarLog("Criou nova competência", {
    alvoTipo: "competencia",
    alvo: competenciaLabel(nova),
    competencia: nova,
    detalhe: { linhas: data },
  });

  const competencias = await carregarCompetencias();
  await recarregarSeletor(competencias);
  competenciaSelecionada = nova;
  document.getElementById("seletor-competencia").value = nova;
  await renderizar();
  alert("Competência " + competenciaLabel(nova) + " criada.");
}

// ------------------------------------------------------------------
// + Convênio (adicionar manualmente, sem planilha)
// ------------------------------------------------------------------
async function abrirModalNovoConvenio() {
  if (perfilAtual && !podeEditar(perfilAtual)) return;

  if (!competenciaSelecionada || competenciaSelecionada === "") {
    alert("Crie uma competência antes de adicionar um convênio.");
    return;
  }

  const nome = prompt("Nome do convênio:");
  if (nome === null) return;
  if (!nome.trim()) {
    alert("O nome do convênio não pode ser vazio.");
    return;
  }

  const sistema = prompt("Código/Sistema (opcional):") || "";

  const { data, error } = await clienteSupabase.rpc("criar_convenio", {
    p_nome: nome.trim(),
    p_sistema: sistema.trim() || null,
    p_competencia: competenciaSelecionada,
  });

  if (error) {
    alert("Erro: " + error.message);
    return;
  }

  await registrarLog("Adicionou convênio", {
    alvoTipo: "convenio",
    alvo: data.nome,
    detalhe: { sistema: sistema || null },
  });

  alert('Convênio "' + data.nome + '" adicionado.');
  await renderizar();
}

// ------------------------------------------------------------------
// Baixar planilha da competência atual (registra log)
// ------------------------------------------------------------------
async function baixarPlanilha() {
  if (!competenciaSelecionada) {
    alert("Selecione uma competência antes.");
    return;
  }

  const dados = linhasBase.map((l) => ({
    Convênio: l.convenio_nome,
    Sistema: l.sistema || "",
    "Data de Corte": l.data_de_corte ? formatarDataBR(l.data_de_corte) : "",
    "Data de Lançamento": l.data_de_lancamento
      ? formatarDataBR(l.data_de_lancamento)
      : "",
    Responsável: l.lancador_nome || "",
    Validação: l.validador_nome || "",
  }));

  if (!dados.length) {
    alert("Nenhuma linha para exportar.");
    return;
  }

  if (typeof XLSX !== "undefined") {
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, competenciaSelecionada);
    XLSX.writeFile(wb, "calendario_" + competenciaSelecionada + ".xlsx");
  } else {
    baixarCSV(dados);
  }

  await registrarLog("Baixou planilha", {
    alvoTipo: "planilha",
    alvo: competenciaLabel(competenciaSelecionada),
  });
}

function baixarCSV(dados) {
  if (!dados.length) return;
  const cab = Object.keys(dados[0]);
  const linhas = [
    cab.join(";"),
    ...dados.map((obj) =>
      cab
        .map((c) => {
          const v = obj[c] == null ? "" : String(obj[c]);
          return v.includes(";") ? '"' + v + '"' : v;
        })
        .join(";"),
    ),
  ];
  const blob = new Blob(["\ufeff" + linhas.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "calendario_" + competenciaSelecionada + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------
// Upload de planilha (registra log)
// ------------------------------------------------------------------
async function acionarUpload(arquivo) {
  if (perfilAtual && !podeEditar(perfilAtual)) return;
  if (!competenciaSelecionada) {
    alert("Selecione ou crie uma competência antes.");
    return;
  }

  const linhasBrutas = await lerPlanilha(arquivo);
  if (!linhasBrutas.length) {
    alert("Planilha vazia ou sem dados.");
    return;
  }

  const resultado = await importarPlanilha(
    competenciaSelecionada,
    linhasBrutas,
  );
  if (!resultado.ok) {
    alert("Erro: " + resultado.erro);
    return;
  }

  const criados = resultado.resultados.filter((r) => r.criado_convenio).length;

  await registrarLog("Importou planilha", {
    alvoTipo: "planilha",
    alvo: competenciaLabel(competenciaSelecionada),
    detalhe: { linhas: resultado.resultados.length, novos_convenios: criados },
  });

  alert(
    "Importação concluída: " +
      resultado.resultados.length +
      " linha(s) processada(s), " +
      criados +
      " convênio(s) novo(s) criado(s).",
  );
  await renderizar();
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
function bindEventos() {
  document.querySelectorAll("#abas-pendencias .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll("#abas-pendencias .tab")
        .forEach((t) => t.classList.remove("ativa"));
      tab.classList.add("ativa");
      abaAtiva = tab.dataset.tab;
      renderizarPendencias();
    });
  });

  const seletor = document.getElementById("seletor-competencia");
  if (seletor) {
    seletor.addEventListener("change", async (e) => {
      competenciaSelecionada = e.target.value;
      ordenacaoBase = { campo: null, direcao: 1 };
      await renderizar();
    });
  }

  document.querySelectorAll("#tabela-base th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const campo = th.dataset.sort;
      if (ordenacaoBase.campo === campo) {
        ordenacaoBase.direcao = ordenacaoBase.direcao * -1;
      } else {
        ordenacaoBase.campo = campo;
        ordenacaoBase.direcao = 1;
      }
      renderizarBase();
    });
  });

  const fCampo = document.getElementById("filtro-campo-base");
  if (fCampo) fCampo.addEventListener("change", renderizarBase);

  const bNova = document.getElementById("btn-nova-competencia");
  const bNovo = document.getElementById("btn-novo-convenio");
  const bBaixar = document.getElementById("btn-baixar-planilha");
  const bUpload = document.getElementById("btn-upload");
  const inUpload = document.getElementById("input-upload");
  const bToggle = document.getElementById("btn-toggle-alertas");
  const busca = document.getElementById("busca-base");

  if (bNova) bNova.addEventListener("click", criarCompetencia);
  if (bNovo) bNovo.addEventListener("click", abrirModalNovoConvenio);
  if (bBaixar) bBaixar.addEventListener("click", baixarPlanilha);
  if (bUpload)
    bUpload.addEventListener("click", () => inUpload && inUpload.click());
  if (inUpload)
    inUpload.addEventListener("change", (e) => {
      if (e.target.files.length) acionarUpload(e.target.files[0]);
    });
  if (bToggle)
    bToggle.addEventListener("click", () => {
      const lista = document.getElementById("lista-alertas");
      const visivel = lista.style.display !== "none";
      lista.style.display = visivel ? "none" : "block";
      bToggle.textContent = visivel ? "Mostrar" : "Ocultar";
    });
  if (busca) busca.addEventListener("input", renderizarBase);
}

// ------------------------------------------------------------------
// Util: escape de HTML (segurança contra XSS)
// ------------------------------------------------------------------
function escapar(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
