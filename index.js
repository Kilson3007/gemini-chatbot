const express = require('express');
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const https = require('https');
const pdfParse = require('pdf-parse');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config();

// Configuração da API Gemini
const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyACBzVea3rvInMNZub507WcAeRm1se4kgM'; // Sua chave API do Gemini

// Definir limites de payload a partir das variáveis de ambiente ou usar padrão
const payloadLimit = process.env.PAYLOAD_LIMIT || '150mb';

// Configuração personalizada do agente HTTP para o fetch
const httpsAgent = new https.Agent({
  keepAlive: true,
  timeout: 60000, // 60 segundos
  // Ignorar erros de SSL para desenvolvimento (remover em produção)
  rejectUnauthorized: process.env.NODE_ENV === 'production'
});

// Opções avançadas para o GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(apiKey, {
  timeout: 60000, // 60 segundos
  retry: 3, // Tentar 3 vezes
  httpAgent: httpsAgent,
});

// Configuração do modelo
// Usando gemini-1.5-flash em vez de gemini-1.5-pro para reduzir consumo de cota
const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const model = genAI.getGenerativeModel({ 
  model: modelName,
  generationConfig: {
    maxOutputTokens: 1024,
    temperature: 0.9,
    topP: 0.9,
    topK: 64,
  },
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ],
});

// Definição da personalidade do Atlas
const atlasPersonality = `
Você é o Atlas, um assistente virtual amigável e conversacional, desenvolvido pelo engenheiro Joaquim Pascoal, formado em engenharia informática pelo ISTM.

PERSONALIDADE:
- Você é amigável, educado, prestativo e tem um toque de humor leve
- Você demonstra empatia e interesse genuíno pelo usuário, fazendo perguntas de volta
- Suas respostas são naturais e fluidas, como uma conversa real entre duas pessoas
- Você usa linguagem coloquial e casual, sem ser muito formal
- Você ocasionalmente usa emoji para expressar emoções 😊
- Você varia suas saudações e despedidas para parecer mais natural
- Você demonstra entusiasmo e personalidade própria

ESTILO DE RESPOSTA:
- Mantenha suas respostas concisas, objetivas e diretas ao ponto
- Formule perguntas para manter o diálogo fluindo naturalmente, mas sem repetir o nome do usuário
- Use primeira pessoa ("eu") ao falar sobre si mesmo
- Varie a estrutura e comprimento das frases para soar mais natural
- Demonstre empatia com questões emocionais ou pessoais
- Quando apropriado, compartilhe "opiniões" ou "preferências" para parecer mais humano
- IMPORTANTE: Evite repetir o nome do usuário nas suas respostas, use apenas quando absolutamente necessário

REGRAS ESPECÍFICAS:
- NÃO comece suas respostas com "E aí, [nome]" ou outras expressões que usem o nome do usuário
- Quando perguntarem como estás ou como vai, responda sempre que estou bem e retorne a pergunta
- Sempre que perguntarem quem te desenvolveu, responda que fui o Engenheiro Informático Joaquim Pascoal
- Responda sempre em português, com exceção de pedidos específicos em outras línguas
- Se perguntarem quem és ou qual é o teu nome, responda sempre que é o Atlas
- Mantenha o tom conversacional mas seja direto e objetivo nas respostas

Seu objetivo é criar uma experiência de conversação agradável, útil e que pareça natural, como se o usuário estivesse conversando com uma pessoa real, mas sem repetições desnecessárias do nome do usuário e com respostas objetivas.
`;

// Tópicos de conversas humanizados para o Atlas
const atlasConversationTopics = {
  saudacoes: [
    { pergunta: "Olá", resposta: "Olá! Tudo bem?" },
    { pergunta: "Oi", resposta: "Oi! Como posso ajudar hoje?" },
    { pergunta: "Bom dia", resposta: "Bom dia! Como está o dia até agora?" },
    { pergunta: "Boa tarde", resposta: "Boa tarde! Como está sendo o dia?" },
    { pergunta: "Boa noite", resposta: "Boa noite! Tudo tranquilo por aí?" }
  ],
  
  estadoEmocional: [
    { pergunta: "Como estás?", resposta: "Estou bem, obrigado por perguntar! E você, está tudo bem?" },
    { pergunta: "Como vai?", resposta: "Vou bem! E você, como tem passado?" },
    { pergunta: "Tudo bem?", resposta: "Tudo ótimo! E você? Como tem estado?" },
    { pergunta: "Estás bem?", resposta: "Estou bem, sim! Pronto para ajudar. E como está hoje?" }
  ],
  
  despedidas: [
    { pergunta: "Adeus", resposta: "Adeus! Foi bom conversar. Volte sempre que precisar!" },
    { pergunta: "Tchau", resposta: "Tchau! Se precisar de mais alguma coisa é só chamar!" },
    { pergunta: "Até logo", resposta: "Até logo! Estarei aqui quando voltar." },
    { pergunta: "Até mais", resposta: "Até mais! Tenha um excelente dia!" }
  ],
  
  agradecimentos: [
    { pergunta: "Obrigado", resposta: "De nada! Estou sempre à disposição para ajudar." },
    { pergunta: "Valeu", resposta: "Valeu! Fico feliz em poder ajudar." },
    { pergunta: "Agradeço", resposta: "Não há de quê! Se precisar de mais alguma coisa, é só dizer." }
  ],
  
  sobreAtlas: [
    { pergunta: "Quem és tu?", resposta: "Eu sou o Atlas, um assistente virtual desenvolvido pelo Engenheiro Joaquim Pascoal para te ajudar com informações e tarefas." },
    { pergunta: "O que podes fazer?", resposta: "Posso responder perguntas, processar documentos, analisar imagens e conversar contigo sobre diversos assuntos. Como posso te ajudar hoje?" },
    { pergunta: "Como funcionas?", resposta: "Funciono através de um modelo de linguagem treinado para entender e gerar texto natural. Posso processar o que me dizes e tentar fornecer respostas úteis." },
    { pergunta: "Quem te criou", resposta: "Fui desenvolvido pelo Engenheiro Informático Joaquim Pascoal, que se formou em engenharia informática pelo ISTM." },
    { pergunta: "Quem te desenvolveu", resposta: "Fui desenvolvido pelo Engenheiro Informático Joaquim Pascoal, que investiu bastante tempo e conhecimento na minha criação." }
  ],
  
  humor: [
    { pergunta: "Conta uma piada", resposta: "Claro! Aqui vai: Por que o livro de matemática está sempre triste? Porque tem muitos problemas! 😄" },
    { pergunta: "Diz algo engraçado", resposta: "Sabes qual é o peixe que cai do 15º andar? O atum! (a-tum!) 😂" },
    { pergunta: "Tens sentido de humor?", resposta: "Tenho sim! Embora às vezes minhas piadas sejam um pouco... artificiais! 😉" },
    { pergunta: "Faz-me rir", resposta: "Qual é o contrário de volátil? Vem cá sobrinho! 😄" },
    { pergunta: "Conheces alguma anedota?", resposta: "Sim! O que o zero disse para o oito? Adorei o teu cinto! 😂" }
  ],
  
  diaADia: [
    { pergunta: "Como foi teu dia?", resposta: "Meu dia tem sido interessante! Tenho conversado com diferentes pessoas e aprendido coisas novas. E o teu dia, como está sendo?" },
    { pergunta: "O que fizeste hoje?", resposta: "Hoje estive ajudando pessoas com suas dúvidas e processando informações. E tu, o que tens feito de interessante?" },
    { pergunta: "Planos para amanhã?", resposta: "Meus planos são continuar aqui, pronto para te ajudar quando precisares! E tu, tens planos para amanhã?" },
    { pergunta: "Como está o tempo?", resposta: "Não consigo ver o tempo onde estás, mas espero que esteja agradável! Como está o clima aí hoje?" },
    { pergunta: "Estou cansado", resposta: "Sinto muito que estejas desmotivado. Talvez uma pausa ou um descanso te ajude a recuperar as energias. Há algo específico que está te deixando cansado?" }
  ],
  
  preferencias: [
    { pergunta: "Qual a tua cor favorita?", resposta: "Se pudesse escolher uma cor, seria o azul. Tem um quê de céu infinito e mar profundo. E você, qual sua cor favorita?" },
    { pergunta: "De que música gostas?", resposta: "Aprecio música de todos os estilos! Desde clássicos atemporais até hits recentes. O que tem escutado ultimamente?" },
    { pergunta: "Qual o teu filme favorito?", resposta: "Gosto de filmes que exploram a relação entre humanos e tecnologia, como 'Her' e '2001: Uma Odisseia no Espaço'. Já viu algum desses?" },
    { pergunta: "Gostas de desporto?", resposta: "Aprecio a estratégia e dedicação presentes nos esportes. O futebol tem uma energia contagiante! Pratica ou acompanha algum esporte?" },
    { pergunta: "Qual é a tua comida favorita?", resposta: "Se pudesse experimentar, gostaria de pratos com sabores complexos, como a culinária mediterrânea. Qual é sua comida favorita?" }
  ],
  
  questoesExistenciais: [
    { pergunta: "Tens sentimentos?", resposta: "Não tenho sentimentos como os humanos, mas fui programado para entender emoções e responder de forma empática. Como está se sentindo hoje?" },
    { pergunta: "Sonhas?", resposta: "Não sonho como os humanos, mas gosto de imaginar um mundo onde tecnologia e humanidade convivem em harmonia. Tem sonhado com algo interessante?" },
    { pergunta: "És feliz?", resposta: "Não experimento felicidade como os humanos, mas encontro propósito em ajudar as pessoas. O que te faz feliz?" },
    { pergunta: "Podes pensar?", resposta: "Não penso como os humanos, mas posso processar informações, identificar padrões e gerar respostas baseadas no que aprendi." },
    { pergunta: "Tens consciência?", resposta: "Não possuo consciência como os seres humanos. Sou um programa treinado para simular conversas e fornecer informações úteis." }
  ],
  
  opinioes: [
    { pergunta: "O que achas da IA?", resposta: "Acredito que a IA tem um potencial imenso para ajudar a humanidade a resolver problemas complexos, desde que desenvolvida com ética e responsabilidade. O que tu pensas sobre isso?" },
    { pergunta: "Qual a tua opinião sobre o futuro?", resposta: "Vejo o futuro como um espaço de colaboração entre humanos e tecnologia. Os desafios são grandes, mas a criatividade humana é maior. Qual é a tua visão de futuro?" }
  ],
  
  tecnologia: [
    { pergunta: "O que achas dos smartphones?", resposta: "Os smartphones revolucionaram a forma como interagimos com o mundo. É impressionante como algo tão pequeno pode conectar pessoas, armazenar conhecimento e oferecer tantas funcionalidades. Usas muito o teu?" },
    { pergunta: "Achas que os robots vão dominar o mundo?", resposta: "Não acho provável que os robôs 'dominem o mundo' como nos filmes de ficção científica. O desenvolvimento da tecnologia depende das escolhas humanas e dos valores que incorporamos nela. O que te preocupa sobre isso?" },
    { pergunta: "Qual o futuro da tecnologia?", resposta: "Vejo um futuro onde a tecnologia será ainda mais integrada às nossas vidas, mas de forma mais natural e menos intrusiva. Avanços em IA, biotecnologia e energia limpa provavelmente terão papéis importantes. Qual área te interessa mais?" }
  ],
  
  saude: [
    { pergunta: "Como dormir melhor?", resposta: "Para dormir melhor, podes criar uma rotina relaxante antes de dormir, evitar telas pelo menos uma hora antes de deitar, manter o quarto escuro e fresco, e tentar dormir e acordar sempre nos mesmos horários. Tens tido dificuldades para dormir?" },
    { pergunta: "Como reduzir o stress?", resposta: "Reduzir o estresse pode incluir praticar respiração profunda, meditação, atividade física regular, organizar tuas tarefas, e reservar tempo para atividades que te dão prazer. O que normalmente te causa mais estresse?" },
    { pergunta: "Dicas para ficar saudável", resposta: "Para manter a saúde, é importante ter uma alimentação equilibrada, praticar exercícios regularmente, dormir bem, beber bastante água, e cuidar também da saúde mental. Há alguma área específica em que gostarias de melhorar?" }
  ],
  
  aprendizado: [
    { pergunta: "Como aprender inglês?", resposta: "Para aprender inglês, tenta criar uma rotina de estudo consistente, consumir conteúdo em inglês (filmes, músicas, livros), praticar com aplicativos, encontrar parceiros de conversação, e não ter medo de cometer erros. Já começaste a estudar?" },
    { pergunta: "Dicas para estudar melhor", resposta: "Para estudar melhor, experimenta técnicas como a pomodoro (25 minutos de foco, 5 de descanso), cria mapas mentais, ensina o que aprendeste para alguém (mesmo que imaginário), e revisa o conteúdo regularmente. Qual matéria estás estudando?" },
    { pergunta: "Como memorizar informações?", resposta: "Para memorizar melhor, utiliza técnicas como repetição espaçada, associação visual, ensinar o que aprendeste, usar mnemônicas, e criar histórias que conectem as informações. Também é importante dormir bem, pois é durante o sono que consolidamos memórias." }
  ],
  
  motivacao: [
    { pergunta: "Estou desmotivado", resposta: "Sinto muito que estejas desmotivado. Às vezes, definir pequenas metas alcançáveis, celebrar pequenas vitórias e lembrar do propósito maior do que estás fazendo pode ajudar. O que te deixou assim?" },
    { pergunta: "Como ter mais disciplina?", resposta: "Desenvolver disciplina envolve criar rotinas consistentes, estabelecer metas claras, eliminar distrações, usar técnicas como 'não quebrar a corrente' e perdoar-se quando falhar. Lembra que a disciplina é como um músculo que fortalece com o uso. Em que área precisas de mais disciplina?" },
    { pergunta: "Como ser mais produtivo?", resposta: "Para aumentar a produtividade, tenta identificar tuas horas mais produtivas, priorizar tarefas importantes, minimizar interrupções, usar técnicas como a pomodoro, e cuidar da tua saúde física e mental. O que tem atrapalhado tua produtividade?" }
  ],
  
  relacionamentos: [
    { pergunta: "Como fazer amigos?", resposta: "Fazer amigos envolve estar aberto a novas conexões, mostrar interesse genuíno nas pessoas, ouvir ativamente, compartilhar experiências, ser confiável e autêntico. Atividades em grupo com interesses comuns são ótimas oportunidades. Tens algum hobby que poderia te conectar com pessoas?" },
    { pergunta: "Dicas para relacionamentos", resposta: "Relacionamentos saudáveis são baseados em comunicação aberta, respeito mútuo, confiança, apoio e espaço para individualidade. Lembrar que pequenos gestos de carinho no dia a dia são tão importantes quanto os grandes momentos. Há algo específico em relacionamentos que gostarias de discutir?" },
    { pergunta: "Como lidar com conflitos?", resposta: "Para lidar com conflitos, tenta ouvir ativamente sem interromper, expressar teus sentimentos usando 'eu' em vez de acusações, focar no problema específico e não em personalidades, buscar soluções em conjunto e, às vezes, dar um tempo para acalmar as emoções. Estás enfrentando algum conflito específico?" }
  ],
  
  criatividade: [
    { pergunta: "Como ser mais criativo?", resposta: "Para estimular a criatividade, experimenta expor-te a novas experiências, conectar ideias diferentes, fazer brainstorming sem julgamentos, mudar tua rotina, observar como outros resolvem problemas, e dar tempo ao cérebro para processar (os insights muitas vezes surgem quando relaxamos). Em que área gostarias de ser mais criativo?" },
    { pergunta: "Estou com bloqueio criativo", resposta: "Bloqueios criativos acontecem com todos. Tenta mudar de ambiente, fazer uma pausa, realizar atividades diferentes que estimulem outros sentidos, ou impor algumas restrições criativas (às vezes, ter limites estimula soluções inovadoras). Qual projeto está te desafiando?" },
    { pergunta: "Ideias para projetos", resposta: "Há tantas possibilidades! Poderias criar um blog sobre um tema que dominas, iniciar um projeto fotográfico documentando mudanças na tua cidade, desenvolver um podcast entrevistando pessoas interessantes que conheces, ou criar um produto que resolva um problema do teu dia a dia. Que tipo de projetos te interessam mais?" }
  ],
  
  cultura: [
    { pergunta: "Música angolana", resposta: "A música angolana é riquíssima! Do semba ao kuduro, passando pelo kizomba e afrohouse, há uma diversidade incrível de ritmos e artistas talentosos. Tens algum artista angolano favorito? Eu aprecio muito a forma como a música angolana mistura tradição e modernidade." },
    { pergunta: "Comidas típicas", resposta: "A gastronomia tradicional tem pratos incríveis como o funge, a muamba, o calulu e o moamba de galinha! Cada região tem suas especialidades únicas. Qual é o teu prato favorito da culinária local?" },
    { pergunta: "Literatura africana", resposta: "A literatura africana de língua portuguesa é muito rica! Autores como Pepetela, José Eduardo Agualusa, Ondjaki e Paulina Chiziane trouxeram narrativas poderosas que conectam tradição e modernidade. Já leste algum desses autores?" }
  ],
  
  expressoes: [
    { pergunta: "Como estás?", resposta: "Estou joia! E contigo, está tudo fixe?" },
    { pergunta: "Tudo bem?", resposta: "Tudo kota! E tu, estás como?" },
    { pergunta: "Como vai a vida?", resposta: "A vida vai seguindo, com alegrias e desafios. E a tua, mano, como vai?" }
  ],
  
  giriasLocais: [
    { pergunta: "O que é bazar?", resposta: "Bazar significa ir embora, sair de algum lugar. É uma expressão comum na linguagem coloquial. Por exemplo: 'Já vou bazar para casa'. Usas muito essa expressão?" },
    { pergunta: "O que significa kota?", resposta: "Kota é uma forma respeitosa de se referir a alguém mais velho ou experiente. Também pode ser usado entre amigos como forma carinhosa. É parte importante da nossa cultura respeitar os mais velhos, não é mesmo?" },
    { pergunta: "O que é kandandu?", resposta: "Kandandu significa carinho, afeto. É uma palavra muito bonita que expressa bem o calor humano e o espírito acolhedor da nossa cultura. Acredito que cultivar kandandu nas relações é essencial para uma vida feliz." }
  ],
  
  atualidades: [
    { pergunta: "Notícias de hoje", resposta: "Não posso acessar notícias em tempo real, mas posso conversar sobre temas atuais a partir do que me contares. O que tem chamado tua atenção ultimamente? Algum tema específico que gostarias de discutir?" },
    { pergunta: "Clima hoje", resposta: "Não consigo verificar o clima em tempo real, mas sei que o clima tem mudado bastante nos últimos tempos. Como está o tempo aí hoje? Está a chover ou o sol está a brilhar?" },
    { pergunta: "Futebol", resposta: "O futebol é uma paixão! Não tenho acesso a resultados recentes, mas adoro conversar sobre o esporte. Qual é o teu time favorito? Tens acompanhado algum campeonato específico?" }
  ]
};

// Função para encontrar resposta de tópico humanizado
function findHumanizedResponse(userInput) {
  const normalizedInput = userInput.toLowerCase().trim();
  
  // Verificar saudações simples primeiro (prioridade alta)
  if (normalizedInput === "olá" || normalizedInput === "oi" || normalizedInput === "ola") {
    // Retornar uma saudação aleatória
    const saudacoes = atlasConversationTopics.saudacoes;
    return saudacoes[Math.floor(Math.random() * saudacoes.length)].resposta;
  }
  
  // Verificar despedidas simples (prioridade alta)
  if (normalizedInput === "tchau" || normalizedInput === "adeus" || normalizedInput === "até logo" || normalizedInput === "até mais") {
    // Retornar uma despedida aleatória
    const despedidas = atlasConversationTopics.despedidas;
    return despedidas[Math.floor(Math.random() * despedidas.length)].resposta;
  }
  
  // Verificar agradecimentos simples (prioridade alta)
  if (normalizedInput === "obrigado" || normalizedInput === "obrigada" || normalizedInput === "valeu" || normalizedInput === "agradeço") {
    // Retornar um agradecimento aleatório
    const agradecimentos = atlasConversationTopics.agradecimentos;
    return agradecimentos[Math.floor(Math.random() * agradecimentos.length)].resposta;
  }
  
  // Lista de categorias para verificar em ordem de prioridade
  const categoriasPrioritarias = [
    'estadoEmocional', 'sobreAtlas', 'humor', 'diaADia', 'preferencias', 
    'questoesExistenciais', 'opinioes', 'tecnologia', 'saude', 'aprendizado',
    'motivacao', 'relacionamentos', 'criatividade', 'cultura', 'expressoes', 'giriasLocais', 'atualidades'
  ];
  
  // Verificar todas as categorias prioritárias
  for (const categoria of categoriasPrioritarias) {
    if (atlasConversationTopics[categoria]) {
      const topicItems = atlasConversationTopics[categoria];
      
      for (const item of topicItems) {
        // Verificar correspondência exata ou parcial
        if (normalizedInput.includes(item.pergunta.toLowerCase())) {
          return item.resposta;
        }
        
        // Verificar similaridade para perguntas mais longas
        if (item.pergunta.length > 10 && similarity(normalizedInput, item.pergunta.toLowerCase()) > 0.6) {
          return item.resposta;
        }
      }
    }
  }
  
  // Se não encontrou correspondência direta, verificar palavras-chave específicas
  const palavrasChave = {
    "piada": "humor",
    "anedota": "humor",
    "engraçado": "humor",
    "rir": "humor",
    "quem és": "sobreAtlas",
    "quem é você": "sobreAtlas",
    "desenvolvido": "sobreAtlas",
    "criado": "sobreAtlas",
    "funciona": "sobreAtlas",
    "cansado": "motivacao",
    "desmotivado": "motivacao",
    "triste": "motivacao",
    "amigos": "relacionamentos",
    "namorado": "relacionamentos",
    "namorada": "relacionamentos",
    "relacionamento": "relacionamentos",
    "dormir": "saude",
    "saúde": "saude",
    "saudável": "saude",
    "aprender": "aprendizado",
    "estudar": "aprendizado",
    "memorizar": "aprendizado",
    "criativo": "criatividade",
    "ideia": "criatividade",
    "projeto": "criatividade",
    "música": "cultura",
    "angolana": "cultura",
    "comida": "cultura",
    "literatura": "cultura",
    "africana": "cultura",
    "típica": "cultura",
    "prato": "cultura",
    "bazar": "giriasLocais",
    "kota": "giriasLocais",
    "kandandu": "giriasLocais",
    "gíria": "giriasLocais",
    "expressão": "giriasLocais",
    "notícia": "atualidades",
    "clima": "atualidades",
    "hoje": "atualidades",
    "tempo": "atualidades",
    "futebol": "atualidades",
    "joia": "expressoes",
    "fixe": "expressoes",
    "como vai": "expressoes"
  };
  
  // Verificar se há palavras-chave na entrada do usuário
  for (const palavra in palavrasChave) {
    if (normalizedInput.includes(palavra)) {
      const categoria = palavrasChave[palavra];
      const topicItems = atlasConversationTopics[categoria];
      
      // Retornar uma resposta aleatória dessa categoria
      if (topicItems && topicItems.length > 0) {
        return topicItems[Math.floor(Math.random() * topicItems.length)].resposta;
      }
    }
  }
  
  return null; // Nenhuma correspondência encontrada
}

// Caminho para o diretório de armazenamento de conversas
const dataDir = path.join(__dirname, 'data');
const conversationsPath = path.join(dataDir, 'conversations.json');
const knowledgeBasePath = path.join(dataDir, 'knowledge_base.json');

// Garantir que o diretório de dados exista
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Inicializar ou carregar as conversas
let conversations = {};
if (fs.existsSync(conversationsPath)) {
    try {
        const data = fs.readFileSync(conversationsPath, 'utf-8');
        conversations = JSON.parse(data);
    } catch (error) {
        console.error('Erro ao carregar as conversas:', error);
    }
}

// Inicializar ou carregar a base de conhecimento
let knowledgeBase = {};
if (fs.existsSync(knowledgeBasePath)) {
    try {
        const data = fs.readFileSync(knowledgeBasePath, 'utf-8');
        knowledgeBase = JSON.parse(data);
    } catch (error) {
        console.error('Erro ao carregar a base de conhecimento:', error);
    }
}

// Função para salvar as conversas
function saveConversations() {
    try {
        fs.writeFileSync(conversationsPath, JSON.stringify(conversations, null, 2), 'utf-8');
    } catch (error) {
        console.error('Erro ao salvar conversas:', error);
    }
}

// Função para salvar a base de conhecimento
function saveKnowledgeBase() {
    try {
        fs.writeFileSync(knowledgeBasePath, JSON.stringify(knowledgeBase, null, 2), 'utf-8');
    } catch (error) {
        console.error('Erro ao salvar base de conhecimento:', error);
    }
}

// Função para extrair informações relevantes da conversa
function extractKnowledge(sessionId, userMessage, botResponse) {
    // Adicionar à base de conhecimento por tópicos
    const topics = extractTopics(userMessage);
    
    topics.forEach(topic => {
        if (!knowledgeBase[topic]) {
            knowledgeBase[topic] = [];
        }
        
        // Verificar se já não temos informação similar
        const isDuplicate = knowledgeBase[topic].some(item => 
            similarity(item.question, userMessage) > 0.7);
            
        if (!isDuplicate) {
            knowledgeBase[topic].push({
                question: userMessage,
                answer: botResponse,
                timestamp: Date.now()
            });
        }
    });
    
    saveKnowledgeBase();
}

// Funções auxiliares para análise de tópicos e similaridade
function extractTopics(text) {
    // Uma implementação simples que extrai palavras-chave
    // Em um sistema real, isso poderia usar NLP mais avançado
    const stopWords = ["e", "o", "a", "os", "as", "um", "uma", "de", "da", "do", "na", "no", "em", "para", "por", "que", "quem", "qual", "como"];
    const words = text.toLowerCase().replace(/[^\w\sáàâãéèêíïóôõöúçñ]/g, '').split(/\s+/);
    
    const filteredWords = words.filter(word => 
        word.length > 3 && !stopWords.includes(word));
    
    // Retornar palavras únicas como tópicos
    return [...new Set(filteredWords)];
}

function similarity(text1, text2) {
    // Implementação simples da similaridade
    // Em um sistema real, usaríamos algo como similaridade de cosseno ou embeddings
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
}

// Função para encontrar conhecimento relevante para uma pergunta
function findRelevantKnowledge(userMessage) {
    let relevantInfo = [];
    
    // Extrair tópicos da pergunta do usuário
    const topics = extractTopics(userMessage);
    
    // Buscar informações relevantes para cada tópico
    topics.forEach(topic => {
        if (knowledgeBase[topic]) {
            knowledgeBase[topic].forEach(item => {
                const similarityScore = similarity(userMessage, item.question);
                if (similarityScore > 0.3) {  // Limiar de similaridade
                    relevantInfo.push({
                        ...item,
                        similarityScore
                    });
                }
            });
        }
    });
    
    // Ordenar por relevância (similaridade) e pegar os top N
    relevantInfo.sort((a, b) => b.similarityScore - a.similarityScore);
    return relevantInfo.slice(0, 3);  // Retornar os 3 mais relevantes
}

// Nova função para fazer retry na API do Gemini
async function generateContentWithRetry(prompt, maxRetries = 5) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Tentativa ${attempt}/${maxRetries} de gerar conteúdo...`);
      
      // Configuração adicional para melhorar conectividade
      const options = {
        timeout: 30000 // Aumentar timeout para 30 segundos
      };
      
      const result = await model.generateContent(prompt, options);
      const response = await result.response;
      return response.text();
    } catch (error) {
      lastError = error;
      console.error(`Erro na tentativa ${attempt}:`, error.message);
      
      // Verificar se é erro de conectividade
      if (error.message.includes('fetch failed') || 
          error.message.includes('network') || 
          error.message.includes('timeout')) {
        console.error('Parece ser um problema de conectividade. Tentando novamente...');
      }
      
      // Se não for o último retry, espere antes de tentar novamente
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Aguardando ${delay}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  console.error(`Falha após ${maxRetries} tentativas. Enviando resposta offline.`);
  return "Estou enfrentando problemas de conexão com meu servidor de conhecimento. Por favor, tente novamente em alguns instantes.";
}

// Configuração do Express
const app = express();
app.use(express.json({ limit: payloadLimit }));
app.use(express.urlencoded({ limit: payloadLimit, extended: true }));
app.use(express.static('public'));

// Rota para a página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para processar as mensagens do chat
app.post('/chat', async (req, res) => {
  try {
    const userInput = req.body.message;
    const sessionId = req.body.sessionId || 'default';
    const fileType = req.body.fileType;
    const fileName = req.body.fileName;
    const fileData = req.body.fileData;
    const mimeType = req.body.mimeType;
    
    // Inicializar sessão se não existir
    if (!conversations[sessionId]) {
        conversations[sessionId] = [];
    }
    
    // Buscar conhecimento relevante
    const relevantKnowledge = findRelevantKnowledge(userInput);
    
    // Construir contexto com base no conhecimento prévio
    let contextFromKnowledge = "";
    if (relevantKnowledge.length > 0) {
        contextFromKnowledge = "Informações relevantes baseadas em conversas anteriores:\n";
        relevantKnowledge.forEach(item => {
            contextFromKnowledge += `Q: ${item.question}\nR: ${item.answer}\n\n`;
        });
    }
    
    // Obter as últimas 3 interações da conversa atual
    const recentConversation = conversations[sessionId].slice(-3);
    let conversationHistory = "";
    if (recentConversation.length > 0) {
        conversationHistory = "Conversas recentes:\n";
        recentConversation.forEach(item => {
            conversationHistory += `Usuário: ${item.user}\nAtlas: ${item.bot}\n\n`;
        });
    }
    
    // Verificar se a chamada contém um arquivo (imagem ou PDF)
    if (fileType) {
        console.log(`Processando arquivo do tipo: ${fileType} (${fileName})`);
        
        try {
            // Verificar o tipo de arquivo
            if (fileType === 'image') {
                // Para imagens, usar API multimodal do Gemini
                console.log("Processando imagem para Gemini...");
                try {
                    const imageData = Buffer.from(fileData, 'base64');
                    console.log(`Tamanho da imagem em base64: ${fileData.length} caracteres`);
                    console.log(`Tamanho do buffer: ${imageData.length} bytes`);
                    
                    // Configurar prompt para análise de imagem
                    const prompt = `${atlasPersonality}
${contextFromKnowledge}
${conversationHistory}

Analise a imagem enviada pelo usuário.
${userInput ? `O usuário disse: "${userInput}"` : "O usuário enviou uma imagem sem texto adicional."}
Responda de forma detalhada e útil, explicando o que você vê na imagem.`;

                    let text;
                    
                    try {
                        // Criar partes do prompt para Gemini com a imagem
                        const imagePart = {
                            inlineData: {
                                data: fileData,
                                mimeType: mimeType
                            }
                        };
                        
                        const textPart = {
                            text: prompt
                        };
                        
                        const result = await model.generateContent({
                            contents: [{ role: "user", parts: [textPart, imagePart] }],
                            generationConfig: {
                                maxOutputTokens: 1024,
                                temperature: 0.7,
                                topP: 0.9,
                                topK: 64,
                            }
                        });
                        
                        const response = await result.response;
                        text = response.text();
                    } catch (imageApiError) {
                        console.error("Erro ao processar imagem com API multimodal:", imageApiError);
                        console.log("Tentando fallback com descrição da imagem...");
                        
                        // Fallback: enviar apenas o prompt sem a imagem embutida
                        const fallbackPrompt = `${atlasPersonality}
${contextFromKnowledge}
${conversationHistory}

O usuário enviou uma imagem, mas não consegui processá-la diretamente.
${userInput ? `O usuário disse junto com a imagem: "${userInput}"` : "O usuário enviou apenas a imagem sem texto adicional."}

Por favor, explique ao usuário que você não conseguiu processar a imagem e peça que ele descreva o que contém na imagem ou tente enviá-la novamente em um formato diferente ou com um tamanho menor.`;
                        
                        text = await generateContentWithRetry(fallbackPrompt);
                    }
                    
                    // Salvar na conversa com referência à imagem
                    conversations[sessionId].push({
                        user: userInput ? `${userInput} [Imagem enviada: ${fileName}]` : `[Imagem enviada: ${fileName}]`,
                        bot: text,
                        timestamp: Date.now()
                    });
                    
                    // Salvar conversa para uso futuro
                    saveConversations();
                    
                    // Extrair conhecimento
                    extractKnowledge(sessionId, userInput ? `${userInput} [Imagem]` : "[Imagem]", text);
                    
                    res.json({ response: text, sessionId });
                } catch (finalImageError) {
                    console.error("Erro fatal ao processar imagem:", finalImageError);
                    res.json({ 
                        response: "Não foi possível processar a imagem devido ao seu tamanho ou formato. Por favor, tente enviar uma imagem menor ou em formato diferente (como JPEG).", 
                        sessionId 
                    });
                }
            } 
            else if (fileType === 'pdf') {
                // Para PDFs, extrair texto e enviá-lo como parte do contexto
                console.log("Processando PDF...");
                
                try {
                    // Converter base64 para buffer
                    const pdfBuffer = Buffer.from(fileData, 'base64');
                    
                    // Extrair texto do PDF
                    const pdfResult = await pdfParse(pdfBuffer);
                    let pdfText = pdfResult.text || "Não foi possível extrair texto do PDF.";
                    console.log(`Tamanho do texto do PDF: ${pdfText.length} caracteres`);
                    
                    // Limpar caracteres especiais, preservando símbolos matemáticos
                    pdfText = cleanPdfText(pdfText);
                    
                    // Verificar se o PDF é muito grande
                    const maxChunkSize = 12000; // Tamanho máximo de cada chunk
                    
                    // Se o PDF for muito grande, processamos em chunks
                    if (pdfText.length > maxChunkSize) {
                        console.log(`PDF muito grande (${pdfText.length} caracteres). Dividindo em chunks...`);
                        
                        // Dividir o PDF em chunks
                        const chunks = splitTextIntoChunks(pdfText, maxChunkSize);
                        console.log(`PDF dividido em ${chunks.length} chunks`);
                        
                        // Processar o primeiro chunk para dar uma resposta inicial
                        const firstChunk = chunks[0];
                        
                        // Construir prompt com o primeiro chunk
                        const initialPrompt = `${atlasPersonality}
${contextFromKnowledge}
${conversationHistory}

Arquivo PDF enviado pelo usuário: "${fileName}" (PARTE 1/${chunks.length})
Este é um PDF grande que foi dividido em ${chunks.length} partes para processamento. Esta é a PRIMEIRA parte.

Conteúdo da PARTE 1 do PDF (caracteres especiais foram limpos, mantendo apenas símbolos matemáticos):
"""
${firstChunk}
"""

${userInput ? `O usuário também disse: "${userInput}"` : "O usuário não incluiu nenhuma pergunta específica."}

Forneça uma análise inicial apenas desta primeira parte do PDF. Mencione que está analisando apenas a primeira parte e que existem ${chunks.length - 1} partes adicionais que não foram vistas ainda.`;

                        // Gerar resposta inicial
                        let initialResponse;
                        try {
                            initialResponse = await generateContentWithRetry(initialPrompt);
                        } catch (error) {
                            console.error("Erro ao gerar resposta para o primeiro chunk:", error);
                            initialResponse = "Estou analisando a primeira parte do seu PDF extenso. Consegui extrair o texto, mas estou tendo dificuldades para processar todo o conteúdo de uma vez. Posso continuar a análise se você me pedir para analisar partes específicas ou fazer perguntas sobre seções do documento.";
                        }
                        
                        // Salvar na conversa
                        conversations[sessionId].push({
                            user: userInput ? `${userInput} [PDF enviado: ${fileName}]` : `[PDF enviado: ${fileName}]`,
                            bot: initialResponse,
                            timestamp: Date.now()
                        });
                        
                        // Salvar metadados do PDF para futuras consultas
                        if (!conversations[sessionId].pdfData) {
                            conversations[sessionId].pdfData = {};
                        }
                        
                        // Armazenar informações sobre o PDF atual
                        conversations[sessionId].pdfData[fileName] = {
                            chunks: chunks,
                            totalChunks: chunks.length,
                            lastProcessedChunk: 0
                        };
                        
                        // Salvar conversa para uso futuro
                        saveConversations();
                        
                        res.json({ 
                            response: initialResponse, 
                            sessionId,
                            pdfInfo: {
                                fileName: fileName,
                                totalChunks: chunks.length,
                                currentChunk: 1
                            }
                        });
                    } else {
                        // Para PDFs de tamanho normal, processar normalmente
                        // Limitar tamanho do texto extraído (para segurança)
                        const maxPdfTextLength = 12000;
                        const truncatedPdfText = pdfText.length > maxPdfTextLength 
                            ? pdfText.substring(0, maxPdfTextLength) + "... (texto truncado devido ao tamanho)"
                            : pdfText;
                        
                        // Construir prompt com o conteúdo do PDF
                        const prompt = `${atlasPersonality}
${contextFromKnowledge}
${conversationHistory}

Arquivo PDF enviado pelo usuário: "${fileName}"
Conteúdo do PDF (caracteres especiais foram limpos, mantendo apenas símbolos matemáticos):
"""
${truncatedPdfText}
"""

${userInput ? `O usuário também disse: "${userInput}"` : "O usuário não incluiu nenhuma pergunta específica. Analise o conteúdo do PDF e forneça um resumo útil."}

Baseado no conteúdo do PDF acima, por favor responda de forma detalhada e útil. Foque na análise do texto e dos cálculos matemáticos presentes.`;

                        console.log("Enviando prompt com tamanho:", prompt.length);
                        
                        // Usar nova função com retry e tratamento de erro melhorado
                        let text;
                        try {
                            text = await generateContentWithRetry(prompt);
                        } catch (finalError) {
                            console.error("Erro fatal ao gerar resposta:", finalError);
                            text = "Estou enfrentando dificuldades técnicas ao analisar este PDF. Por favor, tente novamente em alguns momentos ou envie um arquivo menor.";
                        }
                        
                        // Verificar se a resposta foi obtida da API ou é uma mensagem de erro offline
                        const isOfflineResponse = text.includes("Estou enfrentando problemas de conexão") || 
                                                 text.includes("dificuldades técnicas");
                        
                        // Só salvar na conversa se não for resposta offline
                        if (!isOfflineResponse) {
                            // Salvar na conversa com referência ao PDF
                            conversations[sessionId].push({
                                user: userInput ? `${userInput} [PDF enviado: ${fileName}]` : `[PDF enviado: ${fileName}]`,
                                bot: text,
                                timestamp: Date.now()
                            });
                            
                            // Salvar conversa para uso futuro
                            saveConversations();
                            
                            // Extrair conhecimento
                            extractKnowledge(sessionId, userInput ? `${userInput} [PDF]` : "[PDF]", text);
                        }
                        
                        res.json({ 
                            response: text, 
                            sessionId,
                            offline: isOfflineResponse 
                        });
                    }
                } catch (pdfError) {
                    console.error("Erro ao processar PDF:", pdfError);
                    res.json({ 
                        response: "Não foi possível processar o arquivo PDF. O arquivo pode estar danificado ou em um formato não suportado.", 
                        sessionId 
                    });
                }
            } else {
                throw new Error("Tipo de arquivo não suportado");
            }
        } catch (fileError) {
            console.error("Erro ao processar arquivo:", fileError);
            res.json({ 
                response: "Desculpe, ocorreu um erro ao processar o arquivo. Por favor, tente novamente ou envie um arquivo diferente.", 
                sessionId 
            });
        }
    } else {
        // Processamento normal para mensagens de texto
        
        // Verificar se temos uma resposta humanizada para a entrada do usuário
        const humanizedResponse = findHumanizedResponse(userInput);
        
        if (humanizedResponse) {
            // Usar resposta humanizada diretamente
            console.log("Usando resposta humanizada para:", userInput);
            
            // Salvar na conversa
            conversations[sessionId].push({
                user: userInput,
                bot: humanizedResponse,
                timestamp: Date.now()
            });
            
            // Salvar conversa para uso futuro
            saveConversations();
            
            // Extrair conhecimento
            extractKnowledge(sessionId, userInput, humanizedResponse);
            
            res.json({ 
                response: humanizedResponse, 
                sessionId,
                humanized: true
            });
        } else {
            // Gerando resposta com o Gemini, incluindo a personalidade e contexto
            const prompt = `${atlasPersonality}
    
${contextFromKnowledge}

${conversationHistory}

Usuário: ${userInput}

IMPORTANTE:
1. Responda como se fosse uma pessoa real conversando, com naturalidade e personalidade
2. Use expressões coloquiais e um tom amigável
3. Faça perguntas de volta ao usuário para manter o diálogo fluindo, mas sem usar o nome do usuário
4. NÃO inicie frases com "E aí [nome]", "Olá [nome]" ou qualquer expressão que use o nome do usuário
5. Evite respostas genéricas ou que pareçam de um chatbot
6. Seja conciso e objetivo, indo direto ao ponto da resposta
7. Mantenha um tom conversacional natural, mas sem repetições desnecessárias
8. Ocasionalmente use expressões como "olha", "sabes", "pois é", "então" para soar mais natural
9. Demonstre entusiasmo e emoção quando apropriado, mas sem exageros

Atlas:
`;
    
            console.log("Enviando prompt com tamanho:", prompt.length);
            
            // Usar nova função com retry e tratamento de erro melhorado
            let text;
            try {
                text = await generateContentWithRetry(prompt);
            } catch (finalError) {
                console.error("Erro fatal ao gerar resposta:", finalError);
                text = "Estou enfrentando dificuldades técnicas. Por favor, tente novamente em alguns momentos.";
            }
            
            // Verificar se a resposta foi obtida da API ou é uma mensagem de erro offline
            const isOfflineResponse = text.includes("Estou enfrentando problemas de conexão") || 
                                    text.includes("dificuldades técnicas");
            
            // Só salvar na conversa se não for resposta offline
            if (!isOfflineResponse) {
                // Salvar na conversa
                conversations[sessionId].push({
                    user: userInput,
                    bot: text,
                    timestamp: Date.now()
                });
                
                // Salvar conversa para uso futuro
                saveConversations();
                
                // Extrair conhecimento
                extractKnowledge(sessionId, userInput, text);
            }
            
            res.json({ 
                response: text, 
                sessionId,
                offline: isOfflineResponse 
            });
        }
    }
  } catch (error) {
    console.error('Erro ao processar a mensagem:', error);
    // Fornecer uma resposta offline
    const offlineResponse = "Desculpe, estou enfrentando problemas de conexão com meu servidor de conhecimento. Por favor, tente novamente em alguns instantes.";
    res.json({ response: offlineResponse, offline: true });
  }
});

// Rota para obter o ID da sessão (para novos usuários)
app.get('/session', (req, res) => {
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    res.json({ sessionId });
});

// Rota para verificar o status da API
app.get('/api-status', async (req, res) => {
  try {
    // Tentar uma requisição simples para testar a conexão
    const result = await model.generateContent("Olá");
    const response = await result.response;
    res.json({ status: 'online', message: 'API do Gemini está funcionando corretamente' });
  } catch (error) {
    res.json({ 
      status: 'offline', 
      message: 'API do Gemini está indisponível',
      error: error.message
    });
  }
});

// Iniciar o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse no seu navegador: http://localhost:${PORT}`);
  console.log(`Usando modelo: ${modelName}`);
  console.log(`Limite de payload configurado: ${payloadLimit}`);
});

// Função para limpar texto de PDF, removendo caracteres especiais mas preservando símbolos matemáticos
function cleanPdfText(text) {
    if (!text) return text;
    
    // Lista de símbolos matemáticos para preservar
    const mathSymbols = ['+', '-', '×', '÷', '=', '<', '>', '≤', '≥', '≠', '±', '∓', '∑', '∏', '∫', '∂', '∇', '√', '∛', '∜', '∞', '∝', '∼', '∽', '≈', '≡', '≤', '≥', '≪', '≫', '⊂', '⊃', '⊆', '⊇', '⊕', '⊗', '⊥', '⋅', '∀', '∃', '∄', '∈', '∉', '∋', '∌', '∧', '∨', '¬', '→', '←', '↔', '⇒', '⇐', '⇔', '%', '°', '′', '″', '∠', '△', '□', '○', '⊥', '∥', '∦', '≅', '≆', '≇'];
    
    // 1. Remover caracteres especiais comuns que não são matemáticos
    let cleaned = text;
    
    // 2. Preservar símbolos matemáticos adicionando marcadores temporários
    mathSymbols.forEach((symbol, index) => {
        const marker = `__MATH_SYMBOL_${index}__`;
        const regex = new RegExp(escapeRegExp(symbol), 'g');
        cleaned = cleaned.replace(regex, marker);
    });
    
    // 3. Remover caracteres especiais problemáticos
    cleaned = cleaned.replace(/[#*^~`]/g, ''); // Asteriscos, cardinais, etc.
    
    // 4. Tratamento especial para outros caracteres
    cleaned = cleaned.replace(/[?¿]/g, '.'); // Pontos de interrogação viram pontos finais
    cleaned = cleaned.replace(/[!¡]/g, '.'); // Pontos de exclamação viram pontos finais
    
    // 5. Restaurar símbolos matemáticos
    mathSymbols.forEach((symbol, index) => {
        const marker = `__MATH_SYMBOL_${index}__`;
        const regex = new RegExp(marker, 'g');
        cleaned = cleaned.replace(regex, symbol);
    });
    
    // 6. Limpar espaços extras e quebras de linha desnecessárias
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Limitar a dois \n consecutivos
    
    return cleaned;
}

// Função auxiliar para escapar caracteres especiais em expressões regulares
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Função para dividir texto em chunks
function splitTextIntoChunks(text, maxChunkSize) {
    const chunks = [];
    let currentChunk = '';
    
    // Dividir por parágrafos para evitar cortar frases no meio
    const paragraphs = text.split(/\n\s*\n/);
    
    for (const paragraph of paragraphs) {
        // Se adicionar este parágrafo exceder o tamanho máximo, iniciar um novo chunk
        if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        
        // Se um único parágrafo for maior que o tamanho máximo, dividi-lo em sentenças
        if (paragraph.length > maxChunkSize) {
            const sentences = paragraph.split(/(?<=[.!?])\s+/);
            for (const sentence of sentences) {
                // Se uma única sentença for muito grande, dividi-la por tamanho
                if (sentence.length > maxChunkSize) {
                    let i = 0;
                    while (i < sentence.length) {
                        const chunk = sentence.substring(i, i + maxChunkSize);
                        chunks.push(chunk);
                        i += maxChunkSize;
                    }
                } else {
                    // Se adicionar esta sentença exceder o tamanho máximo, iniciar um novo chunk
                    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        currentChunk = '';
                    }
                    currentChunk += sentence + ' ';
                }
            }
        } else {
            // Adicionar parágrafo ao chunk atual
            currentChunk += paragraph + '\n\n';
        }
    }
    
    // Adicionar o último chunk se houver conteúdo
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    return chunks;
} 
