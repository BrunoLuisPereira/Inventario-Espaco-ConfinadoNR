"""Auditoria geométrica de PDFs sintéticos, sem acesso a aplicação/banco."""
import json
import sys
from pathlib import Path

raiz = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(raiz / 'artifacts/pdf-validation-deps'))
import pymupdf as fitz

pasta = raiz / 'artifacts/passo4-pdf-i18n'
resultados = []
for arquivo in sorted(pasta.glob('*.pdf')):
    doc = fitz.open(arquivo)
    en = arquivo.stem.endswith('-en')
    for i, pagina in enumerate(doc):
        texto = pagina.get_text()
        spans = [s for b in pagina.get_text('dict')['blocks'] if 'lines' in b
                 for linha in b['lines'] for s in linha['spans']]
        rodape = f'Page {i + 1} of {len(doc)}' if en else f'Página {i + 1} de {len(doc)}'
        assert rodape in texto, (arquivo.name, i, 'rodapé')
        assert len(spans) > 10, (arquivo.name, i, 'página vazia')
        for s in spans:
            x0, y0, x1, y1 = s['bbox']
            assert x0 >= 26 and x1 <= 570, (arquivo.name, i, s['text'], 'margens')
            if 110 <= y0 < 790:
                assert y1 < 792, (arquivo.name, i, s['text'], 'rodapé')
        for img in pagina.get_images(full=True):
            for rect in pagina.get_image_rects(img[0]):
                for s in spans:
                    inter = rect & fitz.Rect(s['bbox'])
                    assert inter.is_empty or inter.get_area() < 2, (arquivo.name, i, 'texto sobre foto')
        if arquivo.stem.startswith('completo'):
            pagina.get_pixmap(matrix=fitz.Matrix(1, 1)).save(pasta / f'{arquivo.stem}-pagina-{i + 1}.png')
    texto = ''.join(p.get_text() for p in doc)
    assert 'Reservatório sintético CT-01' in texto
    if not arquivo.stem.startswith('incompleto'):
        assert ('20.123456 %' if en else '20,123456 %') in texto
        assert ('-0.000123 °C' if en else '-0,000123 °C') in texto
        assert ('999,999,999,999.123456' if en else '999.999.999.999,123456') in texto
    resultados.append({'arquivo': arquivo.name, 'paginas': len(doc), 'layout': 'OK'})
assert len(resultados) == 6
(pasta / 'validacao.json').write_text(json.dumps(resultados, indent=2), encoding='utf-8')
print(json.dumps(resultados))
