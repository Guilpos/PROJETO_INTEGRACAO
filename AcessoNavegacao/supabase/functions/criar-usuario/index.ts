import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responder({ error: "Método não permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Configuração do Supabase incompleta na Edge Function.");
      return responder({ error: "Configuração do servidor incompleta." }, 500);
    }

    if (!authorization?.startsWith("Bearer ")) {
      return responder({ error: "Sessão ausente. Entre novamente." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return responder({ error: "Sessão inválida. Entre novamente." }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: perfil, error: perfilError } = await adminClient
      .from("usuarios")
      .select("tipo_usuario, ativo")
      .eq("id", userData.user.id)
      .single();

    if (perfilError || !perfil || perfil.tipo_usuario !== "master" || perfil.ativo !== true) {
      return responder({ error: "Somente usuários master ativos podem cadastrar usuários." }, 403);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      console.error("Corpo JSON inválido:", error);
      return responder({ error: "Dados do cadastro inválidos." }, 400);
    }

    if (typeof body !== "object" || body === null) {
      return responder({ error: "Dados do cadastro inválidos." }, 400);
    }

    const dados = body as Record<string, unknown>;
    const nome = typeof dados.nome_completo === "string" ? dados.nome_completo.trim() : "";
    const email = typeof dados.email === "string" ? dados.email.trim().toLowerCase() : "";
    const senha = typeof dados.senha === "string" ? dados.senha : "";
    const cargo = typeof dados.cargo === "string" ? dados.cargo.trim() : "";
    const tipoUsuario = dados.tipo_usuario;

    if (!nome || !email || !email.includes("@") || senha.length < 6 || !cargo) {
      return responder({ error: "Preencha os campos corretamente; a senha deve ter ao menos 6 caracteres." }, 400);
    }

    if (tipoUsuario !== "viewer" && tipoUsuario !== "admin" && tipoUsuario !== "master") {
      return responder({ error: "Nível de acesso inválido." }, 400);
    }

    const { data: cadastro, error: cadastroError } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        nome_completo: nome,
        tipo_usuario: tipoUsuario,
        cargo,
      },
    });

    if (cadastroError) {
      return responder({ error: cadastroError.message }, 400);
    }

    const { error: insertError } = await adminClient
      .from("usuarios")
      .upsert({
        id: cadastro.user.id,
        nome_completo: nome,
        email,
        tipo_usuario: tipoUsuario,
        cargo,
        ativo: true,
      }, { onConflict: "id", ignoreDuplicates: true });

    if (insertError) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(cadastro.user.id);
      if (deleteError) {
        console.error("Não foi possível remover a conta após falha ao criar o perfil:", deleteError);
      }
      console.error("Falha ao criar o perfil do usuário:", insertError);
      return responder({ error: "A conta foi criada, mas não foi possível salvar o perfil." }, 500);
    }

    return responder({ user: { id: cadastro.user.id, email: cadastro.user.email } }, 201);
  } catch (error) {
    console.error("Erro inesperado ao cadastrar usuário:", error);
    return responder({ error: "Erro interno ao cadastrar usuário." }, 500);
  }
});
