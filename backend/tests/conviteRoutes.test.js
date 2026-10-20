
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

const usuarioRepository = require(
  "../src/repositories/usuarioRepository"
);

const conviteService = require(
  "../src/services/conviteService"
);

const conviteRoutes = require(
  "../src/routes/conviteRoutes"
);

const SEGREDO_TESTE =
  "segredo-exclusivo-testes-rotas-convites";

const ID_AMBIENTE =
  "11111111-1111-4111-8111-111111111111";

/**
 * Configura o JWT exclusivamente para os testes.
 */
function configurarJwt(t) {
  const anterior = process.env.JWT_SECRET;

  process.env.JWT_SECRET = SEGREDO_TESTE;

  t.after(() => {
    if (anterior === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = anterior;
    }
  });
}

/**
 * Gera um JWT de teste.
 */
function gerarToken(perfil) {
  return jwt.sign(
    { perfil },
    SEGREDO_TESTE,
    {
      subject: "10",
      expiresIn: "1h",
      issuer:
        "inventario-espacos-confinados-api",
      audience:
        "inventario-espacos-confinados-pwa",
      algorithm: "HS256",
    }
  );
}

/**
 * Inicia um Express temporário.
 *
 * Não importa o app.js e não conecta
 * ao banco de dados.
 */
async function iniciarServidor(t) {
  const app = express();

  app.use(express.json());
  app.use("/api/convites", conviteRoutes);

  const servidor = await new Promise(
    (resolve, reject) => {
      const instancia = app.listen(
        0,
        "127.0.0.1",
        () => resolve(instancia)
      );

      instancia.once("error", reject);
    }
  );

  t.after(async () => {
    await new Promise((resolve, reject) => {
      servidor.close((erro) => {
        if (erro) {
          reject(erro);
        } else {
          resolve();
        }
      });
    });
  });

  const porta = servidor.address().port;

  return `http://127.0.0.1:${porta}`;
}

// ========================================
// TESTES DA ROTA ADMINISTRATIVA
// ========================================

test(
  "POST /api/convites recusa usuário sem token",
  async (t) => {
    configurarJwt(t);

    const consulta = t.mock.method(
      usuarioRepository,
      "buscarIdentidadeAutenticada",
      async () => {
        throw new Error(
          "Consulta não deveria ocorrer"
        );
      }
    );

    const baseUrl = await iniciarServidor(t);

    const resposta = await fetch(
      `${baseUrl}/api/convites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "teste@exemplo.com",
          perfilAcesso: "ADMINISTRADOR",
        }),
      }
    );

    const dados = await resposta.json();

    assert.equal(resposta.status, 401);
    assert.equal(dados.status, "error");
    assert.equal(consulta.mock.callCount(), 0);
  }
);

test(
  "POST /api/convites recusa engenheiro de segurança",
  async (t) => {
    configurarJwt(t);

    t.mock.method(
      usuarioRepository,
      "buscarIdentidadeAutenticada",
      async () => ({
        id_usuario: 10,
        id_ambiente: ID_AMBIENTE,
        eh_fundador: false, perfil_acesso: "ENGENHEIRO_SEGURANCA",
      })
    );

    const emissao = t.mock.method(
      conviteService,
      "emitirConvite",
      async () => {
        throw new Error(
          "Emissão não deveria ocorrer"
        );
      }
    );

    const baseUrl = await iniciarServidor(t);

    const resposta = await fetch(
      `${baseUrl}/api/convites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${gerarToken("ENGENHEIRO_SEGURANCA")}`,
        },
        body: JSON.stringify({
          email: "teste@exemplo.com",
          perfilAcesso: "ADMINISTRADOR",
        }),
      }
    );

    const dados = await resposta.json();

    assert.equal(resposta.status, 403);
    assert.equal(dados.status, "error");
    assert.equal(emissao.mock.callCount(), 0);
  }
);

test(
  "POST /api/convites permite administrador autenticado",
  async (t) => {
    configurarJwt(t);

    t.mock.method(
      usuarioRepository,
      "buscarIdentidadeAutenticada",
      async () => ({
        id_usuario: 10,
        id_ambiente: ID_AMBIENTE,
        eh_fundador: true, perfil_acesso: "ADMINISTRADOR",
      })
    );

    const resultadoSimulado = {
      convite: {
        id_convite:
          "22222222-2222-4222-8222-222222222222",
        id_ambiente: ID_AMBIENTE,
      },
      token: "token-simulado",
    };

    const emissao = t.mock.method(
      conviteService,
      "emitirConvite",
      async () => resultadoSimulado
    );

    const baseUrl = await iniciarServidor(t);

    const corpo = {
      email: "engenheiro@exemplo.com",
      perfilAcesso: "ENGENHEIRO_SEGURANCA",
    };

    const resposta = await fetch(
      `${baseUrl}/api/convites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${gerarToken("ADMINISTRADOR")}`,
        },
        body: JSON.stringify(corpo),
      }
    );

    const dados = await resposta.json();

    assert.equal(resposta.status, 201);
    assert.equal(dados.status, "success");

    assert.deepEqual(
      dados.data,
      resultadoSimulado
    );

    assert.equal(emissao.mock.callCount(), 1);

    assert.deepEqual(
      emissao.mock.calls[0].arguments,
      [10, corpo]
    );
  }
);

// ========================================
// TESTE DA ROTA PÚBLICA
// ========================================

test(
  "POST /api/convites/aceitar permite acesso sem JWT",
  async (t) => {
    configurarJwt(t);

    const resultadoSimulado = {
      usuario: {
        id_usuario: 20,
        id_ambiente: ID_AMBIENTE,
      },
      convite: {
        id_convite:
          "22222222-2222-4222-8222-222222222222",
      },
    };

    const aceite = t.mock.method(
      conviteService,
      "aceitarConvite",
      async () => resultadoSimulado
    );

    const baseUrl = await iniciarServidor(t);

    const resposta = await fetch(
      `${baseUrl}/api/convites/aceitar`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: "token-simulado",
          nome: "Engenheiro Teste",
          senha: "SenhaSegura123",
        }),
      }
    );

    const dados = await resposta.json();

    assert.equal(resposta.status, 201);
    assert.equal(dados.status, "success");
    assert.equal(aceite.mock.callCount(), 1);
  }
);
