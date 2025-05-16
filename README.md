# Chatbot Gemini

Um chatbot simples utilizando a API do Gemini da Google.

## Requisitos

- Node.js (versão 14 ou superior)
- NPM ou Yarn

## Instalação

1. Clone este repositório
2. Instale as dependências

```bash
npm install
```

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```
GEMINI_API_KEY=sua_chave_api_aqui
PORT=3000
GEMINI_MODEL=gemini-1.5-flash
PAYLOAD_LIMIT=100mb
```

A variável `GEMINI_API_KEY` é obrigatória em ambiente de produção. As outras variáveis têm valores padrão se não forem especificadas.

**Importante**: Este projeto usa o modelo `gemini-1.5-flash`, que consome menos cota da API gratuita. O modelo `gemini-pro` original foi descontinuado e o `gemini-1.5-pro` tem limites mais restritivos na versão gratuita.

## Executando localmente

```bash
npm start
```

O servidor será iniciado na porta 3000. Acesse http://localhost:3000 no seu navegador.

Para desenvolvimento com reinício automático:

```bash
npm run dev
```

## Implantação no Render

Este projeto está configurado para ser facilmente implantado no Render. Siga os passos abaixo:

1. Crie uma conta no [Render](https://render.com/)
2. Conecte sua conta GitHub ao Render
3. Crie um novo Web Service no Render e selecione o repositório
4. O Render detectará automaticamente as configurações através do arquivo `render.yaml`
5. Adicione a variável de ambiente `GEMINI_API_KEY` com sua chave API do Gemini
6. Clique em "Create Web Service"

Alternativamente, se preferir configurar manualmente:

1. Crie um Web Service
2. Selecione o repositório
3. Defina:
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Adicione as variáveis de ambiente necessárias
5. Escolha o plano Free

### Solução de Problemas de Payload

Se estiver enfrentando erros `PayloadTooLargeError` ao processar arquivos grandes, verifique:

1. A variável de ambiente `PAYLOAD_LIMIT` está configurada (padrão: `100mb`)
2. O Render tem limites máximos para o plano gratuito. Considere limitar o tamanho dos arquivos no front-end

## Como usar

1. Digite uma mensagem na caixa de texto
2. Pressione Enter ou clique no botão Enviar
3. Aguarde a resposta do Gemini
4. Você também pode enviar imagens ou PDFs para análise

## Limitações

- A API do Gemini permite um número limitado de requisições por minuto com a chave gratuita
- O modelo `gemini-1.5-flash` tem menor consumo de tokens, mas pode ter respostas menos elaboradas que o `gemini-1.5-pro`
- A API do Gemini está em constante evolução, e os modelos podem mudar com o tempo
- Para maiores volumes de requisições, considere ativar o faturamento na sua conta Google Cloud 