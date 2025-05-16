const fs = require('fs');
const path = require('path');

// Diretório de dados
const dataDir = path.join(__dirname, 'data');

console.log('Iniciando configuração do diretório de dados...');

try {
  // Verificar se o diretório existe
  if (!fs.existsSync(dataDir)) {
    console.log('Criando diretório de dados...');
    fs.mkdirSync(dataDir, { recursive: true });
  } else {
    console.log('Diretório de dados já existe.');
  }

  // Arquivos padrão
  const conversationsFile = path.join(dataDir, 'conversations.json');
  const knowledgeBaseFile = path.join(dataDir, 'knowledge_base.json');

  // Verificar e criar arquivos padrão se não existirem
  if (!fs.existsSync(conversationsFile)) {
    console.log('Criando arquivo de conversas padrão...');
    fs.writeFileSync(conversationsFile, JSON.stringify({}, null, 2));
  } else {
    console.log('Arquivo de conversas já existe.');
    
    // Verificar se o arquivo é válido
    try {
      const data = fs.readFileSync(conversationsFile, 'utf-8');
      JSON.parse(data);
      console.log('Arquivo de conversas é válido.');
    } catch (error) {
      console.error('Arquivo de conversas está corrompido. Criando backup e novo arquivo...');
      // Criar backup do arquivo corrompido
      fs.renameSync(conversationsFile, `${conversationsFile}.bak.${Date.now()}`);
      // Criar novo arquivo
      fs.writeFileSync(conversationsFile, JSON.stringify({}, null, 2));
    }
  }

  if (!fs.existsSync(knowledgeBaseFile)) {
    console.log('Criando arquivo de base de conhecimento padrão...');
    fs.writeFileSync(knowledgeBaseFile, JSON.stringify({}, null, 2));
  } else {
    console.log('Arquivo de base de conhecimento já existe.');
    
    // Verificar se o arquivo é válido
    try {
      const data = fs.readFileSync(knowledgeBaseFile, 'utf-8');
      JSON.parse(data);
      console.log('Arquivo de base de conhecimento é válido.');
    } catch (error) {
      console.error('Arquivo de base de conhecimento está corrompido. Criando backup e novo arquivo...');
      // Criar backup do arquivo corrompido
      fs.renameSync(knowledgeBaseFile, `${knowledgeBaseFile}.bak.${Date.now()}`);
      // Criar novo arquivo
      fs.writeFileSync(knowledgeBaseFile, JSON.stringify({}, null, 2));
    }
  }

  console.log('Diretório de dados configurado com sucesso!');
} catch (error) {
  console.error('Erro ao configurar diretório de dados:', error);
  process.exit(1); // Saída com erro para o Render saber que houve um problema
} 