---
name: git-issue-atomic-workflow
description: Fluxo de trabalho Git orientado a issues. Cria uma nova branch para a issue, executa commits atômicos por tarefa em português seguindo Conventional Commits, gera um commit final de agrupamento (--allow-empty) e realiza o push remoto.
---

# Fluxo de Trabalho Git Orientado a Issues (Git Issue Atomic Workflow)

Este fluxo padroniza o ciclo de desenvolvimento das tarefas e issues do projeto. Garante rastreabilidade, isolamento de código em branches, commits granulares por critério de aceite e um commit final que consolida o trabalho antes do envio ao repositório remoto.

---

## 🔄 Ciclo de Vida da Tarefa

```text
[Main Atualizada] ──► [Criar Branch da Issue] ──► [Tarefa 1 -> Commit Atômico]
                                                         │
                                                         ▼
[Push Remoto] ◄── [Commit de Agrupamento Final] ◄── [Tarefa N -> Commit Atômico]
```

---

## 📋 Passo a Passo de Execução

### 1. Preparação e Criação da Branch
Antes de iniciar qualquer código, garanta que a `main` está atualizada e crie a branch específica da issue:

- **Padrão de Nome da Branch:**
  - `feat/issue-<id>-<descricao-curta>`
  - `fix/issue-<id>-<descricao-curta>`
  - `refactor/issue-<id>-<descricao-curta>`
  - `chore/issue-<id>-<descricao-curta>`

```bash
# 1. Voltar para main e sincronizar
git checkout main
git pull origin main

# 2. Criar e entrar na branch da issue (exemplo: Issue #1)
git checkout -b feat/issue-1-docker-compose-setup
```

---

### 2. Execução das Tarefas & Commits Atômicos
Trabalhe em cada sub-tarefa ou critério de aceite da issue individualmente. Para cada tarefa concluída, faça um commit atômico contendo exclusivamente os arquivos alterados.

- **Regras de Mensagem:**
  1. **Idioma:** Sempre em **Português**.
  2. **Estrutura:** `<tipo>(<escopo>): <descrição em minúsculas>`
  3. **Sem ponto final** no final da primeira linha.
  4. **Tipos permitidos:**
     - `feat`: Nova funcionalidade implementada.
     - `fix`: Correção de bug ou erro.
     - `docs`: Alteração em documentação técnica ou README.
     - `style`: Formatação ou estilo de código sem impacto lógico.
     - `refactor`: Refatoração interna sem alteração de comportamento externo.
     - `test`: Criação ou ajuste de testes automatizados.
     - `chore`: Configurações de ambiente, dependências ou builds.
     - `perf`: Otimizações de desempenho ou latência.
     - `ci`: Alterações em pipelines ou workflows do GitHub Actions.

```bash
# Tarefa 1.1: Configurar compose básico
git add docker-compose.yml
git commit -m "feat(docker): configurar servicos base postgres e redis no compose"

# Tarefa 1.2: Adicionar healthcheck e scripts
git add scripts/wait-for-services.sh
git commit -m "chore(docker): adicionar script de healthcheck para postgres e redis"

# Tarefa 1.3: Documentar variáveis de ambiente
git add docs/setup-local.md
git commit -m "docs(docker): adicionar instrucoes de subida dos containers"
```

---

### 3. Commit de Agrupamento / Sumário Final (Grouping Commit)
Após todas as tarefas da issue serem concluídas, testadas e validadas:
Crie um commit vazio (`--allow-empty`) que sumariza todas as entregas realizadas na issue e formaliza o fechamento.

```bash
git commit --allow-empty -m "<tipo>(<escopo>): consolidar tarefas da issue #<id>" \
  -m "- <Resumo da tarefa 1 implementada>" \
  -m "- <Resumo da tarefa 2 implementada>" \
  -m "- <Resumo da tarefa 3 implementada>" \
  -m "Closes #<id>"
```

**Exemplo Prático:**
```bash
git commit --allow-empty -m "feat(infra): concluir orquestracao multi-servico da issue #1" \
  -m "- configurar containers postgres 16 e redis 7 no docker-compose" \
  -m "- implementar healthcheck automatico e redes isoladas" \
  -m "- mapear volumes persistentes para dados locais" \
  -m "Closes #1"
```

---

### 4. Push para o Repositório Remoto
Envie a branch com todos os commits atômicos e o commit de agrupamento para o GitHub:

```bash
# Enviar branch e configurar upstream
git push -u origin <nome-da-branch>
```

**Exemplo:**
```bash
git push -u origin feat/issue-1-docker-compose-setup
```

*(Opcional / Recomendado)* Abrir Pull Request via GitHub CLI assinado para si mesmo:
```bash
gh pr create --assignee "@me" --title "<tipo>(<escopo>): <título resumido>" --body "Resolve #<id>" --base main
```

---

## 🎯 Resumo das Regras Rígidas
- ❌ **Proibido:** Commits diretos na branch `main` durante o desenvolvimento de features ou fixes.
- ❌ **Proibido:** Commits genéricos misturando múltiplas tarefas (ex: `ajustes gerais`, `fixes`).
- ❌ **Proibido:** Mensagens de commit em inglês ou com ponto final.
- ✅ **Obrigatório:** Uma branch dedicada por issue/feature.
- ✅ **Obrigatório:** Um commit atômico por tarefa/critério de aceite concluído.
- ✅ **Obrigatório:** Um commit final de agrupamento (`--allow-empty`) com a lista de entregas antes do push.
