"""Validação e teste automatizado da configuração do Docker Compose do InfraWatch.

Garante a presença dos 5 serviços essenciais, healthchecks, redes isoladas
e volumes persistentes exigidos pela Issue #1.
"""

import shutil
import subprocess
import unittest
from pathlib import Path

import yaml


class TestDockerComposeConfig(unittest.TestCase):
    """Suite de testes para a topologia de serviços no docker-compose.yml."""

    @classmethod
    def setUpClass(cls):
        # O arquivo docker-compose.yml fica na raiz do projeto (um nível acima de backend)
        cls.root_dir = Path(__file__).resolve().parent.parent.parent
        cls.compose_file = cls.root_dir / "docker-compose.yml"

        assert cls.compose_file.exists(), (
            f"Arquivo docker-compose.yml não encontrado em {cls.compose_file}"
        )

        with open(cls.compose_file, "r", encoding="utf-8") as f:
            cls.compose_data = yaml.safe_load(f)

    def test_compose_file_exists_and_is_valid_yaml(self):
        """Valida se o docker-compose.yml existe e é um YAML válido."""
        self.assertIsInstance(self.compose_data, dict)
        self.assertIn("services", self.compose_data)

    def test_required_services_present(self):
        """Valida se todos os 5 serviços arquiteturais estão definidos."""
        services = self.compose_data.get("services", {})
        expected_services = {
            "postgres",
            "redis",
            "infrawatch-api",
            "infrawatch-probe-worker",
            "infrawatch-integration-worker",
        }
        self.assertEqual(expected_services, expected_services.intersection(services.keys()))

    def test_postgres_configuration(self):
        """Valida imagem, portas, volume e healthcheck do PostgreSQL."""
        postgres = self.compose_data["services"]["postgres"]
        self.assertEqual(postgres.get("image"), "postgres:16-alpine")
        self.assertIn("5432:5432", postgres.get("ports", []))

        volumes = postgres.get("volumes", [])
        self.assertTrue(
            any("postgres_data:" in v for v in volumes), "Volume postgres_data não montado"
        )
        self.assertTrue(any("init-db.sql" in v for v in volumes), "Script init-db.sql não mapeado")

        healthcheck = postgres.get("healthcheck", {})
        self.assertIn("test", healthcheck)
        self.assertTrue(any("pg_isready" in arg for arg in healthcheck["test"]))

    def test_redis_configuration(self):
        """Valida imagem, portas, volume e healthcheck do Redis."""
        redis = self.compose_data["services"]["redis"]
        self.assertEqual(redis.get("image"), "redis:7-alpine")
        self.assertIn("6379:6379", redis.get("ports", []))

        volumes = redis.get("volumes", [])
        self.assertTrue(any("redis_data:" in v for v in volumes), "Volume redis_data não montado")

        healthcheck = redis.get("healthcheck", {})
        self.assertIn("test", healthcheck)
        self.assertTrue(any("redis-cli" in arg for arg in healthcheck["test"]))

    def test_api_service_build_and_dependencies(self):
        """Valida se a API usa Dockerfile.api, expõe porta 8000 e depende do Postgres e Redis saudáveis."""
        api = self.compose_data["services"]["infrawatch-api"]
        build_cfg = api.get("build", {})
        self.assertEqual(build_cfg.get("context"), "./backend")
        self.assertEqual(build_cfg.get("dockerfile"), "Dockerfile.api")
        self.assertIn("8000:8000", api.get("ports", []))

        depends_on = api.get("depends_on", {})
        self.assertEqual(depends_on.get("postgres", {}).get("condition"), "service_healthy")
        self.assertEqual(depends_on.get("redis", {}).get("condition"), "service_healthy")

    def test_api_dockerfile_healthcheck_endpoint(self):
        """Garante que o Dockerfile.api aponta o HEALTHCHECK para /api/health."""
        dockerfile_path = self.root_dir / "backend" / "Dockerfile.api"
        self.assertTrue(
            dockerfile_path.exists(), f"Dockerfile.api não encontrado em {dockerfile_path}"
        )
        content = dockerfile_path.read_text(encoding="utf-8")
        self.assertIn("HEALTHCHECK", content)
        self.assertIn("http://localhost:8000/api/health", content)
        self.assertNotIn("/api/v1/monitoring/health", content)

    def test_probe_worker_configuration(self):
        """Valida se o Probe Worker usa Dockerfile.worker e comando apropriado."""
        probe_worker = self.compose_data["services"]["infrawatch-probe-worker"]
        build_cfg = probe_worker.get("build", {})
        self.assertEqual(build_cfg.get("context"), "./backend")
        self.assertEqual(build_cfg.get("dockerfile"), "Dockerfile.worker")
        self.assertEqual(probe_worker.get("command"), ["python", "-m", "src.workers.probe_worker"])

    def test_integration_worker_configuration(self):
        """Valida se o Integration Worker usa Dockerfile.worker e comando apropriado."""
        worker = self.compose_data["services"]["infrawatch-integration-worker"]
        build_cfg = worker.get("build", {})
        self.assertEqual(build_cfg.get("context"), "./backend")
        self.assertEqual(build_cfg.get("dockerfile"), "Dockerfile.worker")
        self.assertEqual(worker.get("command"), ["python", "-m", "src.workers.integration_worker"])

    def test_volumes_and_networks_declaration(self):
        """Valida persistência em volumes e rede de comunicação interna."""
        volumes = self.compose_data.get("volumes", {})
        self.assertIn("postgres_data", volumes)
        self.assertIn("redis_data", volumes)

        networks = self.compose_data.get("networks", {})
        self.assertIn("infrawatch-net", networks)
        self.assertEqual(networks["infrawatch-net"].get("driver"), "bridge")

    def test_docker_compose_cli_validation(self):
        """Executa validação sintática direta via docker compose config se docker CLI estiver disponível."""
        if shutil.which("docker") is None:
            self.skipTest("Docker CLI não disponível no ambiente para docker compose config.")

        result = subprocess.run(
            ["docker", "compose", "-f", str(self.compose_file), "config"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(
            result.returncode, 0, f"Falha na validação do docker compose config: {result.stderr}"
        )


if __name__ == "__main__":
    unittest.main()
