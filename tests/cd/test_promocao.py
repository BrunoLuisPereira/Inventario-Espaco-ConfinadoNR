import copy
import os
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/cd'))
from contrato import Bloqueado,REPOSITORY
from promocao import confirmar_codigo,selecionar
S='a'*40;H='b'*40;D='c'*64

class PromotionTests(unittest.TestCase):
    def origin(self):
        return {'actions/workflows/cd-homologacao.yml':{'id':9,'path':'.github/workflows/cd-homologacao.yml'},
                'actions/runs/12':{'id':12,'workflow_id':9,'path':'.github/workflows/cd-homologacao.yml','head_sha':S,'head_branch':'main','event':'workflow_dispatch','head_repository':{'full_name':REPOSITORY},'status':'completed','conclusion':'success','run_attempt':1},
                'actions/runs/12/artifacts?per_page=100':{'total_count':1,'artifacts':[{'id':34,'expired':False,'name':'nr33-12-1','workflow_run':{'id':12,'head_sha':S}}]}}
    def test_original_artifact_selected(self):
        self.assertEqual(selecionar(self.origin().__getitem__,S,'12','34',D),{'artifact_id':'34','run_id':'12','sha256':D})
    def test_foreign_failed_or_expired_origin_rejected(self):
        changes=[('run','head_sha',H),('run','head_branch','feature'),('run','event','pull_request'),('run','conclusion','failure'),('run','workflow_id',8),('run','run_attempt',2),('artifact','expired',True),('artifact','name','unrelated')]
        for location,key,value in changes:
            data=self.origin();obj=data['actions/runs/12'] if location=='run' else data['actions/runs/12/artifacts?per_page=100']['artifacts'][0];obj[key]=value
            with self.subTest(change=(location,key,value)),self.assertRaises(Bloqueado):selecionar(data.__getitem__,S,'12','34',D)
    def test_unlisted_artifact_or_incomplete_listing_rejected(self):
        data=self.origin();data['actions/runs/12/artifacts?per_page=100']['total_count']=2
        with self.assertRaises(Bloqueado):selecionar(data.__getitem__,S,'12','34',D)
        with self.assertRaises(Bloqueado):selecionar(self.origin().__getitem__,S,'12','35',D)
    def trees(self):
        tree=[{'path':name,'mode':'040000','type':'tree','sha':'d'*40} for name in ('backend','frontend','shared')]
        return {'compare/'+S+'...'+H:{'status':'ahead','merge_base_commit':{'sha':S}},'git/commits/'+S:{'sha':S,'tree':{'sha':'e'*40}},'git/commits/'+H:{'sha':H,'tree':{'sha':'f'*40}},'git/trees/'+'e'*40:{'truncated':False,'tree':copy.deepcopy(tree)},'git/trees/'+'f'*40:{'truncated':False,'tree':copy.deepcopy(tree)}}
    def test_control_only_changes_preserve_approved_release(self):
        confirmar_codigo(self.trees().__getitem__,S,H)
    def test_application_changes_or_nonancestor_rejected(self):
        for defect in ('application','history','truncated','missing'):
            data=self.trees()
            if defect=='application':data['git/trees/'+'f'*40]['tree'][0]['sha']='9'*40
            if defect=='history':data['compare/'+S+'...'+H]['merge_base_commit']['sha']=H
            if defect=='truncated':data['git/trees/'+'f'*40]['truncated']=True
            if defect=='missing':data['git/trees/'+'f'*40]['tree'].pop()
            with self.subTest(defect=defect),self.assertRaises(Bloqueado):confirmar_codigo(data.__getitem__,S,H)
    def test_deploy_cannot_rebuild_and_checks_bytes_before_oidc(self):
        text=Path(__file__).resolve().parents[2].joinpath('.github/workflows/cd-homologacao.yml').read_text()
        self.assertIn('inputs.construir_candidato && !inputs.implantar',text)
        self.assertIn('needs: [validar_preparacao, selecionar_artefato]',text)
        self.assertIn('artifact-ids: ${{ needs.selecionar_artefato.outputs.artifact_id }}',text)
        deploy=text.split('\n  implantar:\n',1)[1]
        self.assertLess(deploy.index('promocao.py verificar'),deploy.index('Obter sessao temporaria por OIDC'))
        self.assertNotIn('npm run build',deploy)
        self.assertIn("vars.CD_ENABLED == 'true'",deploy)

if __name__=='__main__':unittest.main()
