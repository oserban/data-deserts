"""The optional crop stage must not disguise invalid data as missing prerequisites."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class FetchPipelineTests(unittest.TestCase):
    def run_pipeline(self, crop_status, extra=()):
        with tempfile.TemporaryDirectory() as directory:
            processing = Path(directory) / 'processing'
            processing.mkdir()
            shutil.copyfile(Path(__file__).with_name('fetch_all.sh'), processing / 'fetch_all.sh')
            (processing / 'fetch_crop_allocation.py').write_text(
                f'print("CROP_ATTEMPTED")\nraise SystemExit({crop_status})\n')
            (processing / 'build_data.py').write_text('print("BUILD_COMPLETED")\n')
            args = ['bash', str(processing / 'fetch_all.sh'), '--crop-allocation', '--build']
            for source in ('biotime', 'living_planet', 'predicts', 'dhs', 'mics', 'gbif', 'lsms', 'lsms_isa', 'grdc'):
                args.extend(['--skip', source])
            return subprocess.run([*args, *extra], env={**os.environ, 'PYTHON_BIN': sys.executable},
                                  capture_output=True, text=True, check=False)

    def test_missing_evidence_defers_only_agriculture_and_still_builds(self):
        result = self.run_pipeline(3)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('BUILD_COMPLETED', result.stdout)
        self.assertIn('Pipeline complete with crop_allocation blocked', result.stdout)
        self.assertNotIn('\nPipeline complete.\n', result.stdout)

    def test_invalid_agriculture_data_stops_before_build(self):
        result = self.run_pipeline(1)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn('BUILD_COMPLETED', result.stdout)
        self.assertNotIn('Pipeline complete', result.stdout)

    def test_success_and_explicit_skip_allow_build(self):
        for extra in ((), ('--skip', 'crop_allocation')):
            with self.subTest(extra=extra):
                result = self.run_pipeline(0, extra)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('BUILD_COMPLETED', result.stdout)
                self.assertNotIn('blocked', result.stdout)
                self.assertEqual('CROP_ATTEMPTED' in result.stdout, not extra)


if __name__ == '__main__':
    unittest.main()
