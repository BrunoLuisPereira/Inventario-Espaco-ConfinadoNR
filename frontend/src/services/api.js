const API_URL = '/api'

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token')

  const ehFormData = options.body instanceof FormData

  const headers = {
    ...options.headers,
  }

  if (!ehFormData) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })

  const data = await response.json()

  if (!response.ok) {
    const error = new Error(
      data.message ||
        data.mensagem ||
        'Erro ao comunicar com o servidor'
    )

    error.status = response.status

    throw error
  }

  return data
}

/**
 * Realiza uma requisição autenticada para um arquivo.
 *
 * Diferente de request(), esta função não tenta
 * converter a resposta para JSON. O conteúdo é
 * retornado como Blob para JPG, PNG, PDF, XLSX etc.
 */
async function requestArquivo(endpoint) {
  const token = localStorage.getItem('token')

  const headers = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    let mensagem =
      'Erro ao carregar o arquivo'

    try {
      const data = await response.json()

      mensagem =
        data.message ||
        data.mensagem ||
        mensagem
    } catch {
      // A resposta pode não ser JSON.
    }

    const error = new Error(mensagem)
    error.status = response.status

    throw error
  }

  return response.blob()
}

// Autenticação

export async function login(email, senha) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      senha,
    }),
  })
}

 // Meu Perfil

/**
 * Consulta os dados do usuário autenticado.
 */
export async function buscarMeuPerfil() {
  return request('/auth/perfil')
}

/**
 * Atualiza o nome e o e-mail do usuário autenticado.
 * O perfil de acesso não pode ser modificado.
 */
export async function atualizarMeuPerfil(dados) {
  return request('/auth/perfil', {
    method: 'PUT',
    body: JSON.stringify({
      nome: dados.nome,
      email: dados.email,
    }),
  })
}

/**
 * Altera a senha do usuário autenticado.
 */
export async function alterarMinhaSenha(dados) {
  return request('/auth/senha', {
    method: 'PUT',
    body: JSON.stringify({
      senhaAtual: dados.senhaAtual,
      novaSenha: dados.novaSenha,
      confirmarSenha: dados.confirmarSenha,
    }),
  })
}

// Campanhas

export async function listarCampanhas() {
  return request('/campanhas')
}

export async function criarCampanha(dados) {
  return request('/campanhas', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function atualizarCampanha(
  idCampanha,
  dados
) {
  return request(`/campanhas/${idCampanha}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

export async function alterarStatusCampanha(
  idCampanha,
  status
) {
  return request(`/campanhas/${idCampanha}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
    }),
  })
}

// Locais

export async function listarLocais() {
  return request('/locais')
}

/**
 * Exporta os locais cadastrados para uma
 * planilha Excel (.xlsx).
 *
 * O arquivo é retornado como Blob para que
 * o navegador possa realizar o download.
 */
export async function exportarLocaisExcel() {
  return requestArquivo('/locais/exportar')
}

export async function buscarLocalPorId(idLocal) {
  return request(`/locais/${idLocal}`)
}

export async function criarLocal(dados) {
  return request('/locais', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function atualizarLocal(idLocal, dados) {
  return request(`/locais/${idLocal}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

export async function alterarStatusLocal(
  idLocal,
  status
) {
  return request(`/locais/${idLocal}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
    }),
  })
}

// Checklist NR-33

export async function listarChecklists() {
  return request('/checklists')
}

export async function criarChecklist(dados) {
  return request('/checklists', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function atualizarChecklist(
  idChecklist,
  dados
) {
  return request(`/checklists/${idChecklist}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

export async function alterarStatusChecklist(
  idChecklist,
  status
) {
  return request(
    `/checklists/${idChecklist}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
      }),
    }
  )
}

// Dados Técnicos

export async function buscarDadosTecnicosPorLocal(
  idLocal
) {
  return request(`/dados-tecnicos/local/${idLocal}`)
}

export async function criarDadosTecnicos(dados) {
  return request('/dados-tecnicos', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function atualizarDadosTecnicos(
  idDadosTecnicos,
  dados
) {
  return request(`/dados-tecnicos/${idDadosTecnicos}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

// Evidências

export async function listarEvidenciasPorLocal(
  idLocal
) {
  return request(`/evidencias/local/${idLocal}`)
}

/**
 * Envia fotografias ou documentos.
 *
 * As coordenadas são opcionais.
 *
 * Quando disponíveis, envia:
 * - Latitude;
 * - Longitude;
 * - Origem das coordenadas;
 * - Precisão do GPS;
 * - Data da obtenção da localização.
 *
 * Fotografias sem GPS e documentos PDF
 * continuam sendo aceitos.
 */
export async function enviarEvidencia(
  idLocal,
  arquivo,
  descricao,
  coordenadas = {}
) {
  const formData = new FormData()

  formData.append('id_local', idLocal)
  formData.append('arquivo', arquivo)

  if (descricao?.trim()) {
    formData.append(
      'descricao',
      descricao.trim()
    )
  }

  const temLatitude =
    coordenadas.latitude !== null &&
    coordenadas.latitude !== undefined &&
    coordenadas.latitude !== ''

  const temLongitude =
    coordenadas.longitude !== null &&
    coordenadas.longitude !== undefined &&
    coordenadas.longitude !== ''

  /*
   * Envia a localização somente quando
   * as duas coordenadas estão disponíveis.
   *
   * O valor zero também é válido.
   */
  if (temLatitude && temLongitude) {
    formData.append(
      'latitude',
      coordenadas.latitude
    )

    formData.append(
      'longitude',
      coordenadas.longitude
    )

    if (coordenadas.origem_coordenadas) {
      formData.append(
        'origem_coordenadas',
        coordenadas.origem_coordenadas
      )
    }

    /*
     * Precisão e data de captura são
     * enviadas somente quando a origem
     * das coordenadas é GPS.
     */
    if (
      coordenadas.origem_coordenadas === 'GPS'
    ) {
      if (
        coordenadas.precisao_gps !== null &&
        coordenadas.precisao_gps !== undefined &&
        coordenadas.precisao_gps !== ''
      ) {
        formData.append(
          'precisao_gps',
          coordenadas.precisao_gps
        )
      }

      if (coordenadas.data_captura_gps) {
        formData.append(
          'data_captura_gps',
          coordenadas.data_captura_gps
        )
      }
    }
  }

  return request('/evidencias/upload', {
    method: 'POST',
    body: formData,
  })
}

/**
 * Busca o arquivo físico de uma evidência.
 *
 * A requisição envia o JWT e recebe o arquivo
 * como Blob.
 */
export async function buscarArquivoEvidencia(
  idEvidencia
) {
  return requestArquivo(
    `/evidencias/${idEvidencia}/arquivo`
  )
}

export async function atualizarEvidencia(
  idEvidencia,
  dados
) {
  return request(`/evidencias/${idEvidencia}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

export async function excluirEvidencia(
  idEvidencia
) {
  return request(`/evidencias/${idEvidencia}`, {
    method: 'DELETE',
  })
}

// Relatórios

export async function buscarRelatorioPorLocal(
  idLocal
) {
  return request(`/relatorios/local/${idLocal}`)
}

export async function criarRelatorio(dados) {
  return request('/relatorios', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function atualizarRelatorio(
  idRelatorio,
  dados
) {
  return request(`/relatorios/${idRelatorio}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

export async function gerarPdfRelatorio(
  idRelatorio
) {
  return request(
    `/relatorios/${idRelatorio}/gerar-pdf`,
    {
      method: 'POST',
    }
  )
}

export async function buscarPdfRelatorio(
  idRelatorio
) {
  return requestArquivo(
    `/relatorios/${idRelatorio}/pdf`
  )
}