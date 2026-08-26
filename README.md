# Preço em Suor

PWA mobile-first que lê o preço de uma etiqueta pela câmera (OCR **100% local**, via
[Tesseract.js](https://tesseract.projectnaptha.com/)) e mostra **quanto tempo de trabalho**
aquele produto custa, sobreposto na tela em cima de uma mira.

> Nenhuma imagem sai do aparelho. Todo o reconhecimento roda no dispositivo.

Além da câmera, dá para **digitar o valor à mão** e **comparar até 4 moedas ao mesmo tempo**
— ambos recalculam ao vivo enquanto você digita.

## Como funciona

1. Na primeira vez, escolha o **valor base**: **seu salário** mensal líquido **ou** o
   **salário mínimo de um país** (Brasil + 20 maiores economias, com bandeira). No modo país,
   o mínimo local é convertido para R$ pela cotação atual — então, se você "ganhasse em dólar",
   vê quanto tempo trabalharia por um produto **precificado em real** (evidenciando a diferença).
   Também dá para ajustar as horas/mês (padrão CLT = 220).
2. Aponte a câmera traseira para a etiqueta, alinhando o preço dentro da **mira**.
3. O app recorta **apenas a região da mira (ROI)** e roda OCR só nela, com *throttle*.
4. Mostra o resultado **na primeira leitura** (sem espera). Se houver **vários preços
   empilhados** (um embaixo do outro), lê todos e exibe **um tempo por linha**, alinhado
   à posição real de cada preço.
5. Cada linha mostra o **tempo de trabalho** (`4h 12min`, `2d 3h`, `45s`...) + o preço,
   num bloco com as **cores amostradas daquela linha da etiqueta** (contraste WCAG ≥ 4.5:1).
6. O resultado fica nítido por ~4,5 s e esmaece (~6 s no total); o OCR retoma no início do
   *fade*. Tudo é calibrável no objeto **`CONFIG`** no topo do `<script>` em `index.html`.
7. Botões discretos para editar o **valor base**, abrir o modo **digitar valor** e ver o
   **histórico** (exportável via compartilhamento nativo do celular, com *fallback* para
   cópia/download `.txt`).

## Digitar valor (sem câmera) + comparar até 4 moedas

O chip **Digitar** (barra superior da câmera) abre um painel que também é alcançável de
onde a câmera ainda não está ligada — tela de setup, gate "Ligar câmera", tela de erro de
câmera e a landing de desktop. Ou seja: **o app inteiro funciona sem câmera**, inclusive no
computador.

- **Valor digitado:** você informa o preço em R$ e vê na hora o tempo de trabalho, o valor
  da hora usado e um botão para gravar a leitura no mesmo histórico (marcada com `✍`).
  Aberto a partir da câmera, o campo já vem **pré-preenchido com o último preço lido**.
- **Comparador:** escolha até **4 moedas** (o seu salário + o salário mínimo de qualquer
  país da lista) e veja, para o **mesmo preço**, três coisas por linha: o preço convertido
  naquela moeda, o valor da hora daquela base em R$ e o **tempo de trabalho** — com barra
  proporcional ao pior tempo, verde no menor e vermelho no maior.
- A seleção de moedas fica salva em `localStorage` (`pes_compare`), então volta pronta na
  próxima abertura. O OCR fica **pausado** enquanto o painel está aberto, para a câmera não
  disparar um resultado por baixo do modal.

Cada base usa a **jornada legal do próprio país** (BR 220h/mês, FR 152h, US 173h…), então a
comparação é "quanto tempo de vida esse preço custa em cada lugar", não só conversão de câmbio.

`valor_hora = salario_mensal / HORAS_MES` · `horas = preço / valor_hora`

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | App completo e autocontido (HTML + CSS + JS inline). Câmera, valor digitado e comparador de moedas. Funciona sozinho. |
| `economias.json` | Brasil + 20 maiores economias: bandeira, nome, moeda, salário mínimo mensal e `cotacaoBRL`. |
| `update-rates.sh` | Atualiza as cotações em `economias.json` via API pública de câmbio. Para o cron. |
| `manifest.json`, `icon.svg`, `sw.js` | Instalabilidade (PWA) + cache offline opcional. |
| `Dockerfile`, `nginx.conf` | Imagem estática servida por nginx. |
| `docker-compose.yml` | Publicação via Traefik (HTTPS/Let's Encrypt) + volume do `economias.json`. |
| `deploy.sh` | Commit + push + deploy no servidor. |

## Cotações de câmbio (cron)

O `economias.json` traz o salário mínimo de cada país em moeda local + um campo `cotacaoBRL`
(quantos reais vale 1 unidade da moeda). O script **`update-rates.sh`** busca o câmbio atual
numa API pública gratuita (`open.er-api.com`, com fallback `frankfurter.app`) e reescreve o JSON.

O `docker-compose.yml` monta o `economias.json` do host como volume — então o cron atualiza o
arquivo e o nginx já serve a versão nova **sem rebuild**.

> **Duas armadilhas reais deste arquivo** (ambas já tratadas no `deploy.sh`):
>
> 1. `economias.json` é **rastreado pelo git** e reescrito no lugar pelo cron, então o working
>    tree do servidor vive sujo. Sem descartar a cópia local antes, o dia em que um commit tocar
>    esse arquivo o `git pull` aborta com *"local changes would be overwritten"* e o deploy morre
>    no meio. Descartar é seguro: o `update-rates.sh` regenera **tudo** (cotações vêm da API,
>    salários e horas vêm do `SNAPSHOT` dentro do próprio script) — a versão commitada só serve
>    de semente para clone novo.
> 2. O volume é um bind mount de **arquivo único**, preso ao *inode*. O git troca arquivo por
>    `temp + rename`, ou seja, todo `checkout`/`pull` cria um inode novo e o container continua
>    lendo o antigo, órfão — servindo cotação velha **sem erro nenhum**. Por isso o deploy usa
>    `--force-recreate`: `--build` sozinho não recria quando a imagem não muda.
>
> O cron em si não sofre disso: `update-rates.sh` escreve *in place*, preservando o inode.

Agende no cron do servidor (ex.: todo dia às 06:00):

```cron
0 6 * * * /root/precoemsuor/update-rates.sh >> /var/log/precoemsuor-rates.log 2>&1
```

> "Chamável via URL": o script consome a URL da API de câmbio. Se quiser dispará-lo por um
> webhook, basta apontar um job/cron externo (`curl`) para um endpoint que execute este script.

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
