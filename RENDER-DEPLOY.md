# Guia de Deploy do Chatbot Gemini no Render

Este guia fornece instruções passo a passo para implantar seu chatbot Gemini no Render.

## Pré-requisitos

- Uma conta no [Render](https://render.com/)
- Um repositório Git contendo o código do projeto

## Passos para Implantação

### 1. Preparar o Repositório

1. Certifique-se de que seu repositório Git contém todos os arquivos necessários:
   - `index.js` - Arquivo principal do servidor
   - `package.json` - Definição de dependências e scripts
   - `render.yaml` - Configuração para o Render
   - `setup-data-dir.js` - Script para configuração de diretórios
   - Diretório `public/` com os arquivos front-end

2. Verifique se a chave API do Gemini está configurada no `render.yaml`:
   ```yaml
   - key: GEMINI_API_KEY
     value: AIzaSyACBzVea3rvInMNZub507WcAeRm1se4kgM
   ```

### 2. Criar um Web Service no Render

#### Usando o arquivo render.yaml (Recomendado)

1. Faça login na sua conta do Render
2. No painel, clique em "New" e selecione "Blueprint"
3. Escolha o repositório Git que contém seu projeto
4. O Render detectará automaticamente o arquivo `render.yaml` e criará o serviço conforme definido
5. Clique em "Apply" para iniciar o processo de deploy

#### Configuração Manual

1. Faça login na sua conta do Render
2. No painel, clique em "New" e selecione "Web Service"
3. Escolha o repositório Git que contém seu projeto
4. Configure os seguintes campos:
   - **Name**: gemini-chatbot
   - **Environment**: Node
   - **Build Command**: npm install
   - **Start Command**: npm start
   - **Plan**: Free
5. Na seção "Environment Variables", adicione:
   - `GEMINI_API_KEY`: AIzaSyACBzVea3rvInMNZub507WcAeRm1se4kgM
   - `PORT`: 10000
   - `GEMINI_MODEL`: gemini-1.5-flash
   - `PAYLOAD_LIMIT`: 150mb
   - `NODE_ENV`: production
6. Clique em "Create Web Service" para iniciar o deploy

### 3. Monitorar o Deploy

1. Após iniciar o deploy, o Render mostrará uma página de status
2. Acompanhe os logs para verificar se há erros durante o processo
3. O deploy inicial pode levar alguns minutos

### 4. Testar o Serviço

1. Quando o status mudar para "Live", clique no link fornecido para acessar seu chatbot
2. Teste o chatbot enviando mensagens, imagens e PDFs
3. Verifique se todas as funcionalidades estão funcionando corretamente

## Solução de Problemas

### Erro PayloadTooLargeError

Se você ainda enfrentar erros `PayloadTooLargeError` ao enviar arquivos grandes:

1. Verifique se está usando a versão mais recente do front-end com compressão de arquivos
2. Reduza o tamanho dos arquivos antes de fazer o upload
3. Divida PDFs grandes em partes menores
4. Considere comprimir imagens antes de enviá-las

### Problemas com o Diretório de Dados

O Render usa armazenamento efêmero, o que significa que os dados no sistema de arquivos são perdidos quando o serviço é reiniciado. Para dados persistentes:

1. Use o armazenamento em disco fornecido pelo Render (disponível em planos pagos)
2. Ou considere migrar dados importantes para um banco de dados externo

### Verificação de Status

Para verificar se o serviço está funcionando corretamente, acesse:
```
https://seu-app-no-render.onrender.com/api-status
```

Este endpoint retornará um JSON informando se a API do Gemini está acessível.

## Atualizações

Para atualizar seu chatbot:

1. Faça as alterações no código-fonte
2. Faça commit e push para seu repositório Git
3. O Render detectará automaticamente as mudanças e implantará a nova versão

## Observações Finais

- O plano gratuito do Render tem limitações de recursos e pode hibernar após períodos de inatividade
- Para um serviço sempre ativo, considere usar um plano pago
- Acompanhe o uso de tokens da API do Gemini para não exceder os limites gratuitos 