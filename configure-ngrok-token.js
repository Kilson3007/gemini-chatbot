const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// O token que o usuário forneceu
const authToken = '2x8i5UccsHkbnLzx5k92MV1L3o8_4H3FLqTxWTQzN9j29Pcsh';

console.log('Configurando o Ngrok com seu token...');

// Tentar configurar usando o comando ngrok
exec(`ngrok config add-authtoken ${authToken}`, (error, stdout, stderr) => {
  if (error) {
    console.error('Erro ao configurar usando o comando ngrok:', error.message);
    console.log('Tentando método alternativo...');
    
    // Método alternativo: salvar diretamente no arquivo de configuração do ngrok
    try {
      // Determinar localização do arquivo de configuração do ngrok
      const homeDir = process.env.USERPROFILE || process.env.HOME;
      const ngrokDir = path.join(homeDir, '.ngrok2');
      
      // Criar diretório se não existir
      if (!fs.existsSync(ngrokDir)) {
        fs.mkdirSync(ngrokDir, { recursive: true });
      }
      
      const configPath = path.join(ngrokDir, 'ngrok.yml');
      
      // Criar ou atualizar arquivo de configuração
      let config = '';
      if (fs.existsSync(configPath)) {
        config = fs.readFileSync(configPath, 'utf8');
        
        // Atualizar authtoken se já existir
        if (config.includes('authtoken:')) {
          config = config.replace(/authtoken: .*(\r?\n|$)/g, `authtoken: ${authToken}\n`);
        } else {
          config += `\nauthtoken: ${authToken}\n`;
        }
      } else {
        config = `authtoken: ${authToken}\nversion: 2\n`;
      }
      
      fs.writeFileSync(configPath, config, 'utf8');
      console.log('Configuração salva com sucesso em:', configPath);
      console.log('\nAgora você pode iniciar o Ngrok com:');
      console.log('npm run tunnel');
    } catch (fsError) {
      console.error('Erro ao salvar configuração manualmente:', fsError);
      console.log('\nVocê pode configurar manualmente executando:');
      console.log(`ngrok config add-authtoken ${authToken}`);
    }
    return;
  }
  
  console.log('Ngrok configurado com sucesso!');
  console.log('\nAgora você pode iniciar o túnel com:');
  console.log('npm run tunnel');
}); 