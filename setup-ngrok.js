const { exec } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('===== Configuração do Ngrok =====');
console.log('Este script vai configurar o Ngrok para você acessar o Atlas de qualquer lugar.');
console.log('1. Você precisa criar uma conta em https://dashboard.ngrok.com/signup');
console.log('2. Depois de confirmar seu e-mail, obtenha seu token em https://dashboard.ngrok.com/get-started/your-authtoken');
console.log('3. Cole o token abaixo:\n');

rl.question('Cole seu authtoken do Ngrok: ', (token) => {
  if (!token || token.trim() === '') {
    console.log('Token não fornecido. Encerrando configuração.');
    rl.close();
    return;
  }

  console.log('\nConfigurando o Ngrok...');
  
  exec(`ngrok config add-authtoken ${token.trim()}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Erro ao configurar o Ngrok: ${error.message}`);
      console.log('\nVocê pode configurar manualmente executando:');
      console.log(`ngrok config add-authtoken ${token.trim()}`);
      rl.close();
      return;
    }
    
    console.log('Ngrok configurado com sucesso!');
    console.log('\nAgora você pode iniciar o túnel com:');
    console.log('npm run tunnel');
    
    rl.close();
  });
}); 