// ============================================================
// dados-mock.js — versão de TESTE (sem login, sem Supabase)
// ------------------------------------------------------------
// Substitui a fonte de dados real por um armazenamento local
// (localStorage do navegador). A lógica de negócio (alertas,
// filtros, regra "não lança") permanece 100% idêntica.
//
// Quando o login do colega + banco estiverem prontos, basta
// voltar a usar as funções originais do supabase (carregarLinhas,
// etc.) e remover este arquivo — ou alternar USAR_MOCK = false.
// ============================================================

window.USAR_MOCK = true;   // ← coloque em false quando for conectar ao Supabase real

const CHAVE_DADOS = 'calendario_mock_v1';

// ------------------------------------------------------------------
// Estado: carrega do localStorage ou cria um conjunto inicial
// ------------------------------------------------------------------
function carregarEstado() {
    const bruto = localStorage.getItem(CHAVE_DADOS);
    if (bruto) {
        try { return JSON.parse(bruto); } catch (e) { /* ignora e recria */ }
    }
    return criarEstadoInicial();
}

function salvarEstado(estado) {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(estado));
}

// ------------------------------------------------------------------
// Estado inicial de demonstração (convênios e usuários fictícios)
// ------------------------------------------------------------------
function criarEstadoInicial() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const competencia = `${ano}-${mes}`;

    // Usuários fictícios (UUIDs fake apenas para referência interna)
    const usuarios = [
        { id: 'u-lancador-1', nome_completo: 'PAULO',    cargo: 'lancador',  tipo_usuario: 'viewer', ativo: true },
        { id: 'u-lancador-2', nome_completo: 'ROGER',    cargo: 'lancador',  tipo_usuario: 'viewer', ativo: true },
        { id: 'u-lancador-3', nome_completo: 'ARTHUR',   cargo: 'lancador',  tipo_usuario: 'viewer', ativo: true },
        { id: 'u-validador-1', nome_completo: 'JUAN',    cargo: 'validador', tipo_usuario: 'viewer', ativo: true },
        { id: 'u-validador-2', nome_completo: 'ADRIANO', cargo: 'validador', tipo_usuario: 'viewer', ativo: true },
        { id: 'u-supervisor-1', nome_completo: 'SUPERVISOR', cargo: 'supervisor', tipo_usuario: 'master', ativo: true }
    ];

    // Convênios de exemplo (seguindo o padrão das imagens)
    const convenios = [
        { id: 1, nome: 'PREF. ANAJATUBA',     sistema: 'Sistema A', ativo: true },
        { id: 2, nome: 'PREF. IMPERATRIZ MA', sistema: 'Sistema A', ativo: true },
        { id: 3, nome: 'PREF. NOVA LIMA',     sistema: 'Sistema B', ativo: true },
        { id: 4, nome: 'PREF. MARABÁ',        sistema: 'Sistema B', ativo: true },
        { id: 5, nome: 'PREF. PERUIBE',       sistema: 'Sistema C', ativo: true }
    ];

    // Ajudante para montar uma linha do calendário
    function linha(id, convenio_id, lancador_id, validador_id, corte, lancamento) {
        const convenio = convenios.find(c => c.id === convenio_id);
        const lancador = usuarios.find(u => u.id === lancador_id);
        const validador = usuarios.find(u => u.id === validador_id);
        return {
            id,
            convenio_id,
            convenio_nome: convenio.nome,
            sistema: convenio.sistema,
            competencia,
            lancador_id: lancador_id || null,
            lancador_nome: lancador ? lancador.nome_completo : null,
            validador_id: validador_id || null,
            validador_nome: validador ? validador.nome_completo : null,
            data_de_corte: corte,
            data_de_lancamento: lancamento
        };
    }

    // Datas relativas a hoje para demonstrar as abas e alertas
    function diasAtras(n) {
        const d = new Date(); d.setDate(d.getDate() - n);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function diasAFrente(n) {
        const d = new Date(); d.setDate(d.getDate() + n);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    const linhas = [
        // 1 - lançamento hoje, completo
        linha(1, 1, 'u-lancador-1', 'u-validador-1', diasAFrente(1), diasAtras(0)),
        // 2 - corte hoje, completo
        linha(2, 2, 'u-lancador-2', 'u-validador-2', diasAtras(0), diasAtras(1)),
        // 3 - em período de lançamento, completo
        linha(3, 3, 'u-lancador-3', 'u-validador-2', diasAFrente(2), diasAtras(1)),
        // 4 - "não lança" (sem validador e sem datas)
        linha(4, 4, 'u-lancador-2', null, null, null),
        // 5 - lançamento em fim de semana futuro + distante (alerta)
        linha(5, 5, 'u-lancador-1', 'u-validador-1', diasAFrente(10), diasAFrente(8))
    ];

    return { usuarios, convenios, linhas, competencias: [competencia] };
}

// ------------------------------------------------------------------
// ADAPTADORES — mesma assinatura das funções originais do calendario.js
// ------------------------------------------------------------------

// "Carrega" as linhas de uma competência
async function carregarLinhas(competencia) {
    const estado = carregarEstado();
    return estado.linhas.filter(l => l.competencia === competencia);
}

// "Carrega" a lista de competências disponíveis
async function carregarCompetencias() {
    const estado = carregarEstado();
    return [...new Set(estado.linhas.map(l => l.competencia))].sort().reverse();
}

// "Carrega" os responsáveis (lançadores e validadores)
async function carregarResponsaveis() {
    const estado = carregarEstado();
    lançadores = estado.usuarios.filter(u => u.cargo === 'lancador');
    validadores = estado.usuarios.filter(u => u.cargo === 'validador');
}

// "Cria" uma nova competência (grid vazio com os convênios ativos)
async function criarCompetenciaMock(novaCompetencia) {
    const estado = carregarEstado();
    let proximoId = estado.linhas.length ? Math.max(...estado.linhas.map(l => l.id)) : 0;
    let inseridos = 0;

    estado.convenios.filter(c => c.ativo).forEach(c => {
        // pula se já existir
        const existe = estado.linhas.some(l => l.convenio_id === c.id && l.competencia === novaCompetencia);
        if (!existe) {
            proximoId++;
            estado.linhas.push({
                id: proximoId,
                convenio_id: c.id,
                convenio_nome: c.nome,
                sistema: c.sistema,
                competencia: novaCompetencia,
                lancador_id: null, lancador_nome: null,
                validador_id: null, validador_nome: null,
                data_de_corte: null, data_de_lancamento: null
            });
            inseridos++;
        }
    });

    salvarEstado(estado);
    return inseridos;
}

// "Salva" uma edição célula a célula
async function salvarCelulaMock(id, campo, valor) {
    const estado = carregarEstado();
    const linha = estado.linhas.find(l => l.id === id);
    if (!linha) return;

    if (campo === 'lancador_id' || campo === 'validador_id') {
        linha[campo] = valor || null;
        const u = estado.usuarios.find(x => x.id === valor);
        const campoNome = campo === 'lancador_id' ? 'lancador_nome' : 'validador_nome';
        linha[campoNome] = u ? u.nome_completo : null;
    } else {
        // data_de_corte / data_de_lancamento -> armazenado 'YYYY-MM-DD'
        linha[campo] = valor ? valor.slice(0, 10) : null;
    }

    salvarEstado(estado);
}

// "Importa" uma planilha (para o modo teste, apenas simula; os dados
// reais virão via RPC quando conectar ao Supabase).
async function importarPlanilhaMock(competencia, linhas) {
    const estado = carregarEstado();
    let proximoId = estado.linhas.length ? Math.max(...estado.linhas.map(l => l.id)) : 0;
    let criados = 0;

    linhas.forEach(l => {
        // match por nome (sem acento, case-insensitive)
        const nomeNorm = l.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let convenio = estado.convenios.find(c =>
            c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === nomeNorm
        );

        if (!convenio) {
            convenio = {
                id: Math.max(...estado.convenios.map(c => c.id)) + 1 + criados,
                nome: l.nome,
                sistema: l.sistema || null,
                ativo: true
            };
            estado.convenios.push(convenio);
            criados++;
        }

        proximoId++;
        estado.linhas.push({
            id: proximoId,
            convenio_id: convenio.id,
            convenio_nome: convenio.nome,
            sistema: convenio.sistema,
            competencia,
            lancador_id: null, lancador_nome: null,
            validador_id: null, validador_nome: null,
            data_de_corte: l.data_corte || null,
            data_de_lancamento: l.data_lancamento || null
        });
    });

    salvarEstado(estado);
    return { ok: true, resultados: linhas.map(() => ({ status: 'ok', criado_convenio: false })),
             criados };
}

// ------------------------------------------------------------------
// Adiciona um convênio novo (manual, sem planilha) na competência atual
// Retorna { ok, convenio } ou { ok:false, erro }
// ------------------------------------------------------------------
async function adicionarConvenioMock(competencia, nome, sistema) {
    const estado = carregarEstado();

    const nomeLimpo = (nome || '').trim();
    if (!nomeLimpo) return { ok: false, erro: 'Informe o nome do convênio.' };

    // Verifica duplicidade (ignorando acento e caixa)
    const nomeNorm = nomeLimpo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const jaExiste = estado.convenios.some(c =>
        c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === nomeNorm
    );
    if (jaExiste) return { ok: false, erro: 'Já existe um convênio com esse nome.' };

    // Cria o convênio
    const novoIdConvenio = (Math.max(...estado.convenios.map(c => c.id)) || 0) + 1;
    const convenio = {
        id: novoIdConvenio,
        nome: nomeLimpo,
        sistema: (sistema || '').trim() || null,
        ativo: true
    };
    estado.convenios.push(convenio);

    // Cria a linha deste convênio na competência selecionada (se houver competência)
    if (competencia) {
        const novoIdLinha = (Math.max(...estado.linhas.map(l => l.id)) || 0) + 1;
        estado.linhas.push({
            id: novoIdLinha,
            convenio_id: convenio.id,
            convenio_nome: convenio.nome,
            sistema: convenio.sistema,
            competencia,
            lancador_id: null, lancador_nome: null,
            validador_id: null, validador_nome: null,
            data_de_corte: null, data_de_lancamento: null
        });
    }

    salvarEstado(estado);
    return { ok: true, convenio };
}

// ------------------------------------------------------------------
// Monta os dados prontos para exportação (array de objetos)
// Formato amigável para a planilha baixada.
// ------------------------------------------------------------------
function montarDadosExportacao(competencia) {
    const estado = carregarEstado();
    return estado.linhas
        .filter(l => l.competencia === competencia)
        .map(l => ({
            'Convênio': l.convenio_nome,
            'Sistema': l.sistema || '',
            'Data de Corte': l.data_de_corte ? formatarDataBR(l.data_de_corte) : '',
            'Data de Lançamento': l.data_de_lancamento ? formatarDataBR(l.data_de_lancamento) : '',
            'Responsável': l.lancador_nome || '',
            'Validação': l.validador_nome || ''
        }));
}
