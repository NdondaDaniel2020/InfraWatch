# 🔐 Gestão de Certificados SSL/TLS e Arquitetura de Borda (Issue #270)

Este documento descreve a arquitetura de segurança de borda, o modelo de **Ponto Único de Entrada** (*Single Nginx Gateway*) e o procedimento facilitado para gestão e troca de certificados TLS/HTTPS com o domínio **`infrawatch.42.fr`**.

---

## 🏛️ Arquitetura de Borda (Eliminação do Two-Tier Nginx)

O InfraWatch elimina qualquer redundância de *Nginx atrás de Nginx*, centralizando a entrega de tráfego em um único Gateway de alta performance:

```
[ Cliente / Browser ]
         │
         ├─── (Porta 80 HTTP)  ───► [ Nginx Gateway ] ───► HTTP 301 Redirect para HTTPS
         │                                              (ou Desafio ACME .well-known)
         │
         └─── (Porta 443 HTTPS) ──► [ Nginx Gateway ] ─── (Terminação TLS: infrawatch.42.fr)
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
        [ Volume frontend_dist ]                      [ infrawatch-api:8000 ]
        (SPA Estática Vite via sendfile)              (FastAPI REST & Streaming SSE)
```

1. **`infrawatch-gateway` (Único Nginx do Cluster)**:
   - Ponto único de entrada pública (portas `80:80` e `443:443`).
   - Terminação SSL com TLS 1.2/1.3, HSTS e cifras seguras ECDHE.
   - Entrega direta de arquivos estáticos da SPA (`/usr/share/nginx/html`) com fallback do React Router (`try_files $uri $uri/ /index.html`) e cache imutável para assets Vite com hash via *kernel zero-copy* (`sendfile`).
   - Proxy reverso com streaming SSE sem buffering para a API FastAPI.
2. **`infrawatch-frontend` (Build & Volume Exporter)**:
   - Container leve Alpine responsável por compilar a SPA (`npm run build`) e sincronizar os artefatos no volume compartilhado `frontend_dist`.
   - **Não executa daemon Nginx nem servidor HTTP**, economizando memória RAM e eliminando duplicações de cabeçalhos.
3. **`infrawatch-api` (Backend FastAPI)**:
   - Aplicação FastAPI / Python operando estritamente na rede interna `infrawatch-net` (porta 8000).
   - Protegida contra acessos diretos do host.

---

## 🔑 Certificado Autoassinado (`infrawatch.42.fr`)

Para ambientes locais, desenvolvimento, testes e redes institucionais da 42, o InfraWatch gera automaticamente certificados autoassinados válidos por 365 dias com **Subject Alternative Names (SAN)**:

- **Domínio Principal**: `infrawatch.42.fr`
- **Domínios Alternativos (SAN)**:
  - `*.infrawatch.42.fr`
  - `localhost`
  - `127.0.0.1`
  - `infrawatch.local`

### Geração Automática
O comando `make up` executa automaticamente `make certs` antes de iniciar os contêineres:

```bash
# Gerar manualmente os certificados autoassinados:
make certs

# Limpar e regenerar novos certificados:
make certs-clean && make certs
```

Os arquivos são gerados no diretório seguro `./certs/`:
- `certs/fullchain.pem`: Certificado público (permissão `644`).
- `certs/privkey.pem`: Chave privada RSA de 2048 bits (permissão `600`).

---

## 🔄 Troca Facilitada de Certificados (Zero Downtime)

Para utilizar certificados corporativos válidos emitidos por uma Autoridade Certificadora (CA) pública ou Let's Encrypt:

1. **Copiar os certificados**:
   Substitua os arquivos no diretório `certs/` mantendo os nomes canônicos:
   ```bash
   cp /caminho/do/seu_certificado.crt certs/fullchain.pem
   cp /caminho/do/sua_chave.key certs/privkey.pem
   chmod 600 certs/privkey.pem
   ```

2. **Recarregar o Nginx em Tempo Real**:
   Sem reiniciar os containers e sem rebuild de imagem, execute:
   ```bash
   make gateway-reload
   ```
   *(Internamente executa: `docker compose exec infrawatch-gateway nginx -s reload`)*.

---

## 🌐 Resolução DNS Local (/etc/hosts)

Para acessar via navegador utilizando o domínio institucional `infrawatch.42.fr`, adicione a entrada no arquivo `/etc/hosts` da sua máquina:

```text
127.0.0.1 infrawatch.42.fr
```

URLs de Acesso:
- **Painel InfraWatch**: `https://infrawatch.42.fr/`
- **Documentação Interativa Swagger**: `https://infrawatch.42.fr/docs`
- **Health Check do Gateway**: `https://infrawatch.42.fr/healthz`
