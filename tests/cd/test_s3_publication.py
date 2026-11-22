"""Conditional first publication with a role that cannot list the bucket."""
import base64
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_cd import FakeAWS, archive, env_config, SHA, DOC
from contrato import Bloqueado
from github_aws import AWS, Ausente, ObjetoExistente, configurar, implantar


class RestrictedPublication(FakeAWS):
    def __init__(self, digest, size, mode='new'):
        super().__init__(digest)
        self.size, self.mode = size, mode

    def call(self, *args):
        action = args[1]
        if action == 'put-object' and self.mode in ('existing', 'wrong-hash', 'wrong-size'):
            self.calls.append(args)
            self.assert_write(args)
            raise ObjetoExistente('HTTP 412 PreconditionFailed')
        if action == 'put-object' and self.mode in ('denied', 'conflict'):
            self.calls.append(args)
            raise Bloqueado('HTTP 403 AccessDenied' if self.mode == 'denied' else 'HTTP 409 ConditionalRequestConflict')
        if action == 'head-object':
            self.calls.append(args)
            if self.mode == 'new':
                raise Bloqueado('HTTP 403: absent object without ListBucket')
            return {'VersionId': 'EXISTING-version',
                    'ChecksumSHA256': base64.b64encode(bytes.fromhex('0'*64 if self.mode == 'wrong-hash' else self.h)).decode(),
                    'ContentLength': self.size + (1 if self.mode == 'wrong-size' else 0),
                    'ServerSideEncryption': 'AES256'}
        return super().call(*args)


class S3PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name) / 'release.tar.gz'
        self.digest = archive(self.package)

    def publish(self, mode):
        aws = RestrictedPublication(self.digest, self.package.stat().st_size, mode)
        return aws

    def deploy(self, aws):
        return implantar(aws, configurar(env_config()), self.package, SHA, self.digest, DOC, sleep=lambda _: None)

    def test_first_publication_succeeds_without_head_or_list_permission(self):
        aws = self.publish('new')
        result = self.deploy(aws)
        self.assertEqual(result['version'], 'SYNTHETIC-version')
        self.assertFalse(any(c[1] in ('head-object', 'list-objects-v2', 'list-object-versions') for c in aws.calls))
        writes = [c for c in aws.calls if c[1] == 'put-object']
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0][writes[0].index('--if-none-match')+1], '*')

    def test_existing_object_is_verified_and_exact_version_is_pinned(self):
        aws = self.publish('existing')
        result = self.deploy(aws)
        self.assertEqual(result['version'], 'EXISTING-version')
        operations = [c[1] for c in aws.calls]
        self.assertLess(operations.index('put-object'), operations.index('head-object'))
        self.assertEqual(operations.count('put-object'), 1)

    def test_mismatching_existing_object_blocks_ssm_without_overwrite(self):
        for mode in ('wrong-hash', 'wrong-size'):
            aws = self.publish(mode)
            with self.subTest(mode=mode), self.assertRaises(Bloqueado): self.deploy(aws)
            self.assertFalse(any(c[1] == 'send-command' for c in aws.calls))
            self.assertEqual(sum(c[1] == 'put-object' for c in aws.calls), 1)

    def test_access_denied_and_transient_conflict_do_not_trigger_fallback_or_retry(self):
        for mode in ('denied', 'conflict'):
            aws = self.publish(mode)
            with self.subTest(mode=mode), self.assertRaises(Bloqueado): self.deploy(aws)
            self.assertFalse(any(c[1] in ('head-object', 'send-command') for c in aws.calls))
            self.assertEqual(sum(c[1] == 'put-object' for c in aws.calls), 1)

    def test_unverified_put_response_blocks_ssm(self):
        aws = self.publish('new')
        original = aws.call
        def call(*args):
            out = original(*args)
            if args[1] == 'put-object': out.pop('ChecksumSHA256')
            return out
        aws.call = call
        with self.assertRaises(Bloqueado): self.deploy(aws)
        self.assertFalse(any(c[1] == 'send-command' for c in aws.calls))

    def test_cli_classifies_only_real_conditional_failure_as_existing(self):
        for message, expected in [('(PreconditionFailed)', ObjetoExistente), ('(412)', ObjetoExistente), ('(403)', Bloqueado), ('(409)', Bloqueado)]:
            response = subprocess.CompletedProcess([], 1, '', message+' SYNTHETIC_PRIVATE_DETAIL')
            with self.subTest(message=message), patch('github_aws.subprocess.run', return_value=response):
                with self.assertRaises(expected) as error: AWS().call('s3api', 'put-object')
                if expected is Bloqueado: self.assertNotIsInstance(error.exception, ObjetoExistente)
                self.assertNotIn('SYNTHETIC_PRIVATE_DETAIL', str(error.exception))

    def test_head_403_is_never_reported_as_missing(self):
        response = subprocess.CompletedProcess([], 1, '', '(403) AccessDenied')
        with patch('github_aws.subprocess.run', return_value=response):
            with self.assertRaises(Bloqueado) as error: AWS().call('s3api', 'head-object')
            self.assertNotIsInstance(error.exception, Ausente)
            self.assertIn('s3api head-object', str(error.exception))


if __name__ == '__main__': unittest.main()
