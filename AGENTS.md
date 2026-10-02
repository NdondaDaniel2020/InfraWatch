# Diretrizes de Execução e Permissões - InfraWatch

Este arquivo define a política de execução e segurança dos agentes Antigravity neste projeto.

---

## 1. Política Geral de Execução de Ferramentas

- **Comandos de Desenvolvimento (Auto-aprováveis / Livres)**:
  O agente deve priorizar comandos padronizados, idempotentes e seguros dentro do workspace, compatíveis com a política de prefix-matching do sandbox do Antigravity:
  - Git: `git status`, `git diff`, `git add`, `git commit`, `git checkout`, `git branch`, `git merge`, `git log`, `git pull`, `git push`.
  - Python / Testes: `python`, `python3`, `pytest`, `ruff`, `mypy`, `black`, `isort`, `uv`, `pip`.
  - Docker: `docker compose up`, `docker compose ps`, `docker compose logs`, `docker build`.
  
  
make
mkdir
cp
touch
cat
ls
head
tail
grep
find

---

## 2. Comandos Destrutivos (Confirmação Obrigatória)

> [!CAUTION]
> **NUNCA** execute comandos de remoção, deleção de arquivos ou reversão destrutiva sem perguntar e obter confirmação prévia e explícita do usuário no chat.






Antes de propor ou executar qualquer um desses comandos, o agente deve:
1. Listar expressamente quais arquivos ou recursos serão removidos.
2. Explicar o motivo e apresentar alternativas se houver.
3. Aguardar o aceite explícito do usuário.

---

## 3. Padrão de Comandos (Prefix-Matchable)

Para evitar que a interface do Antigravity continue solicitando permissão repetitiva para comandos comuns:
- Executar os binários diretamente (ex.: `pytest backend/tests` em vez de scripts envelopados com `eval` ou `sudo`).
- Evitar interpolações excessivas de variáveis de shell ou substituições dinâmicas (`$(...)`) na chamada do comando, garantindo que o motor de permissões do Antigravity consiga memorizar o padrão `binary subcommand` permanentemente.
