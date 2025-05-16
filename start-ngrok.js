const ngrok = require('ngrok');
const port = 3000;

console.log('Iniciando túnel ngrok para a porta', port);
console.log('Este link poderá ser acessado de qualquer lugar, inclusive redes móveis!');
console.log('Aguarde a URL aparecer abaixo...\n');

async function startNgrok() {
  try {
    // Conectar ao ngrok
    const url = await ngrok.connect({
      authtoken: '2x8i5UccsHkbnLzx5k92MV1L3o8_4H3FLqTxWTQzN9j29Pcsh',
      addr: port,
      region: 'us',
    });
    
    console.log('\n==================================================');
    console.log(`✅ ATLAS DISPONÍVEL EM: ${url}`);
    console.log('==================================================\n');
    console.log('Copie este link e use-o no seu telefone ou compartilhe com outras pessoas!');
    console.log('O link ficará ativo enquanto este terminal estiver aberto.');
    console.log('Para encerrar, pressione Ctrl+C\n');
    
    // Manter o processo rodando
    process.on('SIGINT', async () => {
      console.log('Encerrando ngrok...');
      await ngrok.kill();
      process.exit(0);
    });
  } catch (error) {
    console.error('Erro ao iniciar ngrok:', error);
    process.exit(1);
  }
}

startNgrok(); 