-- ============================================================================
-- CALENDÁRIO DE LANÇAMENTOS — DDL (Supabase / PostgreSQL)
-- Escopo: apenas o calendário de datas de corte e lançamento por competência.
-- A tabela `usuarios` (com `tipo_usuario` e `cargo`) é responsabilidade do colega.
-- Execute no SQL Editor do Supabase, na ordem, após a tabela `usuarios` existir.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CONVÊNIOS (identidade fixa, âncora do histórico entre competências)
-- ---------------------------------------------------------------------------
CREATE TABLE convenios (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    sistema TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. CALENDÁRIO DE COMPETÊNCIAS (histórico mês a mês)
--    Esta tabela também é consumida pelo programa de confirmação de
--    lançamentos/validação — é a fonte de verdade compartilhada.
-- ---------------------------------------------------------------------------
CREATE TABLE calendario_competencias (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    convenio_id BIGINT NOT NULL REFERENCES convenios(id) ON DELETE RESTRICT,
    competencia TEXT NOT NULL,               -- formato 'YYYY-MM'

    -- Atribuição de responsáveis (consumida pelo outro programa)
    lancador_id  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    validador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    data_de_corte TIMESTAMPTZ,
    data_de_lancamento TIMESTAMPTZ,
    alterado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Impede duplicar o mesmo convênio dentro da mesma competência
    CONSTRAINT uq_convenio_competencia UNIQUE (convenio_id, competencia)
);

CREATE INDEX idx_cal_competencia ON calendario_competencias(competencia);
CREATE INDEX idx_cal_convenio    ON calendario_competencias(convenio_id);
CREATE INDEX idx_cal_lancador    ON calendario_competencias(lancador_id);
CREATE INDEX idx_cal_validador   ON calendario_competencias(validador_id);

-- ---------------------------------------------------------------------------
-- 3. TRIGGER: atualiza 'alterado_em' automaticamente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION atualizar_timestamp_modificacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.alterado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cal_alterado_em
BEFORE UPDATE ON calendario_competencias
FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp_modificacao();

-- ---------------------------------------------------------------------------
-- 4. TRIGGER: valida cargo de lançador/validador
--    (supervisor fica naturalmente de fora das duas listas)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validar_funcoes_calendario()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lancador_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM usuarios WHERE id = NEW.lancador_id AND cargo = 'lancador'
    ) THEN
        RAISE EXCEPTION 'O usuário selecionado não possui o cargo de Lançador.';
    END IF;

    IF NEW.validador_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM usuarios WHERE id = NEW.validador_id AND cargo = 'validador'
    ) THEN
        RAISE EXCEPTION 'O usuário selecionado não possui o cargo de Validador.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_funcoes_calendario
BEFORE INSERT OR UPDATE ON calendario_competencias
FOR EACH ROW EXECUTE FUNCTION validar_funcoes_calendario();

-- ---------------------------------------------------------------------------
-- 5. VIEW completa (alimenta o front)
-- ---------------------------------------------------------------------------
CREATE VIEW vw_calendario_completo AS
SELECT
    cc.id,
    cc.convenio_id,
    c.nome     AS convenio_nome,
    c.sistema,
    c.ativo    AS convenio_ativo,
    cc.competencia,
    cc.lancador_id,
    lu.nome_completo AS lancador_nome,
    cc.validador_id,
    vu.nome_completo AS validador_nome,
    cc.data_de_corte,
    cc.data_de_lancamento,
    cc.alterado_em
FROM calendario_competencias cc
JOIN convenios c ON c.id = cc.convenio_id
LEFT JOIN usuarios lu ON lu.id = cc.lancador_id
LEFT JOIN usuarios vu ON vu.id = cc.validador_id;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE convenios ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_competencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura_conv" ON convenios
    FOR SELECT USING (EXISTS (SELECT 1 FROM usuarios u
                              WHERE u.id = auth.uid() AND u.ativo = TRUE));

CREATE POLICY "edicao_conv" ON convenios
    FOR ALL USING (EXISTS (SELECT 1 FROM usuarios u
                           WHERE u.id = auth.uid() AND u.tipo_usuario IN ('master','admin') AND u.ativo = TRUE))
    WITH CHECK (EXISTS (SELECT 1 FROM usuarios u
                        WHERE u.id = auth.uid() AND u.tipo_usuario IN ('master','admin') AND u.ativo = TRUE));

CREATE POLICY "leitura_cal" ON calendario_competencias
    FOR SELECT USING (EXISTS (SELECT 1 FROM usuarios u
                              WHERE u.id = auth.uid() AND u.ativo = TRUE));

CREATE POLICY "edicao_cal" ON calendario_competencias
    FOR ALL USING (EXISTS (SELECT 1 FROM usuarios u
                           WHERE u.id = auth.uid() AND u.tipo_usuario IN ('master','admin') AND u.ativo = TRUE))
    WITH CHECK (EXISTS (SELECT 1 FROM usuarios u
                        WHERE u.id = auth.uid() AND u.tipo_usuario IN ('master','admin') AND u.ativo = TRUE));
