// Simulação explícita de interface. Não é autenticação ou persistência PostgreSQL.
import { pode } from './permissoes.js'
export const senhaDemo = 'Demonstracao123!'
export const contasDemo = ['admin.a@demo.invalid', 'admin.b@demo.invalid', 'engenheiro.a@demo.invalid']
const chave = 'nr33-demo:dados-v1'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const inicial = () => ({
  usuarios: [
    { id_usuario: '10', id_ambiente: A, nome: 'Administrador Demo A', email: contasDemo[0], perfil_acesso: 'ADMINISTRADOR', ativo: true },
    { id_usuario: '20', id_ambiente: B, nome: 'Administrador Demo B', email: contasDemo[1], perfil_acesso: 'ADMINISTRADOR', ativo: true },
    { id_usuario: '11', id_ambiente: A, nome: 'Engenheiro Demo A', email: contasDemo[2], perfil_acesso: 'ENGENHEIRO_SEGURANCA', ativo: true },
  ],
  campanhas: [
    { id_campanha: '1', id_ambiente: A, id_usuario: '11', nome_campanha: 'Inspeção sintética A', empresa: 'Empresa fictícia A', responsavel: 'Equipe Demo A', data_inicio: '2026-10-18', status: 'EM ANDAMENTO' },
    { id_campanha: '2', id_ambiente: B, id_usuario: '20', nome_campanha: 'Inspeção sintética B', empresa: 'Empresa fictícia B', responsavel: 'Equipe Demo B', data_inicio: '2026-10-18', status: 'EM ANDAMENTO' },
  ],
  locais: [
    { id_local: '1', id_campanha: '1', nome_local: 'Tanque demonstrativo A', setor: 'Simulação', descricao: 'Sem vínculo com instalações reais.', endereco: null, latitude: 0, longitude: 0, status: 'ATIVO' },
    { id_local: '2', id_campanha: '2', nome_local: 'Tanque demonstrativo B', setor: 'Simulação', descricao: 'Sem vínculo com instalações reais.', endereco: null, latitude: null, longitude: null, status: 'ATIVO' },
  ], sessoes: {}, sequenciaCampanha: 3, sequenciaLocal: 3,
})
const erro = (status, message) => Object.assign(new Error(message), { status })
const id = valor => typeof valor === 'string' && /^[1-9][0-9]*$/.test(valor) && valor.trim() === valor && Number.isSafeInteger(Number(valor)) && Number(valor) > 0

export function criarDemo(storage) {
  let estado
  try { estado = JSON.parse(storage.getItem(chave)) } catch { /* Reinicializa apenas dados de demonstração. */ }
  if (!estado || !Array.isArray(estado.usuarios) || !Array.isArray(estado.campanhas) || !Array.isArray(estado.locais) || !estado.sessoes) estado = inicial()
  // Mapeamento explícito apenas das duas contas sintéticas da demonstração.
  // Não classifica usuários reais nem consulta o backend.
  for (const u of estado.usuarios) u.eh_fundador = (u.id_usuario === '10' && u.id_ambiente === A) || (u.id_usuario === '20' && u.id_ambiente === B)
  const salvar = () => storage.setItem(chave, JSON.stringify(estado))
  const sucesso = data => ({ status: 'success', data: structuredClone(data), ...(Array.isArray(data) ? { total: data.length } : {}) })
  function campanhaPermitida(c, u) {
    return c && c.id_ambiente === u.id_ambiente && pode(u, 'campanhas.consultar')
  }
  function campanha(idCampanha, u) {
    if (!id(String(idCampanha))) throw erro(400, 'ID da campanha inválido.')
    const c = estado.campanhas.find(c => c.id_campanha === String(idCampanha))
    if (!campanhaPermitida(c, u)) throw erro(404, 'Campanha não encontrada.')
    return c
  }
  function local(idLocal, u) {
    if (!id(String(idLocal))) throw erro(400, 'ID do local inválido.')
    const l = estado.locais.find(l => l.id_local === String(idLocal))
    if (!l || !campanhaPermitida(estado.campanhas.find(c => c.id_campanha === l.id_campanha), u)) throw erro(404, 'Local não encontrado.')
    return l
  }
  const localPublico = l => ({ ...l, nome_campanha: estado.campanhas.find(c => c.id_campanha === l.id_campanha)?.nome_campanha })
  async function request(endpoint, options = {}, token) {
    endpoint = new URL(endpoint, 'http://demo.invalid').pathname
    const method = options.method || 'GET'
    let dados = {}
    if (options.body) { try { dados = JSON.parse(options.body) } catch { throw erro(400, 'Dados inválidos.') } }
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw erro(400, 'Dados inválidos.')
    if (endpoint === '/auth/login' && method === 'POST') {
      const u = estado.usuarios.find(u => u.email === dados.email?.trim().toLowerCase())
      if (!u || !u.ativo || dados.senha !== senhaDemo) throw erro(401, 'E-mail ou senha inválidos na demonstração.')
      const novoToken = `demo-${crypto.randomUUID()}`
      estado.sessoes[novoToken] = u.id_usuario; salvar()
      return sucesso({ token: novoToken, usuario: u })
    }
    const u = estado.usuarios.find(u => u.id_usuario === estado.sessoes[token] && u.ativo)
    if (!u) throw erro(401, 'Sessão de demonstração expirada. Entre novamente.')
    if (endpoint === '/auth/perfil' && method === 'GET') return sucesso(u)
    if (endpoint === '/campanhas' && method === 'GET') return sucesso(estado.campanhas.filter(c => campanhaPermitida(c, u)))
    if (/^\/campanhas\/[^/]+$/.test(endpoint) && method === 'GET') return sucesso(campanha(endpoint.split('/')[2], u))
    if (endpoint === '/campanhas' && method === 'POST') {
      if (['nome_campanha', 'empresa', 'responsavel'].some(k => typeof dados[k] !== 'string' || !dados[k].trim() || dados[k].trim().length > 150) || !/^\d{4}-\d{2}-\d{2}$/.test(dados.data_inicio || '')) throw erro(400, 'Preencha os campos obrigatórios da campanha.')
      const c = { id_campanha: String(estado.sequenciaCampanha++), id_ambiente: u.id_ambiente, id_usuario: u.id_usuario,
        nome_campanha: dados.nome_campanha.trim(), empresa: dados.empresa.trim(), responsavel: dados.responsavel.trim(), data_inicio: dados.data_inicio, status: 'EM ANDAMENTO' }
      estado.campanhas.unshift(c); salvar(); return sucesso(c)
    }
    if (endpoint === '/locais' && method === 'GET') return sucesso(estado.locais.filter(l => campanhaPermitida(estado.campanhas.find(c => c.id_campanha === l.id_campanha), u)).map(localPublico))
    if (/^\/locais\/[^/]+$/.test(endpoint) && method === 'GET') return sucesso(localPublico(local(endpoint.split('/')[2], u)))
    if (endpoint === '/locais' && method === 'POST') {
      const c = campanha(dados.id_campanha, u)
      if (typeof dados.nome_local !== 'string' || !dados.nome_local.trim() || dados.nome_local.trim().length > 150) throw erro(400, 'Informe o nome do local, com até 150 caracteres.')
      const lat = dados.latitude ?? null, lon = dados.longitude ?? null
      if ((lat === null) !== (lon === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180))) throw erro(400, 'Informe latitude e longitude válidas em conjunto.')
      const l = { id_local: String(estado.sequenciaLocal++), id_campanha: c.id_campanha, nome_local: dados.nome_local.trim(),
        setor: dados.setor ?? null, descricao: dados.descricao ?? null, endereco: dados.endereco ?? null, latitude: lat, longitude: lon, status: 'ATIVO' }
      estado.locais.unshift(l); salvar(); return sucesso(localPublico(l))
    }
    const rotaCampanha = endpoint.match(/^\/campanhas\/([^/]+)(\/status)?$/)
    const rotaLocal = endpoint.match(/^\/locais\/([^/]+)(\/status)?$/)
    if ((rotaCampanha || rotaLocal) && ['PUT', 'PATCH'].includes(method)) {
      const r = rotaCampanha || rotaLocal
      const registro = rotaCampanha ? campanha(r[1], u) : local(r[1], u)
      if (method === 'PATCH' && r[2]) {
        const permitidos = rotaCampanha ? ['EM ANDAMENTO', 'CONCLUIDO', 'CANCELADA'] : ['ATIVO', 'INATIVO']
        if (!permitidos.includes(dados.status)) throw erro(400, 'Status inválido.')
        registro.status = dados.status
      } else {
        // Edição não é simulada parcialmente: evita validações fictícias de sucesso.
        throw erro(501, 'Edição de dados não incluída nesta demonstração. Use o cadastro e a alteração de status.')
      }
      salvar(); return sucesso(rotaCampanha ? registro : localPublico(registro))
    }
    if (endpoint === '/checklists' && method === 'GET') return sucesso([])
    const inventario = endpoint.match(/^\/(evidencias|dados-tecnicos|relatorios)\/local\/([^/]+)$/)
    if (inventario && method === 'GET') {
      local(inventario[2], u)
      if (inventario[1] === 'evidencias') return sucesso([])
      throw erro(404, 'Nenhum registro sintético cadastrado para este local.')
    }
    throw erro(501, 'Operação não incluída na demonstração. A integração real permanece disponível fora do modo demo.')
  }
  return { request, reiniciar() { estado = inicial(); salvar() } }
}
