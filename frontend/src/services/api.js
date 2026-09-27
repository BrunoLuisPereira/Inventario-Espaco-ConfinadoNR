const API_URL =
  `http://${window.location.hostname}:3000/api`

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
 * retornado como Blob para JPG, PNG, PDF etc.
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
      'Erro ao carregar o arquivo da evidência'

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

export async function login(email, senha) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      senha,
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

export async function enviarEvidencia(
  idLocal,
  arquivo,
  descricao
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