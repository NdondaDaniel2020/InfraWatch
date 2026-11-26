"""Testes unitários para validação das esteiras de CI/CD do GitHub Actions (Issue #36)."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

EXPECTED_WORKFLOWS = [
    "build-deploy.yml",
    "coverage.yml",
    "docker-build.yml",
    "format.yml",
    "lint.yml",
    "migrations.yml",
    "smoke.yml",
    "tests.yml",
    "type-check.yml",
]


def test_all_expected_workflows_exist():
    """Valida a presença de todos os 9 workflows do GitHub Actions no repositório."""
    workflows_dir = Path(__file__).parents[4] / ".github" / "workflows"
    assert workflows_dir.is_dir(), f"Diretório não encontrado: {workflows_dir}"

    existing_files = {f.name for f in workflows_dir.glob("*.yml")}
    for expected in EXPECTED_WORKFLOWS:
        assert expected in existing_files, f"Workflow ausente: {expected}"


@pytest.mark.parametrize("filename", EXPECTED_WORKFLOWS)
def test_workflow_yaml_syntax_and_concurrency(filename: str):
    """Valida se o workflow é um YAML válido e possui configuração de concorrência."""
    workflow_path = Path(__file__).parents[4] / ".github" / "workflows" / filename
    assert workflow_path.exists()

    content = workflow_path.read_text(encoding="utf-8")
    data = yaml.safe_load(content)

    assert isinstance(data, dict), f"O workflow {filename} deve ser um dicionário YAML"
    assert "name" in data, f"Workflow {filename} deve conter campo 'name'"
    assert "on" in data or True in data, f"Workflow {filename} deve conter campo 'on'"
    assert "jobs" in data, f"Workflow {filename} deve conter campo 'jobs'"
    assert len(data["jobs"]) >= 1, f"Workflow {filename} deve conter pelo menos 1 job"

    # Workflows automáticos de PR/Push devem ter cancel-in-progress
    if filename != "build-deploy.yml":
        assert "concurrency" in data, f"Workflow {filename} deve ter chave 'concurrency'"
        assert data["concurrency"].get("cancel-in-progress") is True


def test_deploy_readiness_checklist_exists():
    """Valida a existência do documento de checklist para deploy readiness."""
    doc_path = Path(__file__).parents[4] / "docs" / "deploy-readiness.md"
    assert doc_path.exists()
    content = doc_path.read_text(encoding="utf-8")

    assert "PostgreSQL 16" in content
    assert "TimescaleDB" in content
    assert "audit_database_hardening.sql" in content
    assert "FORCE ROW LEVEL SECURITY" in content
