# Preço em Suor

PWA mobile-first que lê o preço de uma etiqueta pela câmera (OCR **100% local**, via
[Tesseract.js](https://tesseract.projectnaptha.com/)) e mostra **quanto tempo de trabalho**
aquele produto custa, sobreposto na tela em cima de uma mira.

> Nenhuma imagem sai do aparelho. Todo o reconhecimento roda no dispositivo.

## Como funciona

1. Na primeira vez, informe seu **salário mensal líquido** (e, opcionalmente, as horas/mês — padrão CLT = 220).
2. Aponte a câmera traseira para a etiqueta, alinhando o preço dentro da **mira**.
3. O app recorta **apenas a região da mira (ROI)** e roda OCR só nela, com *throttle*.
4. Faz **consenso de 3 leituras** (≥2 iguais) para resistir a vírgulas/reflexos.
5. Mostra o **tempo de trabalho** (`4h 12min`, `2d 3h`, `45s`...) + o preço lido, num bloco
   com as **cores amostradas da própria etiqueta** (contraste WCAG ≥ 4.5:1 garantido).
6. O resultado fica **8 s** e esmaece; o OCR já retoma no início do *fade*.
7. Botões discretos para editar o **valor base** e ver o **histórico** (exportável via
   compartilhamento nativo do celular, com *fallback* para cópia/download `.txt`).

`valor_hora = salario_mensal / HORAS_MES` · `horas = preço / valor_hora`

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | App completo e autocontido (HTML + CSS + JS inline). Funciona sozinho. |
| `manifest.json`, `icon.svg`, `sw.js` | Instalabilidade (PWA) + cache offline opcional. |
| `Dockerfile`, `nginx.conf` | Imagem estática servida por nginx. |
| `docker-compose.yml` | Publicação via Traefik (HTTPS/Let's Encrypt). |
| `deploy.sh` | Commit + push + deploy no servidor. |

## Deploy

É um app **estático**. Exige **HTTPS** (a API de câmera `getUserMedia` só funciona em
contexto seguro). Basta servir os arquivos e apontar o subdomínio para a pasta.

### Via Docker + Traefik (este repo)

```bash
docker compose up --build -d
```

O `docker-compose.yml` registra no Traefik o host `precoemsuor.9ideias.com.br`,
com redirect HTTP→HTTPS e certificado Let's Encrypt automático. Requer a rede
externa `traefik_net` (já existente no servidor).

### Servidor estático qualquer

Copie `index.html`, `manifest.json`, `icon.svg` e `sw.js` para a raiz pública de um
host com HTTPS. Nada mais é necessário.

## Compatibilidade

Testado mentalmente para **Chrome Android** e **Safari iOS** (`playsinline`, gesto do
usuário para iniciar a câmera, `facingMode: environment`). Degrada com mensagens
claras se a câmera ou o OCR falharem.
