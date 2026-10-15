---
name: git-issue-creator
description: Criação e especificação de issues técnicas no GitHub com alinhamento estrito ao plano de implementação, padronização de labels (type, phase), milestones e tarefas atômicas sem escopo inflado.
---

# Criação e Especificação de Issues Técnicas (Git Issue Creator)

Esta skill padroniza a criação de issues técnicas no repositório GitHub do **InfraWatch**. Ela garante que toda issue criada seja rica em detalhes arquiteturais, padronizada com Conventional Commits, vinculada às labels e milestones corretos, e — acima de tudo — **estritamente alinhada ao plano de implementação do projeto, eliminando complexidade desnecessária e escopo inflado ("sem gerar coisa à toa")**.

---

## 🎯 Princípios Fundamentais (Anti-Overengineering & Escopo Rígido)

1. **Aderência ao Plano de Implementação:**
   - A issue deve responder diretamente a uma necessidade real do roadmap (`ARCHITECTURE.md`, `DECISIONS.md`/ADRs, ou fase atual).
   - Antes de propor uma issue, valide se o problema já não está resolvido ou delegado a outro componente da arquitetura (exemplo: telemetria SNMP já é delegada ao Zabbix na ADR-004; não criar probers nativos desnecessários).

2. **Proibido "Gerar Coisa à Toa":**
   - Não adicione bibliotecas externas que não foram validadas.
   - Não crie camadas de abstração prematuras que não atendem ao critério de aceite imediato.
   - Não misture múltiplos problemas não relacionados na mesma issue.

3. **Mapeamento 1-para-1 com Commits Atômicos:**
   - Cada checkbox na lista de tarefas deve representar uma unidade de trabalho atômica, apontando explicitamente para os arquivos a serem criados ou alterados (ex: `backend/src/...`).
   - Isso garante integração direta com a skill `git-issue-atomic-workflow`.

4. **Critérios de Aceite Testáveis e Mensuráveis:**
   - Critérios devem ser verificáveis por testes automatizados (pytest/vitest) ou benchmarks objetivos (tempo de resposta, status codes, limites de concorrência).

---

## 🏷️ Padrão de Metadados no InfraWatch

Toda issue deve conter:

### 1. Título (Conventional Commits em Português)
```text
<tipo>(<escopo>): <descrição sucinta em minúsculas sem ponto final>
```
*Exemplos:*
- `feat(telemetry): DockerProber para monitoramento nativo de conteineres via Docker Engine API`
- `feat(frontend): Dashboard de Topologia de Rede Interativa com Nos Dinamicos e Grid`
- `fix(auth): sanitizar token mfa pendente ao expirar sessao`

### 2. Labels Obrigatórias
Combine sempre a label de **Fase** com a label de **Tipo**:

| Categoria | Labels Disponíveis |
| :--- | :--- |
| **Fases do Roadmap** | `phase:1-foundation`, `phase:2-auth`, `phase:3-telemetry`, `phase:4-integrations`, `phase:5-frontend`, `phase:6-qa` |
| **Tipos de Demanda** | `type:feature`, `type:bug`, `type:security`, `type:architecture`, `type:performance` |

### 3. Milestone Oficial
Vincule sempre ao Milestone correspondente cadastrado no repositório:
- `Fase 1: Fundação, Infraestrutura & Core Engine`
- `Fase 2: Autenticação, RBAC & Adaptação Cirúrgica`
- `Fase 3: Telemetria, Engine de Coleta & Micro-Probes`
- `Fase 4: Integrações Corporativas (GLPI, Webhooks & Outbox)`
- `Fase 5: Frontend NOC Dashboard, TV Mode & Portal do Cliente`
- `Fase 6: Homologação, Carga, Auditoria & Go-Live`

### 4. Responsável (Assignee)
- Sempre atribua ao usuário atual via `--assignee "@me"` (ou username do autor).

---

## 📋 Estrutura Padrão do Corpo da Issue

O corpo deve seguir estritamente o template abaixo:

```markdown
## 📌 Descrição & Contexto
<Contextualização clara do problema real, a motivação técnica e por que esta funcionalidade precisa existir no InfraWatch. Indicar referências a ADRs quando aplicável.>

## 🎯 Solução Técnica & Arquitetura
1. **<Componente/Módulo Principal> (<caminho_do_arquivo>):**
   - <Detalhes de como será implementado respeitando DDD, Hexagonal ou padrões de UI>.
2. **<Ponto de Integração>:**
   - <Como integra com os workers, barramento de eventos, SSE ou banco>.
3. **<Resiliência & Isolamento>:**
   - <Tratamento de timeout, concorrência ou isolamento de falha>.
4. **<Estratégia de Testes>:**
   - <Como os testes unitários e de integração irão cobrir a feature>.

## 📋 Lista de Tarefas (Mapeamento 1-para-1 com Commits Atômicos)
- [ ] <caminho/do/arquivo>: <Ação atômica específica a ser executada>.
- [ ] <caminho/do/arquivo>: <Ação atômica específica a ser executada>.
- [ ] <caminho/do/teste>: <Suíte de testes automatizados correspondente>.

## ✅ Critérios de Aceite
- [ ] <Critério funcional verificável>.
- [ ] <Critério de desempenho/resiliência, ex: tempo < 100ms ou tratamento de timeout>.
- [ ] <100% de cobertura nos testes unitários, Mypy estrito e Ruff sem warnings>.
```

---

## ⚙️ Passo a Passo de Execução via GitHub CLI (`gh`)

### Passo 1: Verificar Milestones e Labels Disponíveis
Antes de criar, valide os nomes exatos caso tenha dúvidas:
```bash
gh label list
gh api repos/:owner/:repo/milestones --jq '.[].title'
```

### Passo 2: Executar a Criação da Issue
Execute via `gh issue create` passando todos os parâmetros:

```bash
gh issue create \
  --title "<tipo>(<escopo>): <título resumido>" \
  --milestone "<Nome Exato do Milestone>" \
  --label "phase:<fase>,type:<tipo>" \
  --assignee "@me" \
  --body "$(cat <<'EOF'
## 📌 Descrição & Contexto
...

## 🎯 Solução Técnica & Arquitetura
...

## 📋 Lista de Tarefas (Mapeamento 1-para-1 com Commits Atômicos)
- [ ] caminho/do/arquivo: descrição

## ✅ Critérios de Aceite
- [ ] Critério 1
- [ ] Critério 2
EOF
)"
```

### Passo 3: Confirmar e Rastrear
Exiba a URL e o número da issue gerada:
```bash
gh issue view <id_da_issue>
```

---

## 🚫 Anti-Padrões a Evitar (O que é "Coisa à Toa")

| ❌ O que NÃO fazer | ✅ Como fazer corretamente |
| :--- | :--- |
| Criar tarefas genéricas como `"melhorar backend"`, `"refatorar código"` | Especificar arquivos exatos: `backend/src/workers/probers/docker.py` com o objetivo funcional claro |
| Adicionar bibliotecas pesadas quando a biblioteca padrão ou cliente atual já resolvem (ex: puxar SDK oficial gigante do Docker em vez de consumir API via HTTP assíncrono leve) | Usar ferramentas já existentes no stack (`httpx`, `asyncio`, etc.) |
| Propor features sem vínculo com as fases do projeto | Toda issue pertence a um milestone de fase (1 a 6) |
| Esquecer os testes na lista de tarefas | Todo novo componente deve listar seu arquivo de teste unitário correspondente |
| Criar tarefas abertas sem critérios de aceite mensuráveis | Critérios objetivos: testes passando, Mypy 100%, tempo de resposta |

---

## 🔄 Encadeamento com o Fluxo Git do Projeto

Após a criação da issue com esta skill:
1. **Criar a Branch:** Utilize a skill `git-issue-atomic-workflow`:
   ```bash
   git checkout -b <tipo>/issue-<id>-<descricao-curta>
   ```
2. **Executar as Tarefas:** Um commit atômico por checkbox da lista de tarefas.
3. **Encerrar a Issue:** Utilize a skill `git-issue-pr-closer` para abrir o Pull Request assinado e vincular o fechamento automático.
