const zlib = require('node:zlib');
function chunk(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo), dados]); let crc = 0xffffffff;
  for (const byte of corpo) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  const tamanho = Buffer.alloc(4), checksum = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([tamanho, corpo, checksum]);
}
// Ilustração raster sintética de um reservatório: não representa evidência real.
function imagem(largura, altura) {
  const pixels = Buffer.alloc((largura * 3 + 1) * altura);
  for (let y = 0; y < altura; y++) for (let x = 0; x < largura; x++) {
    const tanque = x > largura * .18 && x < largura * .82 && y > altura * .2 && y < altura * .84;
    const borda = tanque && (x % Math.max(10, Math.floor(largura / 18)) < 3);
    const cor = tanque ? borda ? [8, 49, 78] : [28, 104, 152] : y > altura * .82 ? [181, 188, 192] : [219, 233, 241];
    const pos = y * (largura * 3 + 1) + 1 + x * 3;
    for (let c = 0; c < 3; c++) pixels[pos + c] = cor[c];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(largura, 0); ihdr.writeUInt32BE(altura, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
function dados() {
  return {
    id_relatorio: 15, status_relatorio: 'RASCUNHO', data_emissao: null,
    responsavel: 'Pessoa de homologação — DADOS SINTÉTICOS', email_responsavel: 'teste@example.invalid', perfil_responsavel: 'ADMINISTRADOR',
    nome_responsavel_tecnico: 'Responsável fictício para revisão', crea: 'REGISTRO SINTÉTICO', numero_art: 'ART SINTÉTICA', data_art: '2026-10-24T12:00:00Z',
    nome_campanha: 'Campanha de homologação visual', empresa: 'Empresa fictícia', responsavel_campanha: 'Equipe de teste', data_inicio: '2026-10-24T12:00:00Z', status_campanha: 'EM ANDAMENTO',
    id_local: 40, nome_local: 'Reservatório sintético CT-01', setor: 'Área de teste', descricao_local: 'Exemplo exclusivamente visual; sem validade operacional.', endereco: 'Endereço fictício para homologação', latitude: 0, longitude: 0, status_local: 'ATIVO',
    id_checklist: 1, criterio_a: 'NAO', criterio_b: 'SIM', criterio_c: 'NAO', acesso_controlado: 'NAO', ventilacao_adequada: 'NAO', monitoramento_atmosferico: 'SIM', procedimento_emergencia: 'NAO',
    observacoes_checklist: 'Observação sintética: acesso, ventilação e emergência registrados apenas para testar a apresentação.', status_checklist: 'CONCLUIDO',
    id_dados: 2, pressao_atmosferica: 7, ventilacao: 'NATURAL', oxigenio: 20, gas_inflamavel: 33, monoxido_carbono: 25, sulfeto_hidrogenio: 65, temperatura: 35, umidade: 22,
    observacoes_dados_tecnicos: 'Medições fictícias. Não usar para avaliação de segurança.', status_dados_tecnicos: 'CONCLUIDO',
    evidencias: [{ id_evidencia: 1, tipo: 'FOTO', descricao: 'Ilustração sintética horizontal para homologação do layout.\nNão é uma fotografia de inventário real.', latitude: 0, longitude: 0, origem_coordenadas: 'GPS', precisao_gps: 0, data_captura_gps: '2026-10-24T12:00:00Z', data_criacao: '2026-10-24T12:00:00Z' }],
  };
}
module.exports = { imagem, dados };
