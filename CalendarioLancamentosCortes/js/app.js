// ============================================================
// app.js — orquestração da interface (VERSÃO REAL — Supabase)
// ------------------------------------------------------------
// Sessão via auth.js (token # do app do colega).
// Fonte: view vw_calendario_completo + clienteSupabase.
// Recursos: edição célula a célula, excluir linha, ordenação.
// ============================================================

let abaAtiva = "lancamentos";

// ------------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------------
(async function init() {
  // 1. Recupera a sessão (via auth.js)
  const contexto = await inicializarSessao();
  if (!contexto) {
    mostrarSemSessao();
    return;
  }
  perfilAtual = contexto.perfil;

  // 2. Busca o perfil do usuário na tabela usuarios
  const user = await obterUsuario();
  if (user && user.id) {
    perfilAtual = await obterPerfil(user.id);
  }

  // 3. Se não pode editar, desabilita ações de escrita
  const podeEd = perfilAtual && podeEditar(perfilAtual);
  if (perfilAtual && !podeEd) {
    document.getElementById("btn-nova-competencia").disabled = true;
    document.getElementById("btn-upload").disabled = true;
    document.getElementById("btn-novo-convenio").disabled = true;
  }

  // 4. Data de hoje no título
  const agora = new Date();
  document.getElementById("data-hoje").textContent =
    `${String(agora.getDate()).padStart(2, "0")}/${String(agora.getMonth() + 1).padStart(2, "0")}/${agora.getFullYear()}`;

  // 5. Carrega responsáveis e competências
  await carregarResponsaveis();
  const competencias = await carregarCompetencias();
  await recarregarSeletor(competencias);
  if (competencias.length > 0) {
    competenciaSelecionada = competencias[0];
  }

  // 6. Renderiza
  await renderizar();

  // 7. Eventos
  bindEventos();
})();

// ------------------------------------------------------------------
// Aviso de sessão ausente
// ------------------------------------------------------------------
function mostrarSemSessao() {
  const aviso = document.getElementById("aviso-pendencias");
  aviso.textContent = "Você não está autenticado. Faça login no app do colega.";
  aviso.style.display = "block";
  document.getElementById("tabela-pendencias").innerHTML = "";
  document.getElementById("tabela-base").innerHTML = "";
  document.getElementById("card-alertas").style.display = "none";
}

// ------------------------------------------------------------------
// (Re)monta o seletor de competências sem recarregar a página
// ------------------------------------------------------------------
async function recarregarSeletor(competencias) {
  const seletor = document.getElementById("seletor-competencia");
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

// ------------------------------------------------------------------
// Renderização principal
// ------------------------------------------------------------------
async function renderizar() {
  if (!competenciaSelecionada) return;

  document.getElementById("label-competencia").textContent = competenciaLabel(
    competenciaSelecionada,
  );

  // Recarrega as linhas SEMPRE (garante dados frescos)
  linhasBase = await carregarLinhas(competenciaSelecionada);

  // Cada seção é independente: um erro numa não trava as outras
  try {
    renderizarPendencias();
  } catch (e) {
    console.error("Erro em renderizarPendencias:", e);
  }

  try {
    renderizarAlertas();
  } catch (e) {
    console.error("Erro em renderizarAlertas:", e);
  }

  try {
    renderizarBase();
  } catch (e) {
    console.error("Erro em renderizarBase:", e);
  }
}

// ------------------------------------------------------------------
// Grade de pendências (abas)
// ------------------------------------------------------------------
function renderizarPendencias() {
  let linhas;
  if (abaAtiva === "lancamentos") linhas = filtroLancamentosHoje(linhasBase);
  else if (abaAtiva === "cortes") linhas = filtroCortesHoje(linhasBase);
  else linhas = filtroPeriodoLancamento(linhasBase);

  const aviso = document.getElementById("aviso-pendencias");

  // Recalcula o "hoje" na hora (sem depender de valor capturado antes)
  const hojeTxt = formatarDataBR(hojeBR());

  if (linhas.length === 0) {
    aviso.textContent = `Nenhum convênio nesta categoria para hoje (${hojeTxt}).`;
  } else {
    const rotulo = {
      lancamentos: "lançar",
      cortes: "que cortam",
      periodo: "em período de lançamento",
    }[abaAtiva];
    aviso.textContent = `Atenção: Existem ${linhas.length} convênio(s) para ${rotulo} hoje (${hojeTxt})!`;
  }
  aviso.style.display = "block";

  const tbody = document.querySelector("#tabela-pendencias tbody");
  tbody.innerHTML = "";
  linhas.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>${escapar(l.convenio_nome)}</td>
            <td>${formatarDataBR(l.data_de_corte)}</td>
            <td>${formatarDataBR(l.data_de_lancamento)}</td>
            <td>${escapar(l.lancador_nome || "—")}</td>
            <td>${escapar(l.validador_nome || "—")}</td>`;
    tbody.appendChild(tr);
  });
}

// ------------------------------------------------------------------
// Alertas (4 categorias, sobre linhas completas)
// ------------------------------------------------------------------
function renderizarAlertas() {
  const alertas = calcularAlertas(linhasBase);
  const total = totalAlertas(alertas);

  document.getElementById("titulo-alertas").textContent =
    `🔔 Alertas (${total})`;

  const lista = document.getElementById("lista-alertas");
  lista.innerHTML = "";

  if (total === 0) {
    lista.innerHTML = '<div class="alerta-item">Sem alertas.</div>';
    return;
  }

  function bloco(titulo, itens, formatador) {
    if (itens.length === 0) return "";
    let html = `<strong style="color:#ff7b72;">⚠️ ${titulo}</strong>`;
    itens.forEach((it) => {
      html += `<div class="alerta-item">• <strong>${escapar(it.convenio_nome)}</strong>: ${formatador(it)}</div>`;
    });
    return html;
  }

  lista.innerHTML = [
    bloco(
      "Lançamento no mesmo dia ou depois do corte",
      alertas.invasao,
      (it) =>
        `${formatarDataBR(it.data_de_lancamento)} ≥ ${formatarDataBR(it.data_de_corte)}`,
    ),
    bloco(
      "Data de Lançamento em fim de semana",
      alertas.fimDeSemana,
      (it) => `${formatarDataBR(it.data_de_lancamento)} (${it.diaSemana})`,
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

// ------------------------------------------------------------------
// Base da competência (planilha editável célula a célula + ordenação)
// ------------------------------------------------------------------
function renderizarBase() {
  const termo = (document.getElementById("busca-base").value || "")
    .trim()
    .toLowerCase();
  const campoFiltro = document.getElementById("filtro-campo-base").value;

  let linhasFiltradas = linhasBase.filter((l) => {
    if (!termo) return true;

    // Busca em todos os campos
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

    // Busca num campo específico
    const valor = l[campoFiltro];
    if (valor === null || valor === undefined) return false;

    // Para datas, busca no texto formatado também (dd/mm/yyyy OU yyyy-mm-dd)
    if (
      campoFiltro === "data_de_corte" ||
      campoFiltro === "data_de_lancamento"
    ) {
      const iso = String(valor).slice(0, 10); // 2026-11-25
      const br = formatarDataBR(valor); // 25/11/2026
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

    tr.innerHTML = `
            <td>${escapar(l.convenio_nome)}${naoLanca ? ' <span class="badge-nao-lanca">(não lança)</span>' : ""}</td>
            <td>${escapar(l.sistema || "—")}</td>
            <td><input type="date" data-campo="data_de_corte" data-id="${l.id}" value="${l.data_de_corte ? String(l.data_de_corte).slice(0, 10) : ""}"></td>
            <td><input type="date" data-campo="data_de_lancamento" data-id="${l.id}" value="${l.data_de_lancamento ? String(l.data_de_lancamento).slice(0, 10) : ""}"></td>
            <td>${selectResponsavel("lancador_id", l, lançadores)}</td>
            <td>${selectResponsavel("validador_id", l, validadores)}</td>
            <td><button class="btn-excluir" data-id="${l.id}" data-nome="${escapar(l.convenio_nome)}" title="Excluir linha desta competência">🗑</button></td>`;

    tbody.appendChild(tr);
  });

  // events dos inputs/selects
  tbody
    .querySelectorAll("input[data-campo], select[data-campo]")
    .forEach((el) => {
      el.addEventListener("change", (e) => salvarCelula(e.target));
    });

  // events dos botões de excluir
  tbody.querySelectorAll(".btn-excluir").forEach((btn) => {
    btn.addEventListener("click", () => {
      excluirLinha(btn.dataset.id, btn.dataset.nome);
    });
  });

  // atualiza indicadores de ordenação nos cabeçalhos
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
  let opcoes = `<option value="">—</option>`;
  (lista || []).forEach((u) => {
    const sel = u.id === idAtual ? "selected" : "";
    opcoes += `<option value="${u.id}" ${sel}>${escapar(u.nome_completo)}</option>`;
  });
  const disabled = perfilAtual && podeEditar(perfilAtual) ? "" : "disabled";
  return `<select data-campo="${campo}" data-id="${linha.id}" ${disabled}>${opcoes}</select>`;
}

// ------------------------------------------------------------------
// Salvar edição célula a célula (grava DATE puro, sem hora)
// ------------------------------------------------------------------
async function salvarCelula(el) {
  if (perfilAtual && !podeEditar(perfilAtual)) return;

  const id = el.dataset.id;
  const campo = el.dataset.campo;
  const valor = el.value;

  const payload = {};
  if (campo === "data_de_corte" || campo === "data_de_lancamento") {
    // Colunas DATE: grava apenas 'YYYY-MM-DD' puro (sem T00:00:00)
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
  await renderizar();
}

// ------------------------------------------------------------------
// Excluir linha da competência (mantém o convênio no cadastro)
// ------------------------------------------------------------------
async function excluirLinha(id, nomeConvenio) {
  if (perfilAtual && !podeEditar(perfilAtual)) return;

  const confirmar = window.confirm(
    `Excluir a linha do convênio "${nomeConvenio}" desta competência?\n` +
      `(O convênio em si NÃO será apagado — apenas esta linha.)`,
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

  await renderizar();
}

// ------------------------------------------------------------------
// Nova competência (sem reload — mantém a sessão no iframe)
// ------------------------------------------------------------------
async function criarCompetencia() {
  if (perfilAtual && !podeEditar(perfilAtual)) return;

  const base = competenciaSelecionada || competenciaAtual();
  const nova = proximaCompetencia(base);
  const confirmar = window.confirm(
    `Criar a competência ${competenciaLabel(nova)}?\n` +
      `Serão criadas as linhas de todos os convênios ativos, em branco.`,
  );
  if (!confirmar) return;

  const { data, error } = await clienteSupabase.rpc("criar_competencia", {
    nova_competencia: nova,
  });
  if (error) {
    alert("Erro: " + error.message);
    return;
  }

  const competencias = await carregarCompetencias();
  await recarregarSeletor(competencias);
  competenciaSelecionada = nova;
  document.getElementById("seletor-competencia").value = nova;
  await renderizar();
  alert(`Competência ${competenciaLabel(nova)} criada.`);
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

  alert(`Convênio "${data.nome}" adicionado.`);
  await renderizar();
}

// ------------------------------------------------------------------
// Baixar planilha da competência atual (.xlsx, fallback .csv)
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
    XLSX.writeFile(wb, `calendario_${competenciaSelecionada}.xlsx`);
  } else {
    baixarCSV(dados);
  }
}

function baixarCSV(dados) {
  if (!dados.length) return;
  const cabecalhos = Object.keys(dados[0]);
  const linhas = [
    cabecalhos.join(";"),
    ...dados.map((obj) =>
      cabecalhos
        .map((c) => {
          const v = obj[c] == null ? "" : String(obj[c]);
          return v.includes(";") ? `"${v}"` : v;
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
  a.download = `calendario_${competenciaSelecionada}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------
// Upload de planilha
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
  alert(
    `Importação concluída: ${resultado.resultados.length} linha(s) processada(s), ${criados} convênio(s) novo(s) criado(s).`,
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

  document
    .getElementById("seletor-competencia")
    .addEventListener("change", async (e) => {
      competenciaSelecionada = e.target.value;
      ordenacaoBase = { campo: null, direcao: 1 };
      await renderizar();
    });

  // Ordenação por cabeçalho clicável
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

  document
    .getElementById("btn-nova-competencia")
    .addEventListener("click", criarCompetencia);
  document
    .getElementById("btn-novo-convenio")
    .addEventListener("click", abrirModalNovoConvenio);
  document
    .getElementById("btn-baixar-planilha")
    .addEventListener("click", baixarPlanilha);

  document.getElementById("btn-upload").addEventListener("click", () => {
    document.getElementById("input-upload").click();
  });
  document.getElementById("input-upload").addEventListener("change", (e) => {
    if (e.target.files.length) acionarUpload(e.target.files[0]);
  });

  document
    .getElementById("btn-toggle-alertas")
    .addEventListener("click", () => {
      const lista = document.getElementById("lista-alertas");
      const btn = document.getElementById("btn-toggle-alertas");
      const visivel = lista.style.display !== "none";
      lista.style.display = visivel ? "none" : "block";
      btn.textContent = visivel ? "Mostrar" : "Ocultar";
    });

  document
    .getElementById("busca-base")
    .addEventListener("input", renderizarBase);

  document
    .getElementById("filtro-campo-base")
    .addEventListener("change", renderizarBase);
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
