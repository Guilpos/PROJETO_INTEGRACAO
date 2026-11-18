-- ============================================================================
-- RPCs — funções Postgres do calendário de lançamentos
-- ============================================================================

-- Habilita a extensão unaccent (uma única vez, antes das funções)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
-- RPC 1: criar_competencia(nova_competencia TEXT)
-- Gera o grid vazio: insere todos os convênios ativos na nova competência,
-- SEM datas, SEM responsáveis (o usuário preenche depois).
-- Retorna o número de linhas inseridas.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION criar_competencia(nova_competencia TEXT)
RETURNS INTEGER AS $$
DECLARE
    inseridos INTEGER;
BEGIN
    INSERT INTO calendario_competencias (convenio_id, competencia)
    SELECT id, nova_competencia
    FROM convenios
    WHERE ativo = TRUE
    ON CONFLICT (convenio_id, competencia) DO NOTHING;

    GET DIAGNOSTICS inseridos = ROW_COUNT;
    RETURN inseridos;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- RPC 2: importar_planilha(p_competencia TEXT, p_linhas JSONB)
-- Faz o match por nome (com unaccent + trim) e monta/atualiza as linhas.
-- Regra: mesmo nome => mesmo id; nome mudado => convênio novo (id novo).
-- p_linhas: [{"nome":"...","sistema":"...","data_corte":"YYYY-MM-DD","data_lancamento":"YYYY-MM-DD","lancador":"...","validador":"..."}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION importar_planilha(
    p_competencia TEXT,
    p_linhas JSONB
)
RETURNS TABLE (
    status TEXT,
    convenio_nome TEXT,
    criado_convenio BOOLEAN
) AS $$
DECLARE
    linha JSONB;
    v_nome TEXT;
    v_convenio_id BIGINT;
    v_lancador_id UUID;
    v_validador_id UUID;
    v_criou BOOLEAN;
BEGIN
    FOR linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
        v_nome := TRIM(linha ->> 'nome');
        v_criou := FALSE;

        -- match normalizado (ignora caixa e acentos)
        SELECT id INTO v_convenio_id
        FROM convenios
        WHERE lower(unaccent(nome)) = lower(unaccent(v_nome))
        LIMIT 1;

        IF v_convenio_id IS NULL THEN
            INSERT INTO convenios (nome, sistema)
            VALUES (v_nome, NULLIF(TRIM(linha ->> 'sistema'), ''))
            RETURNING id INTO v_convenio_id;
            v_criou := TRUE;
        END IF;

        -- resolve responsável: aceita id (uuid) ou nome; se vier vazio, deixa NULL
        IF linha ->> 'lancador' IS NOT NULL AND linha ->> 'lancador' <> '' THEN
            SELECT id INTO v_lancador_id FROM usuarios
            WHERE (id::text = linha ->> 'lancador' OR lower(unaccent(nome_completo)) = lower(unaccent(TRIM(linha ->> 'lancador'))))
              AND cargo = 'lancador'
            LIMIT 1;
        ELSE
            v_lancador_id := NULL;
        END IF;

        IF linha ->> 'validador' IS NOT NULL AND linha ->> 'validador' <> '' THEN
            SELECT id INTO v_validador_id FROM usuarios
            WHERE (id::text = linha ->> 'validador' OR lower(unaccent(nome_completo)) = lower(unaccent(TRIM(linha ->> 'validador'))))
              AND cargo = 'validador'
            LIMIT 1;
        ELSE
            v_validador_id := NULL;
        END IF;

        INSERT INTO calendario_competencias
            (convenio_id, competencia, lancador_id, validador_id, data_de_corte, data_de_lancamento)
        VALUES
            (v_convenio_id,
             p_competencia,
             v_lancador_id,
             v_validador_id,
             CASE WHEN linha ->> 'data_corte' IN ('', NULL) THEN NULL ELSE (linha ->> 'data_corte')::date END,
             CASE WHEN linha ->> 'data_lancamento' IN ('', NULL) THEN NULL ELSE (linha ->> 'data_lancamento')::date END)
        ON CONFLICT (convenio_id, competencia)
        DO UPDATE SET
            lancador_id      = EXCLUDED.lancador_id,
            validador_id     = EXCLUDED.validador_id,
            data_de_corte    = EXCLUDED.data_de_corte,
            data_de_lancamento = EXCLUDED.data_de_lancamento,
            alterado_em      = NOW();

        status := 'ok';
        convenio_nome := v_nome;
        criado_convenio := v_criou;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
