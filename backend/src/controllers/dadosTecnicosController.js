const dadosTecnicosService = require(
  "../services/dadosTecnicosService"
);


/**
 * Cria os dados técnicos de um local.
 */
async function criar(req, res, next) {
  try {
    const dadosTecnicos =
      await dadosTecnicosService.criarDadosTecnicos(
        req.body,
        req.usuario
      );

    return res.status(201).json({
      status: "success",
      message:
        "Dados técnicos cadastrados com sucesso.",
      data: dadosTecnicos,
    });
  } catch (erro) {
    next(erro);
  }
}


/**
 * Lista todos os registros de dados técnicos.
 */
async function listar(req, res, next) {
  try {
    const dados =
      await dadosTecnicosService.listarDadosTecnicos();

    return res.status(200).json({
      status: "success",
      total: dados.length,
      data: dados,
    });
  } catch (erro) {
    next(erro);
  }
}


/**
 * Busca dados técnicos pelo ID.
 */
async function buscarPorId(req, res, next) {
  try {
    const dados =
      await dadosTecnicosService.buscarDadosTecnicosPorId(
        req.params.id
      );

    return res.status(200).json({
      status: "success",
      data: dados,
    });
  } catch (erro) {
    next(erro);
  }
}


/**
 * Busca os dados técnicos de determinado local.
 */
async function buscarPorLocal(req, res, next) {
  try {
    const dados =
      await dadosTecnicosService.buscarDadosTecnicosPorLocal(
        req.params.idLocal
      );

    return res.status(200).json({
      status: "success",
      data: dados,
    });
  } catch (erro) {
    next(erro);
  }
}


/**
 * Atualiza os dados técnicos.
 */
async function atualizar(req, res, next) {
  try {
    const dados =
      await dadosTecnicosService.atualizarDadosTecnicos(
        req.params.id,
        req.body,
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      message:
        "Dados técnicos atualizados com sucesso.",
      data: dados,
    });
  } catch (erro) {
    next(erro);
  }
}


/**
 * Exclui os dados técnicos.
 */
async function excluir(req, res, next) {
  try {
    const dados =
      await dadosTecnicosService.excluirDadosTecnicos(
        req.params.id,
        req.usuario
      );

    return res.status(200).json({
      status: "success",
      message:
        "Dados técnicos excluídos com sucesso.",
      data: dados,
    });
  } catch (erro) {
    next(erro);
  }
}


module.exports = {
  criar,
  listar,
  buscarPorId,
  buscarPorLocal,
  atualizar,
  excluir,
};