---
name: git-issue-pr-closer
description: Cria Pull Request detalhado e assinado no GitHub para a branch da issue, adiciona comentário de entrega na issue com o resumo das tarefas executadas e vincula o fechamento automático da issue.
---

# Finalização de Issue com Pull Request e Comentário (Git Issue PR Closer)

Esta skill padroniza o encerramento do ciclo de desenvolvimento de uma issue. Ela orienta a criação do Pull Request (PR) com descrição técnica detalhada, assinatura formal de autoria, publica um comentário formal de entrega na issue informando tudo o que foi realizado e assegura o fechamento vinculado.

---

## Fluxo de Finalização

```text
[Branch com Commits] ──► [Criar Pull Request Assinado (gh pr create --assignee)]
                                   │
                                   ▼
[Fechar Issue / Sincronizar Main] ◄── [Comentar na Issue (gh issue comment)]
```

---

## Passo a Passo de Execução

### 1. Identificar a Issue e a Branch Atual
Verifique em qual branch você está trabalhando e extraia o número da issue associada:

```bash
# Verificar branch atual (ex: feat/issue-1-docker-compose-setup)
git branch --show-current
```

---

### 2. Criar o Pull Request (PR) Assinado no GitHub
Crie o PR apontando da branch de trabalho para a `main`, contendo o título em **Conventional Commits (Português)** e um corpo estruturado com a palavra-chave de fechamento `Closes #<id>`.

**Assinatura do PR:**
1. Atribua a responsabilidade formal utilizando a flag `--assignee "@me"` (ou o usuário GitHub do autor).
2. Adicione ao final do corpo do PR um rodapé de assinatura com o responsável (`**Assinado por:** @<usuario>` ou `Signed-off-by: Nome <email>`).
3. Utilize escrita técnica sóbria, sem emojis decorativos nos títulos, seções ou itens.

```bash
gh pr create \
  --base main \
  --assignee "@me" \
  --title "<tipo>(<escopo>): <título resumido da entrega>" \
  --body "## Resumo das Alterações
<Breve resumo do que foi desenvolvido e o objetivo da entrega>.

## Tarefas Concluídas
- [x] <Tarefa 1 implementada>
- [x] <Tarefa 2 implementada>
- [x] <Tarefa 3 implementada>

## Como Testar / Validar
1. \`<Passo 1 de teste>\`
2. \`<Passo 2 de teste>\`

Closes #<id_da_issue>

---
**Assinado por:** @<usuario_github>"
```

**Exemplo Prático (Issue #1):**
```bash
gh pr create \
  --base main \
  --assignee "@me" \
  --title "feat(infra): configurar orquestracao multi-servico com docker compose" \
  --body "## Resumo das Alterações
Configuração do ambiente de desenvolvimento e produção multi-container orquestrando PostgreSQL 16, Redis 7, API FastAPI e os workers assíncronos.

## Tarefas Concluídas
- [x] Criação do \`docker-compose.yml\` com volumes e redes isoladas.
- [x] Configuração de healthcheck para PostgreSQL e Redis.
- [x] Mapeamento de variáveis de ambiente no \`.env.example\`.

## Como Testar / Validar
1. Executar \`docker-compose up -d postgres redis\`.
2. Verificar se ambos os containers respondem como saudáveis (\`docker ps\`).

Closes #1

---
**Assinado por:** @NdondaDaniel2020"
```

---

### 3. Publicar Comentário de Entrega na Issue
Para manter o histórico e a rastreabilidade da issue transparentes para a equipe, adicione um comentário detalhado na issue referenciando o Pull Request (utilize formatação sóbria e direta, sem emojis decorativos):

```bash
gh issue comment <id_da_issue> --body "### Entrega Concluída

Todas as tarefas planejadas para esta issue foram finalizadas e validadas:

- **Tarefa 1:** <Detalhe da tarefa 1>
- **Tarefa 2:** <Detalhe da tarefa 2>
- **Tarefa 3:** <Detalhe da tarefa 3>

**Pull Request de Integração:** #<numero_do_pr>

A issue será fechada automaticamente após o merge do PR.

---
**Assinado por:** @<usuario_github>"
```

**Exemplo Prático:**
```bash
gh issue comment 1 --body "### Entrega Concluída

Todas as tarefas planejadas para esta issue foram finalizadas e validadas:

- **Docker Compose:** Orquestração completa de PostgreSQL 16, Redis 7, API e workers.
- **Resiliência:** Scripts de verificação de integridade e healthcheck ativos.
- **Configuração:** Template \`.env.example\` atualizado com CORS e portas isoladas.

**Pull Request de Integração:** Aberto para revisão (#12).

A issue será fechada automaticamente assim que o PR for mesclado na branch \`main\`.

---
**Assinado por:** @NdondaDaniel2020"
```

---

### 4. Mesclagem do PR e Fechamento da Issue
Após a aprovação ou validação:

#### Opção A: Fazer o merge via GitHub CLI (Recomendado)
```bash
# Mesclar o PR (utilizando squash ou merge conforme padrão do projeto)
gh pr merge <numero_do_pr> --squash --delete-branch
```
> O GitHub fechará automaticamente a issue vinculada pela diretiva `Closes #<id>`.

#### Opção B: Fechamento Manual (caso o PR seja mesclado externamente)
```bash
gh issue close <id_da_issue> --comment "Encerrado após validação e merge das alterações."
```

---

### 5. Sincronização Local com a `main`
Após o merge do PR, retorne à branch `main` e atualize o código local:

```bash
git checkout main
git pull origin main
```

---

## Regras de Ouro
1. **Sempre referenciar a issue:** Use obrigatoriamente `Closes #<id>` no corpo do PR para encadeamento automático do ciclo de vida.
2. **Idioma:** Títulos e descrições do PR e comentários na issue devem ser em **Português**.
3. **Mínimo de Emojis:** Utilize redação técnica, limpa e profissional. Não utilize emojis em títulos, seções e listas do Pull Request ou em comentários da issue.
4. **Transparência:** Nunca fechar uma issue sem deixar um comentário explicativo com o que foi entregue.
5. **Assinatura Obrigatória:** Todo Pull Request deve ser assinado e atribuído:
   - Use obrigatoriamente a flag `--assignee "@me"` no `gh pr create` para registrar formalmente a responsabilidade no GitHub.
   - Inclua no rodapé do corpo do PR e comentário da issue a linha de assinatura (`**Assinado por:** @<usuario>` ou `Signed-off-by: Nome <email>`).
