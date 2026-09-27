const API_URL = 'http://localhost:3000/api'

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token')

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
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
    throw new Error(
      data.message ||
        data.mensagem ||
        'Erro ao comunicar com o servidor'
    )
  }

  return data
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