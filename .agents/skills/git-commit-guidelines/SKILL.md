---
name: git-commit-guidelines
description: Diretrizes de commit e padronização com Conventional Commits em Português. Use sempre que for criar, sugerir ou executar commits no Git, estruturar mensagens de commit ou planejar histórico de alterações.
---

# Diretrizes de Commit (Git Commit Guidelines)

Sempre que realizar commits ou sugerir mensagens de commit:

1. **Idioma**: Escreva a mensagem de commit obrigatoriamente em **Português** (ex: `adicionar`, `corrigir`, `refatorar`).
2. **Estrutura**: Siga estritamente a especificação Conventional Commits no formato:
   ```text
   <type>(<scope>): <description>
   ```
3. **Tipos Padrão**:
   - `feat`: Nova funcionalidade (ex: `feat(auth): adicionar suporte a login via Google`)
   - `fix`: Correção de bug (ex: `fix(security): corrigir vulnerabilidade no escopo de sessão`)
   - `docs`: Documentação (ex: `docs(readme): atualizar guia de instalação local`)
   - `style`: Ajustes de formatação/estilo sem alterar lógica (ex: `style(user): formatar tipos do modelo`)
   - `refactor`: Refatoração de código sem mudar comportamento (ex: `refactor(db): otimizar consulta de usuários`)
   - `test`: Testes unitários ou de integração (ex: `test(auth): adicionar testes para renovação de token`)
   - `chore`: Manutenção, dependências, makefiles ou configs (ex: `chore(deps): atualizar versão do ruff`)
   - `perf`: Melhorias de performance (ex: `perf(cache): adicionar cache em memória`)
   - `ci`: Configurações de CI/CD e workflows (ex: `ci(github): ajustar pipeline de testes`)

4. **Regras adicionais**:
   - O escopo `(<scope>)` deve indicar o módulo ou componente afetado (ex: `auth`, `user`, `db`, `deps`, `config`).
   - A descrição deve ser em letras minúsculas, sem ponto final.

## Exemplos de Uso

```bash
git add src/auth/service.py
git commit -m "feat(auth): adicionar validacao de token jwt"
```

```bash
git add README.md
git commit -m "docs(readme): atualizar guia de instalacao local"
```
