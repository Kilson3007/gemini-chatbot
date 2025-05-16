document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const voiceInputButton = document.getElementById('voice-input-button');
    const autoSpeakToggle = document.getElementById('auto-speak-toggle');
    const realtimeModeToggle = document.getElementById('realtime-mode-toggle');
    
    // Elementos para upload de arquivo
    const fileUpload = document.getElementById('file-upload');
    const fileUploadButton = document.getElementById('file-upload-button');
    const previewContainer = document.getElementById('preview-container');
    const imagePreview = document.getElementById('image-preview');
    const pdfPreview = document.getElementById('pdf-preview');
    const pdfName = document.getElementById('pdf-name');
    const removeFileButton = document.getElementById('remove-file');
    
    // Variável para armazenar o arquivo atual
    let currentFile = null;
    
    // Variáveis para o modo de conversação em tempo real
    let isRealtimeMode = false;
    let lastTranscript = '';
    let pauseTimeout = null;
    let isListening = false;
    
    // Variáveis para controle de status da API
    let isApiOnline = true;
    let networkRetryCount = 0;
    const maxNetworkRetries = 3;
    
    // Gerenciamento de sessão
    let sessionId = localStorage.getItem('atlas_session_id');
    
    // Se não tiver uma sessão, obter uma nova
    if (!sessionId) {
        getNewSession();
    }
    
    // Verificar o status da API na inicialização
    checkApiStatus();
    
    // Variáveis para controle de fala e escuta
    let isBotSpeaking = false;
    let speechEndTimeout = null;
    let ignoreRecognitionUntil = 0;
    // Nova variável para controlar o nível de eco do dispositivo
    let ecoLevel = localStorage.getItem('atlas_eco_level') || 'medium'; // low, medium, high
    
    // Adicionar controle de nível de eco às configurações
    initEcoLevelControl();
    
    // Histórico de reconhecimento para melhorar a coerência
    const recognitionHistory = {
        recentPhrases: [],       // Últimas frases reconhecidas
        maxHistoryLength: 5,     // Número máximo de frases a manter
        frequentWords: {},       // Contagem de palavras frequentes
        
        // Adicionar uma nova frase ao histórico
        addPhrase: function(phrase) {
            if (!phrase || phrase.trim().length === 0) return;
            
            this.recentPhrases.unshift(phrase);
            if (this.recentPhrases.length > this.maxHistoryLength) {
                this.recentPhrases.pop();
            }
            
            // Analisar palavras para contagem de frequência
            const words = phrase.toLowerCase().split(/\s+/);
            words.forEach(word => {
                if (word.length > 2) { // Ignorar palavras muito curtas
                    this.frequentWords[word] = (this.frequentWords[word] || 0) + 1;
                }
            });
        },
        
        // Verificar se uma palavra é frequente nas últimas frases
        isFrequentWord: function(word) {
            const count = this.frequentWords[word.toLowerCase()] || 0;
            return count > 1; // Consideramos frequente se apareceu mais de uma vez
        },
        
        // Verificar se uma frase é similar a alguma recente
        hasSimilarPhrase: function(phrase) {
            return this.recentPhrases.some(p => {
                const similarity = calculateSimilarity(p, phrase);
                return similarity > 0.7; // Limiar de similaridade
            });
        },
        
        // Obter as palavras-chave mais frequentes
        getKeywords: function() {
            return Object.entries(this.frequentWords)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(entry => entry[0]);
        }
    };
    
    // Calcular similaridade entre duas frases (0-1)
    function calculateSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().split(/\s+/));
        const words2 = new Set(text2.toLowerCase().split(/\s+/));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        // Coeficiente de Jaccard
        return intersection.size / union.size;
    }
    
    // Função para analisar semanticamente a frase e melhorar a coerência
    function improveCoherence(text) {
        if (!text || text.trim().length === 0) return text;
        
        // Verificar se é muito similar a alguma frase recente (possível duplicação)
        if (recognitionHistory.hasSimilarPhrase(text)) {
            console.log('Frase similar encontrada no histórico, possível duplicação');
            // Retornamos apenas se for uma frase completa e não muito curta
            if (text.split(/\s+/).length > 3) {
                const mostRecentPhrase = recognitionHistory.recentPhrases[0];
                // Se for muito similar à mais recente, usamos a mais recente
                if (mostRecentPhrase && calculateSimilarity(text, mostRecentPhrase) > 0.8) {
                    return mostRecentPhrase;
                }
            }
        }
        
        // Verificar palavras-chave do contexto da conversa
        const keywords = recognitionHistory.getKeywords();
        
        // Se encontrarmos palavras-chave do contexto, damos mais peso a elas
        if (keywords.length > 0) {
            const words = text.split(/\s+/);
            const enhancedWords = words.map(word => {
                // Se a palavra é similar a uma palavra-chave, substituímos pela palavra-chave
                const matchingKeyword = keywords.find(k => 
                    calculateSimilarity(word.toLowerCase(), k) > 0.8);
                return matchingKeyword || word;
            });
            
            text = enhancedWords.join(' ');
        }
        
        // Adicionar a frase ao histórico depois de processada
        recognitionHistory.addPhrase(text);
        
        return text;
    }
    
    // Função estendida para processar e melhorar texto transcrito
    function improveTranscription(text) {
        if (!text) return text;
        
        // Primeiro aplicamos as correções de palavras, repetições, etc.
        let improved = text;
        
        // Remover repetições de palavras consecutivas (mais agressivo para dispositivos com eco alto)
        if (ecoLevel === 'high') {
            // Para eco alto, remover até três repetições consecutivas
            improved = improved.replace(/\b(\w+)(\s+\1){1,3}\b/gi, '$1');
            // Também repetições parciais (palavras semelhantes)
            improved = improved.replace(/\b(\w{3,})(\w{0,2})\b\s+\b\1(\w{0,2})\b/gi, '$1$2');
        } else {
            // Padrão: remover até duas repetições
            improved = improved.replace(/\b(\w+)(\s+\1){1,2}\b/gi, '$1');
        }
        
        // Segunda passagem para repetições de frases que possam ter permanecido
        improved = improved.replace(/\b(\w+\s+\w+)(\s+\1){1,2}\b/gi, '$1');
        
        // Corrigir pontuação comum (adicionar espaço após vírgulas e pontos)
        improved = improved.replace(/([,.!?])([a-zA-Z])/g, '$1 $2');
        
        // Capitalizar primeira letra de cada frase
        improved = improved.replace(/(^\s*|[.!?]\s+)([a-z])/g, function(match, p1, p2) {
            return p1 + p2.toUpperCase();
        });
        
        // Corrigir espaços múltiplos
        improved = improved.replace(/\s{2,}/g, ' ').trim();
        
        // Corrigir erros comuns do reconhecimento de voz em português
        const commonErrors = {
            // Repetições muito comuns
            'é é': 'é',
            'né né': 'né',
            'tá tá': 'tá',
            'que que': 'que',
            'para para': 'para',
            'como como': 'como',
            'então então': 'então',
            'assim assim': 'assim',
            'mas mas': 'mas',
            'vai vai': 'vai',
            'tem tem': 'tem',
            'foi foi': 'foi',
            'eu eu': 'eu',
            'você você': 'você',
            'não não': 'não',
            'sim sim': 'sim',
            'tu tu': 'tu',
            'ele ele': 'ele',
            'ela ela': 'ela',
            'nós nós': 'nós',
            'a gente a gente': 'a gente',
            
            // Palavras frequentemente confundidas
            'na hora': 'agora',
            'em hora': 'agora',
            'e hora': 'agora',
            'cemitério': 'semelhante',
            'pois é': '',
            'Porque ele': 'Por que ele',
            'cemitério a': 'semelhante a',
            'fala para mim': 'fale para mim',
            'eu queria saber': 'queria saber',
            'manda uma mensagem': 'mandar uma mensagem',
            'enviar uma mensagem': 'enviar uma mensagem',
            'como que eu faço': 'como faço',
            'como é que eu faço': 'como faço',
            'você pode me ajudar': 'pode me ajudar',
            'você pode me explicar': 'pode me explicar',
            'você pode me dizer': 'pode me dizer',
            'por favor me ajuda': 'por favor me ajude',
            
            // Palavras confundidas por eco
            'desculpe culpe': 'desculpe',
            'obrigado gado': 'obrigado',
            'obrigada gada': 'obrigada',
            'tempo po': 'tempo',
            'bom om': 'bom',
            'sim im': 'sim',
            'não ao': 'não',
            'ok ok': 'ok',
            'certo to': 'certo',
            'claro aro': 'claro',
            'entendi di': 'entendi',
            'falou lou': 'falou',
            'valeu leu': 'valeu',
            'beleza za': 'beleza',
            'legal gal': 'legal',
            
            // Palavras inexistentes comuns em português (por erro de eco)
            'tempos pos': 'tempos',
            'coisas sas': 'coisas',
            'pessoas oas': 'pessoas',
            'agora ra': 'agora',
            'problema ma': 'problema', 
            'muito to': 'muito',
            'trabalho lho': 'trabalho',
            'quando do': 'quando',
            'porque que': 'porque',
            
            // Formas coloquiais em português brasileiro
            'tá bom': 'está bom',
            'tô': 'estou',
            'tamo': 'estamos',
            'tá': 'está',
            'vô': 'vou',
            'pro': 'para o',
            'pra': 'para',
            'cê': 'você',
            'ocê': 'você',
            
            // Interjeições que podem ser removidas
            'vixe': '',
            'hm': '',
            'ah': '',
            'eh': '',
            'uh': '',
            'bem': '',
            'tipo': '',
            'tipo assim': '',
            'sabe': '',
            'entende': '',
            'entendeu': ''
        };
        
        // Aplicar correções de erros comuns
        Object.keys(commonErrors).forEach(error => {
            if (commonErrors[error] === '') {
                // Para padrões que queremos remover completamente, incluir possíveis espaços
                const regex = new RegExp('\\s*\\b' + error + '\\b\\s*', 'gi');
                improved = improved.replace(regex, ' ');
            } else {
                const regex = new RegExp('\\b' + error + '\\b', 'gi');
                improved = improved.replace(regex, commonErrors[error]);
            }
        });
        
        // Remover frases de hesitação comuns
        const hesitationPhrases = [
            'deixa eu ver', 'deixa eu pensar', 'como posso dizer', 
            'como é que se diz', 'como que eu digo', 'não sei como dizer',
            'como que é', 'como é que é', 'como se diz'
        ];
        
        hesitationPhrases.forEach(phrase => {
            const regex = new RegExp('\\s*\\b' + phrase + '\\b\\s*', 'gi');
            improved = improved.replace(regex, ' ');
        });
        
        // Remover marcadores de início desnecessários
        improved = improved.replace(/^(olá|ei|hey|oi|bom|atlas|ok)\s+/i, '');
        
        // Transformar frases comuns em português
        improved = improved
            .replace(/^me fala (sobre|como|qual|quando|onde|por que|quem)/i, 'Me fale $1')
            .replace(/^me diz (sobre|como|qual|quando|onde|por que|quem)/i, 'Me diga $1')
            .replace(/^fala (sobre|como|qual|quando|onde|por que|quem)/i, 'Fale $1')
            .replace(/^diz (sobre|como|qual|quando|onde|por que|quem)/i, 'Diga $1');
        
        // Remover "é" desnecessários no início das frases
        improved = improved.replace(/^é\s+/i, '');
        
        // Corrigir espaços antes de remover novamente
        improved = improved.replace(/\s{2,}/g, ' ').trim();
        
        // Remover sílabas e terminações que são comuns em ecos
        if (ecoLevel === 'high' || ecoLevel === 'medium') {
            // Remover repetições silábicas no final das palavras (eco comum)
            improved = improved.replace(/\b(\w+)(\s+\w{1,3})(?=\s|$)/g, (match, word, echo) => {
                // Verificar se o eco é uma parte do final da palavra
                if (word.endsWith(echo.trim())) {
                    return word; // Manter apenas a palavra original
                }
                return match; // Manter como está se não for um eco identificado
            });
        }
        
        // Depois aplicamos as melhorias de coerência baseadas no histórico
        improved = improveCoherence(improved);
        
        return improved;
    }
    
    // Função para verificar o status da API
    async function checkApiStatus() {
        try {
            const response = await fetch('/api-status', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('API status check failed');
            }
            
            const data = await response.json();
            isApiOnline = data.status === 'online';
            
            if (!isApiOnline) {
                showOfflineNotification('O serviço do Gemini está temporariamente indisponível. Algumas respostas podem ser limitadas.', true);
                networkRetryCount = 0;
            } else if (networkRetryCount > 0) {
                // Se estávamos offline antes, mostrar que voltamos online
                showFeedbackMessage('Conexão com o servidor restabelecida!', 'api-status', false);
                networkRetryCount = 0;
            }
            
            return isApiOnline;
        } catch (error) {
            console.error('Erro ao verificar status da API:', error);
            isApiOnline = false;
            showOfflineNotification('Problema de conexão com o servidor. Verifique sua internet.', true);
            return false;
        }
    }
    
    async function getNewSession() {
        try {
            const response = await fetch('/session');
            const data = await response.json();
            sessionId = data.sessionId;
            localStorage.setItem('atlas_session_id', sessionId);
            console.log('Nova sessão criada:', sessionId);
        } catch (error) {
            console.error('Erro ao obter sessão:', error);
            sessionId = 'default-' + Date.now();
            localStorage.setItem('atlas_session_id', sessionId);
        }
    }
    
    // Verificar se o navegador suporta reconhecimento de voz
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    
    // Verificação de dispositivo móvel
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        
        // Configuração do modo de conversação em tempo real
        realtimeModeToggle.addEventListener('change', function() {
            isRealtimeMode = this.checked;
            
            if (isRealtimeMode) {
                // Ativar modo tempo real
                recognition.continuous = true;
                recognition.interimResults = true;
                document.body.classList.add('realtime-mode');
                userInput.placeholder = "Modo conversa ativado - fale naturalmente...";
                
                // Iniciar reconhecimento automaticamente
                startContinuousListening();
            } else {
                // Desativar modo tempo real
                recognition.continuous = false;
                recognition.interimResults = false;
                document.body.classList.remove('realtime-mode');
                userInput.placeholder = "Digite sua mensagem aqui...";
                
                // Parar reconhecimento se estiver ativo
                if (isListening) {
                    recognition.stop();
                    isListening = false;
                }
            }
        });
        
        // Função para iniciar escuta contínua
        function startContinuousListening() {
            // Não iniciar se o bot estiver falando
            if (isBotSpeaking) {
                console.log('Bot está falando, não iniciando reconhecimento');
                return;
            }
            
            // Não iniciar se já estiver ouvindo
            if (isListening) {
                console.log('Já está ouvindo, ignorando chamada para iniciar');
                return;
            }
            
            try {
                console.log('Iniciando reconhecimento contínuo');
                recognition.continuous = isRealtimeMode;
                recognition.interimResults = isRealtimeMode;
                
                recognition.start();
                isListening = true;
                voiceInputButton.classList.add('listening');
                
                // Feedback visual apenas na primeira ativação, não em reinícios automáticos
                if (!document.getElementById('continuous-mode-feedback')) {
                    showFeedbackMessage('Conversação em tempo real ativada', 'continuous-mode-feedback');
                }
            } catch (error) {
                console.error('Erro ao iniciar reconhecimento contínuo:', error);
                isListening = false;
                
                // Se for erro de "already started", precisamos parar e reiniciar
                if (error.message.includes('already started')) {
                    try {
                        recognition.stop();
                        setTimeout(() => {
                            if (isRealtimeMode && realtimeModeToggle.checked) {
                                startContinuousListening();
                            }
                        }, 500);
                    } catch (innerError) {
                        console.error('Erro ao tentar recuperar de "already started":', innerError);
                        showFeedbackMessage('Erro ao iniciar o modo de conversação', 'voice-error', true);
                    }
                } else {
                    showFeedbackMessage('Erro ao iniciar o modo de conversação', 'voice-error', true);
                }
            }
        }
        
        // Função para mostrar mensagens de feedback
        function showFeedbackMessage(message, id, isError = false) {
            // Remover mensagem existente com mesmo ID
            const existingMsg = document.getElementById(id);
            if (existingMsg) existingMsg.remove();
            
            const feedbackMsg = document.createElement('div');
            feedbackMsg.id = id;
            feedbackMsg.textContent = message;
            feedbackMsg.style.position = 'fixed';
            feedbackMsg.style.bottom = '70px';
            feedbackMsg.style.left = '50%';
            feedbackMsg.style.transform = 'translateX(-50%)';
            feedbackMsg.style.backgroundColor = isError ? 'rgba(244, 67, 54, 0.9)' : 'rgba(66, 133, 244, 0.9)';
            feedbackMsg.style.color = 'white';
            feedbackMsg.style.padding = '10px 15px';
            feedbackMsg.style.borderRadius = '20px';
            feedbackMsg.style.zIndex = '1000';
            feedbackMsg.style.maxWidth = '90%';
            feedbackMsg.style.textAlign = 'center';
            document.body.appendChild(feedbackMsg);
            
            // Remover após alguns segundos
            setTimeout(() => {
                if (feedbackMsg.parentNode) {
                    feedbackMsg.parentNode.removeChild(feedbackMsg);
                }
            }, 3000);
        }
        
        // Função para criar div de mensagem provisória
        function createDraftMessageDiv() {
            removeDraftMessage(); // Remove qualquer rascunho existente
            
            const draftMsg = document.createElement('div');
            draftMsg.className = 'message user draft';
            draftMsg.id = 'draft-message';
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            
            draftMsg.appendChild(messageContent);
            chatMessages.appendChild(draftMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return draftMsg;
        }
        
        function removeDraftMessage() {
            const existingDraft = document.getElementById('draft-message');
            if (existingDraft) {
                existingDraft.remove();
            }
        }
        
        // Modificar eventos do reconhecimento de voz para suportar modo contínuo
        recognition.onstart = function() {
            console.log('Reconhecimento de voz iniciado');
            voiceInputButton.classList.add('listening');
            isListening = true;
            
            if (!isRealtimeMode) {
                userInput.placeholder = "Estou ouvindo...";
                
                // Feedback visual extra para dispositivos móveis
                if (isMobile) {
                    document.body.classList.add('listening-active');
                    showFeedbackMessage('Fale agora...', 'voice-feedback');
                }
            }
        };
        
        recognition.onresult = function(event) {
            console.log('Resultado do reconhecimento recebido', event.results);
            
            // Verificar se devemos ignorar este reconhecimento (pode ser eco da voz do bot)
            const now = Date.now();
            if (now < ignoreRecognitionUntil || isBotSpeaking) {
                console.log('Ignorando reconhecimento - possível eco da voz do bot');
                return;
            }
            
            if (isRealtimeMode) {
                // Modo tempo real - processar resultados intermediários e finais
                let finalTranscript = '';
                let interimTranscript = '';
                
                // Processar todos os resultados para pegar textos finais e provisórios
                for (let i = 0; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0].transcript;
                    
                    if (result.isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                // Melhorar a transcrição final
                if (finalTranscript) {
                    finalTranscript = improveTranscription(finalTranscript);
                    lastTranscript = finalTranscript.trim();
                    userInput.value = lastTranscript;
                }
                
                // Melhorar também a transcrição provisória
                if (interimTranscript) {
                    interimTranscript = improveTranscription(interimTranscript);
                    
                    // Criar ou atualizar mensagem de rascunho
                    const draftMsgDiv = document.getElementById('draft-message') || 
                                       createDraftMessageDiv();
                    draftMsgDiv.querySelector('.message-content').textContent = interimTranscript;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else if (lastTranscript) {
                    // Se temos texto final, mostrar no campo e no rascunho
                    const draftMsgDiv = document.getElementById('draft-message');
                    if (draftMsgDiv) {
                        draftMsgDiv.querySelector('.message-content').textContent = lastTranscript;
                    }
                    
                    // Depois de uma pausa, considerar a mensagem como completa
                    clearTimeout(pauseTimeout);
                    pauseTimeout = setTimeout(() => {
                        if (lastTranscript.trim() !== '') {
                            removeDraftMessage();
                            
                            // Guardar o texto antes de enviar, porque o envio limpa o input
                            const textToSend = lastTranscript;
                            userInput.value = textToSend;
                            
                            handleSendMessage();
                            lastTranscript = '';
                        }
                    }, 1500); // Pausa de 1,5 segundos para considerar mensagem completa
                }
            } else {
                // Modo normal - comportamento original
                const transcript = event.results[0][0].transcript;
                
                // Melhorar a transcrição
                const improvedTranscript = improveTranscription(transcript);
                
                userInput.value = improvedTranscript;
                userInput.placeholder = "Digite sua mensagem aqui...";
                voiceInputButton.classList.remove('listening');
                document.body.classList.remove('listening-active');
                
                // Remover o feedback visual
                const feedbackEl = document.getElementById('voice-feedback');
                if (feedbackEl) feedbackEl.remove();
                
                console.log('Texto reconhecido:', transcript);
                console.log('Texto melhorado:', improvedTranscript);
                
                // Enviar automaticamente após reconhecimento de voz
                setTimeout(() => handleSendMessage(), 500);
            }
        };
        
        recognition.onerror = function(event) {
            console.error('Erro no reconhecimento de voz:', event.error);
            
            if (!isRealtimeMode) {
                userInput.placeholder = "Digite sua mensagem aqui...";
                voiceInputButton.classList.remove('listening');
                document.body.classList.remove('listening-active');
                
                // Remover o feedback visual
                const feedbackEl = document.getElementById('voice-feedback');
                if (feedbackEl) feedbackEl.remove();
            }
            
            isListening = false;
            
            // Mensagens de erro mais específicas para depuração
            let errorMessage = '';
            switch (event.error) {
                case 'not-allowed':
                    errorMessage = 'Permissão de microfone negada. Toque no ícone de cadeado no navegador e permita o acesso ao microfone.';
                    break;
                case 'no-speech':
                    errorMessage = 'Nenhuma fala detectada. Por favor, fale mais perto do microfone ou verifique se o volume está adequado.';
                    
                    // No modo contínuo, tentamos reiniciar automaticamente após no-speech
                    if (isRealtimeMode) {
                        setTimeout(() => {
                            if (realtimeModeToggle.checked) {
                                startContinuousListening();
                            }
                        }, 1000);
                    }
                    break;
                case 'network':
                    errorMessage = 'Erro de rede ao processar a fala. Verifique sua conexão.';
                    break;
                case 'aborted':
                    errorMessage = 'Reconhecimento de voz cancelado.';
                    break;
                default:
                    errorMessage = `Erro ao usar o microfone: ${event.error}. Tente usar o teclado.`;
            }
            
            // Mostrar mensagem de erro na tela
            showFeedbackMessage(errorMessage, 'voice-error', true);
            
            console.error('Detalhes do erro:', errorMessage);
        };
        
        recognition.onend = function() {
            console.log('Reconhecimento de voz encerrado');
            isListening = false;
            
            if (isRealtimeMode && realtimeModeToggle.checked) {
                // Em modo contínuo, reiniciar automaticamente após um breve atraso
                // mas apenas se o bot não estiver falando
                if (!isBotSpeaking) {
                    console.log('Tentando reiniciar reconhecimento automático...');
                    
                    // Programar tentativa de reinício com pequeno atraso
                    const restartDelay = 500; // 500ms
                    setTimeout(() => {
                        // Verificar novamente se as condições ainda permitem reinício
                        if (isRealtimeMode && realtimeModeToggle.checked && !isBotSpeaking && !isListening) {
                            try {
                                // Usar startContinuousListening para ter verificações adicionais
                                startContinuousListening();
                            } catch (e) {
                                console.error('Erro ao reiniciar reconhecimento automático:', e);
                                // Se tentamos muito rapidamente, esperar mais
                                setTimeout(() => {
                                    if (isRealtimeMode && realtimeModeToggle.checked && !isListening) {
                                        startContinuousListening();
                                    }
                                }, 1000);
                            }
                        } else {
                            console.log('Condições não permitem reinício automático neste momento');
                        }
                    }, restartDelay);
                } else {
                    console.log('Bot está falando, adiando reinício automático');
                }
            } else {
                // Comportamento normal para modo não-contínuo
                userInput.placeholder = "Digite sua mensagem aqui...";
                voiceInputButton.classList.remove('listening');
                document.body.classList.remove('listening-active');
                
                // Remover o feedback visual
                const feedbackEl = document.getElementById('voice-feedback');
                if (feedbackEl) feedbackEl.remove();
            }
        };
        
        voiceInputButton.addEventListener('click', () => {
            // Se o modo de conversação contínua estiver ativo
            if (isRealtimeMode) {
                // Alternar entre ativar e pausar o reconhecimento
                if (isListening) {
                    // Parar o reconhecimento
                    recognition.stop();
                    isListening = false;
                    voiceInputButton.classList.remove('listening');
                    showFeedbackMessage('Reconhecimento de voz pausado', 'voice-feedback');
                } else {
                    // Reiniciar o reconhecimento
                    startContinuousListening();
                }
                return;
            }
            
            // Código existente para o modo normal
            // Verificar se já está ouvindo
            if (voiceInputButton.classList.contains('listening')) {
                recognition.stop();
                return;
            }
            
            // Em dispositivos móveis, solicitamos permissão explicitamente
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(() => {
                        console.log('Permissão de microfone concedida');
                        // Permissão concedida, inicie o reconhecimento
                        try {
                            recognition.start();
                            isListening = true;
                        } catch (e) {
                            console.error('Erro ao iniciar reconhecimento:', e);
                            isListening = false;
                            // Em caso de erro, tentar reiniciar
                            try {
                                recognition.stop();
                                setTimeout(() => {
                                    recognition.start();
                                    isListening = true;
                                }, 200);
                            } catch (finalError) {
                                alert('Erro ao acessar o microfone. Por favor, verifique as permissões e tente novamente.');
                                isListening = false;
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Erro ao obter permissão do microfone:', error);
                        
                        // Detalhes específicos do erro para ajudar na depuração
                        let errorMsg = 'Não foi possível acessar o microfone.';
                        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                            errorMsg = 'Permissão para usar o microfone foi negada. Verifique as configurações do seu navegador.';
                        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                            errorMsg = 'Nenhum microfone encontrado no dispositivo. Verifique se há um microfone conectado.';
                        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                            errorMsg = 'Seu microfone pode estar sendo usado por outro aplicativo. Feche outros aplicativos e tente novamente.';
                        } else if (error.name === 'SecurityError') {
                            errorMsg = 'O uso do microfone não é permitido por motivos de segurança. Tente usar HTTPS.';
                        }
                        
                        alert(errorMsg);
                    });
            } else {
                // Navegadores mais antigos
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Erro ao iniciar reconhecimento:', error);
                    alert('Seu navegador não suporta reconhecimento de voz ou ocorreu um erro ao iniciar.');
                }
            }
        });
        
        // Adicionar um botão alternativo para navegadores que não funcionam bem com o reconhecimento de voz
        const chatInputContainer = document.querySelector('.chat-input-container');
        const nativeSpeechButton = document.createElement('button');
        nativeSpeechButton.id = 'native-speech-button';
        nativeSpeechButton.title = 'Usar teclado de voz nativo';
        nativeSpeechButton.innerHTML = '<i class="fas fa-keyboard"></i>';
        nativeSpeechButton.style.marginLeft = '5px';
        nativeSpeechButton.style.backgroundColor = '#9E9E9E';
        nativeSpeechButton.style.color = 'white';
        nativeSpeechButton.style.border = 'none';
        nativeSpeechButton.style.borderRadius = '30px';
        nativeSpeechButton.style.width = '40px';
        nativeSpeechButton.style.height = '40px';
        nativeSpeechButton.style.display = 'flex';
        nativeSpeechButton.style.justifyContent = 'center';
        nativeSpeechButton.style.alignItems = 'center';
        
        nativeSpeechButton.addEventListener('click', () => {
            // Focar no input para ativar o teclado com recurso de voz nativo
            userInput.focus();
            alert('Use o botão de microfone do seu teclado para ditar texto');
        });
        
        if (isMobile) {
            chatInputContainer.insertBefore(nativeSpeechButton, sendButton);
        }
        
        // Configurações específicas para mobile no modo de conversa contínua
        if (isMobile) {
            // Função para habilitar modo de baixo consumo em dispositivos móveis
            function setupMobileRealtimeMode() {
                // Em dispositivos móveis, usar intervalos mais longos para poupar bateria
                const mobilePauseDelay = 2000; // 2 segundos para considerar pausa na fala
                const mobileRestartDelay = 500; // 500ms para reiniciar reconhecimento
                
                // Sobrescrever o comportamento do modo contínuo para móveis
                realtimeModeToggle.addEventListener('change', function() {
                    if (this.checked) {
                        // Ativar modo de baixo consumo
                        showFeedbackMessage('Modo conversa ativado (versão móvel)', 'continuous-mode-feedback');
                        
                        // Configurações específicas para mobile
                        recognition.continuous = false; // Usar false para reduzir consumo
                        recognition.interimResults = true;
                        
                        // Iniciar com o botão vermelho pulsante para indicar atividade
                        voiceInputButton.classList.add('listening');
                        document.body.classList.add('realtime-mode');
                        
                        // Na versão mobile, iniciar e parar em intervalos regulares
                        // para economizar bateria, em vez de manter contínuo
                        startContinuousListening();
                    } else {
                        // Desativar modo conversa
                        document.body.classList.remove('realtime-mode');
                        voiceInputButton.classList.remove('listening');
                        
                        if (isListening) {
                            recognition.stop();
                            isListening = false;
                        }
                    }
                });
                
                // Sobrescrever pauseTimeout para usar o valor específico de mobile
                pauseTimeout = mobilePauseDelay;
            }
            
            // Ativar configurações específicas para mobile
            setupMobileRealtimeMode();
        }
    } else {
        // Se o navegador não suportar SpeechRecognition
        console.warn('Este navegador não suporta reconhecimento de voz automático');
        voiceInputButton.addEventListener('click', () => {
            // Verificar se pelo menos o MediaDevices API está disponível
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                alert('Seu navegador não suporta reconhecimento de voz automático, mas você pode usar o botão de microfone do seu teclado.');
                
                // Em dispositivos Android/iOS, focar no input pode ativar o teclado com botão de microfone
                userInput.focus();
            } else {
                // Realmente não há suporte para captura de áudio
                voiceInputButton.style.display = 'none';
                
                // Mostrar mensagem informativa
                const micNotSupported = document.createElement('div');
                micNotSupported.className = 'mic-not-supported';
                micNotSupported.textContent = 'Seu navegador não suporta reconhecimento de voz.';
                document.body.appendChild(micNotSupported);
                
                // Remover a mensagem após 5 segundos
                setTimeout(() => {
                    if (micNotSupported.parentNode) {
                        micNotSupported.parentNode.removeChild(micNotSupported);
                    }
                }, 5000);
            }
        });
        
        // Adicionar um botão alternativo também nesse caso
        const chatInputContainer = document.querySelector('.chat-input-container');
        const nativeSpeechButton = document.createElement('button');
        nativeSpeechButton.id = 'native-speech-button';
        nativeSpeechButton.title = 'Usar teclado de voz nativo';
        nativeSpeechButton.innerHTML = '<i class="fas fa-keyboard"></i>';
        nativeSpeechButton.style.marginLeft = '5px';
        nativeSpeechButton.style.backgroundColor = '#9E9E9E';
        nativeSpeechButton.style.color = 'white';
        nativeSpeechButton.style.border = 'none';
        nativeSpeechButton.style.borderRadius = '30px';
        nativeSpeechButton.style.width = '40px';
        nativeSpeechButton.style.height = '40px';
        nativeSpeechButton.style.display = 'flex';
        nativeSpeechButton.style.justifyContent = 'center';
        nativeSpeechButton.style.alignItems = 'center';
        
        nativeSpeechButton.addEventListener('click', () => {
            // Focar no input para ativar o teclado com recurso de voz nativo
            userInput.focus();
            alert('Use o botão de microfone do seu teclado para ditar texto');
        });
        
        chatInputContainer.insertBefore(nativeSpeechButton, sendButton);
    }
    
    // Configuração para síntese de voz
    const speechSynthesis = window.speechSynthesis;
    let voices = [];
    
    function loadVoices() {
        voices = speechSynthesis.getVoices();
    }
    
    if (speechSynthesis) {
        loadVoices();
        
        // Chrome carrega as vozes de forma assíncrona
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    }
    
    // Função para falar texto com suporte a interrupção
    function speak(text) {
        if (!speechSynthesis) return;
        
        // Parar qualquer fala em andamento
        speechSynthesis.cancel();
        
        // Marcar que o bot está falando para poder ignorar o reconhecimento durante esse período
        isBotSpeaking = true;
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Encontrar uma voz em português BR
        const portugueseVoice = voices.find(voice => 
            voice.lang.includes('pt-BR') || voice.lang.includes('pt-PT')
        );
        
        if (portugueseVoice) {
            utterance.voice = portugueseVoice;
        }
        
        utterance.lang = 'pt-BR';
        utterance.rate = 1.6;
        utterance.pitch = 1.6;
        
        // Adicionar evento para quando a fala terminar
        utterance.onend = function() {
            console.log('Fala do bot encerrada');
            
            // Definir um pequeno atraso antes de considerar que o bot parou de falar
            // para evitar que o sistema de reconhecimento capte os ecos finais
            clearTimeout(speechEndTimeout);
            
            // Ajustar o delay com base no nível de eco do dispositivo
            let echoDelay = 300; // padrão
            if (ecoLevel === 'high') {
                echoDelay = 800; // maior atraso para dispositivos com alto eco
            } else if (ecoLevel === 'medium') {
                echoDelay = 500; // atraso médio
            }
            
            speechEndTimeout = setTimeout(() => {
                isBotSpeaking = false;
                
                // Definir um timestamp até quando ignorar reconhecimentos
                // (evita capturar ecos da própria voz do bot)
                // Ajustar o tempo de ignorar com base no nível de eco
                let ignoreTime = 500; // padrão
                if (ecoLevel === 'high') {
                    ignoreTime = 1200; // ignorar por mais tempo se eco alto
                } else if (ecoLevel === 'medium') {
                    ignoreTime = 800; // tempo médio
                }
                
                ignoreRecognitionUntil = Date.now() + ignoreTime;
                
                // Se estiver no modo de conversa contínua, reiniciar o reconhecimento
                if (isRealtimeMode && realtimeModeToggle.checked && !isListening) {
                    startContinuousListening();
                }
            }, echoDelay);
        };
        
        // Iniciar a fala
        speechSynthesis.speak(utterance);
        
        // Pausar temporariamente o reconhecimento de voz enquanto o bot fala
        if (isRealtimeMode && isListening) {
            recognition.stop();
            isListening = false;
            console.log('Reconhecimento pausado enquanto o bot fala');
        }
    }
    
    // Função para adicionar botão de fala a uma mensagem
    function addSpeakButton(messageContent, text) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        const speakButton = document.createElement('button');
        speakButton.className = 'speak-button';
        speakButton.innerHTML = '<i class="fas fa-volume-up"></i>';
        speakButton.title = 'Ouvir mensagem';
        speakButton.addEventListener('click', () => speak(text));
        
        actionsDiv.appendChild(speakButton);
        messageContent.parentNode.appendChild(actionsDiv);
    }

    // Função para adicionar mensagem ao chat
    function addMessage(message, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
        
        // Se for mensagem do bot, adiciona o avatar
        if (!isUser) {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'bot-avatar';
            
            // Criando um SVG para o avatar
            avatarDiv.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24" height="24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6h10v2H7zm0-4h10v2H7z"/>
                </svg>
            `;
            
            messageDiv.appendChild(avatarDiv);
        }
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = message;
        
        messageDiv.appendChild(messageContent);
        chatMessages.appendChild(messageDiv);
        
        // Adicionar botão de fala apenas para mensagens do bot
        if (!isUser && speechSynthesis) {
            addSpeakButton(messageContent, message);
            
            // Se o botão de fala automática estiver ativado, ler a mensagem
            if (autoSpeakToggle.checked) {
                speak(message);
            }
        }
        
        // Scroll para o final da conversa
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Função para mostrar indicador de carregamento
    function showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message bot';
        loadingDiv.id = 'loading-indicator';
        
        // Adicionando avatar animado
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'bot-avatar avatar-animation talking';
        
        // SVG para o avatar
        avatarDiv.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24" height="24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-6h10v2H7zm0-4h10v2H7z"/>
            </svg>
        `;
        
        loadingDiv.appendChild(avatarDiv);
        
        // Adicionando indicador de digitação
        const typingDiv = document.createElement('div');
        typingDiv.className = 'loading';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'dot';
            typingDiv.appendChild(dot);
        }
        
        loadingDiv.appendChild(typingDiv);
        chatMessages.appendChild(loadingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Função para remover indicador de carregamento
    function hideLoading() {
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
    }

    // Função para lidar com a seleção de arquivo
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        currentFile = file;
        
        // Mostrar contêiner de visualização
        previewContainer.style.display = 'block';
        
        // Processar dependendo do tipo de arquivo
        if (file.type.startsWith('image/')) {
            // É uma imagem
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
                pdfPreview.style.display = 'none';
            };
            reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
            // É um PDF
            pdfName.textContent = file.name;
            imagePreview.style.display = 'none';
            pdfPreview.style.display = 'flex';
        } else {
            // Tipo de arquivo não suportado
            alert('Apenas imagens e arquivos PDF são suportados.');
            currentFile = null;
            previewContainer.style.display = 'none';
            return;
        }
        
        // Rolar para mostrar a visualização
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Função para remover o arquivo selecionado
    function removeFile() {
        currentFile = null;
        imagePreview.src = '';
        imagePreview.style.display = 'none';
        pdfPreview.style.display = 'none';
        previewContainer.style.display = 'none';
        fileUpload.value = '';
    }
    
    // Adicionar event listeners para upload de arquivos
    fileUploadButton.addEventListener('click', () => {
        fileUpload.click();
    });
    
    fileUpload.addEventListener('change', handleFileSelect);
    
    removeFileButton.addEventListener('click', removeFile);

    // Função para converter arquivo para base64
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                let base64String = reader.result;
                // Remover prefixo de data URL se existir
                if (base64String.includes(',')) {
                    base64String = base64String.split(',')[1];
                }
                resolve(base64String);
            };
            reader.onerror = error => reject(error);
        });
    }

    // Função para reduzir o tamanho da imagem antes de enviar
    function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    // Calcular novas dimensões mantendo a proporção
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round(height * (maxWidth / width));
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = Math.round(width * (maxHeight / height));
                            height = maxHeight;
                        }
                    }
                    
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Converter para JPEG com compressão
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    
                    // Converter data URL para Blob
                    const base64Data = dataUrl.split(',')[1];
                    resolve(base64Data);
                };
                img.onerror = error => reject(error);
            };
            reader.onerror = error => reject(error);
        });
    }

    // Função para comprimir PDFs grandes antes de envio
    async function compressPDF(pdfFile, maxSizeMB = 10) {
        // Se o arquivo for menor que o limite, retorna o base64 normal
        const fileSizeMB = pdfFile.size / (1024 * 1024);
        if (fileSizeMB <= maxSizeMB) {
            return await fileToBase64(pdfFile);
        }

        showFeedbackMessage('Otimizando PDF para envio...', 'compress-pdf-msg');
        
        // Dividir o PDF em chunks menores
        try {
            const base64Data = await fileToBase64(pdfFile);
            // Calcular tamanho máximo para cada chunk em bytes
            // Usamos 75% do tamanho máximo para ter margem de segurança
            const maxChunkSize = Math.floor((maxSizeMB * 0.75 * 1024 * 1024) / 1.37); // Fator 1.37 para conversão base64
            
            // Dividir os dados em chunks
            const totalChunks = Math.ceil(base64Data.length / maxChunkSize);
            
            // Se precisarmos de muitos chunks, mostramos um alerta
            if (totalChunks > 3) {
                alert(`O PDF é muito grande (${Math.round(fileSizeMB)}MB). Ele será analisado em partes. Para melhor desempenho, considere usar arquivos menores que ${maxSizeMB}MB.`);
            }
            
            // Retornamos apenas o primeiro chunk com metadados
            return {
                firstChunk: base64Data.substring(0, maxChunkSize),
                totalChunks: totalChunks,
                totalSize: base64Data.length,
                isChunked: true
            };
        } catch (error) {
            console.error('Erro ao comprimir PDF:', error);
            throw new Error('Falha ao comprimir o PDF');
        }
    }

    // Função modificada para processar envio de mensagem com arquivos
    async function handleSendMessage() {
        const message = userInput.value.trim();
        
        // Verificar se temos mensagem ou arquivo
        if (!message && !currentFile) return;

        // Se estiver no modo contínuo, interromper temporariamente o reconhecimento
        let wasListening = false;
        if (isRealtimeMode && isListening) {
            recognition.stop();
            isListening = false;
            wasListening = true;
        }
        
        // Preparar dados para envio
        let messageData = {
            message: message || '',
            sessionId: sessionId
        };
        
        // Se tiver arquivo, adicionar à mensagem
        if (currentFile) {
            // Adicionar mensagem do usuário ao chat com visualização do arquivo
            let filePreviewHTML = '';
            
            if (currentFile.type.startsWith('image/')) {
                const imgSrc = URL.createObjectURL(currentFile);
                filePreviewHTML = `<img src="${imgSrc}" alt="Imagem enviada" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 5px;">`;
                
                // Adicionar dados do arquivo para envio com compressão
                try {
                    // Verificar tamanho da imagem
                    const fileSizeMB = currentFile.size / (1024 * 1024);
                    let base64Data;
                    
                    // Se a imagem for maior que 1MB, comprimimos
                    if (fileSizeMB > 1) {
                        showFeedbackMessage('Otimizando imagem para envio...', 'compress-msg');
                        base64Data = await compressImage(currentFile, 1200, 1200, 0.7);
                    } else {
                        base64Data = await fileToBase64(currentFile);
                    }
                    
                    messageData.fileType = 'image';
                    messageData.fileName = currentFile.name;
                    messageData.fileData = base64Data;
                    messageData.mimeType = 'image/jpeg'; // Usar sempre JPEG para as imagens comprimidas
                } catch (error) {
                    console.error('Erro ao processar imagem:', error);
                    alert('Erro ao processar a imagem. Por favor, tente novamente.');
                    return;
                }
            } else if (currentFile.type === 'application/pdf') {
                filePreviewHTML = `<div style="display: flex; align-items: center; background: #f1f1f1; padding: 8px; border-radius: 8px; margin-top: 5px;">
                    <i class="fas fa-file-pdf" style="color: #DB4437; font-size: 24px; margin-right: 8px;"></i>
                    <span style="overflow: hidden; text-overflow: ellipsis;">${currentFile.name}</span>
                </div>`;
                
                // Adicionar dados do arquivo para envio com compressão para PDFs grandes
                try {
                    const fileSizeMB = currentFile.size / (1024 * 1024);
                    let pdfData;
                    
                    // Se o PDF for maior que 10MB, comprimir ou dividir
                    if (fileSizeMB > 10) {
                        // Comprimir o PDF
                        pdfData = await compressPDF(currentFile, 10);
                        
                        if (pdfData.isChunked) {
                            // Se for dividido em chunks, enviar apenas o primeiro
                            messageData.fileType = 'pdf';
                            messageData.fileName = currentFile.name;
                            messageData.fileData = pdfData.firstChunk;
                            messageData.mimeType = 'application/pdf';
                            messageData.isChunked = true;
                            messageData.totalChunks = pdfData.totalChunks;
                            messageData.chunkIndex = 0;
                        }
                    } else {
                        // PDF pequeno, enviar normalmente
                        const base64Data = await fileToBase64(currentFile);
                        messageData.fileType = 'pdf';
                        messageData.fileName = currentFile.name;
                        messageData.fileData = base64Data;
                        messageData.mimeType = 'application/pdf';
                    }
                } catch (error) {
                    console.error('Erro ao processar PDF:', error);
                    alert('Erro ao processar o PDF. Por favor, tente novamente com um arquivo menor ou em outro formato.');
                    return;
                }
            }
            
            // Criar mensagem com visualização do arquivo
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message user';
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            
            // Adicionar texto da mensagem se houver
            if (message) {
                messageContent.innerHTML = `${message}<br>${filePreviewHTML}`;
            } else {
                messageContent.innerHTML = filePreviewHTML;
            }
            
            messageDiv.appendChild(messageContent);
            chatMessages.appendChild(messageDiv);
            
            // Limpar visualização de arquivo
            removeFile();
        } else {
            // Adiciona apenas mensagem de texto do usuário ao chat
            addMessage(message, true);
        }
        
        // Limpa o campo de entrada
        userInput.value = '';

        // Mostra indicador de carregamento com avatar animado
        showLoading();
        
        // Verifica status da API se tivemos problemas recentes
        if (networkRetryCount > 0) {
            await checkApiStatus();
        }

        // Envia mensagem para API e recebe resposta
        try {
            const botResponse = await sendMessageToAPI(messageData);
            
            // Remove indicador de carregamento e adiciona resposta do bot
            hideLoading();
            addMessage(botResponse, false);
            
            // Reiniciar o reconhecimento se estava ativo antes
            if (isRealtimeMode && wasListening && realtimeModeToggle.checked) {
                setTimeout(() => {
                    startContinuousListening();
                }, 500);
            }
        } catch (error) {
            // Tratar erros de API
            hideLoading();
            addMessage("Desculpe, estou com problemas de conexão no momento. Tente novamente em instantes.", false);
            
            if (isRealtimeMode && wasListening && realtimeModeToggle.checked) {
                setTimeout(() => {
                    startContinuousListening();
                }, 500);
            }
        }
    }

    // Função modificada para enviar mensagem para a API
    async function sendMessageToAPI(messageData) {
        // Tentar verificar o status da API primeiro se tivermos tido problemas
        if (!isApiOnline || networkRetryCount > 0) {
            const apiStatus = await checkApiStatus();
            if (!apiStatus && networkRetryCount >= maxNetworkRetries) {
                return "Não foi possível estabelecer conexão com o servidor após várias tentativas. Por favor, verifique sua internet e tente novamente mais tarde.";
            }
        }
        
        try {
            // Adicionar timeout de 30 segundos para evitar espera infinita
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // Aumentado para 60s para arquivos grandes
            
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(messageData),
                signal: controller.signal
            });
            
            // Limpar o timeout já que a resposta chegou
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Erro na comunicação com o servidor: ${response.status}`);
            }

            const data = await response.json();
            
            // Verificar se é uma resposta offline
            if (data.offline) {
                console.warn('Servidor respondeu em modo offline');
                showOfflineNotification('Modo offline: respostas limitadas disponíveis', false);
                networkRetryCount++;
            } else {
                // Resposta bem sucedida, resetar contador de retry
                networkRetryCount = 0;
                isApiOnline = true;
            }
            
            // Atualizar sessionId se o servidor enviar um novo
            if (data.sessionId) {
                sessionId = data.sessionId;
                localStorage.setItem('atlas_session_id', sessionId);
            }
            
            return data.response;
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            networkRetryCount++;
            
            // Verificar o tipo de erro
            let errorMessage = 'Desculpe, ocorreu um erro ao processar sua mensagem.';
            
            if (error.name === 'AbortError') {
                errorMessage = 'A conexão demorou muito para responder. Verifique sua internet e tente novamente.';
                showOfflineNotification('Tempo limite de conexão excedido', true);
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Problema de conexão detectado. Verifique se você está conectado à internet.';
                showOfflineNotification('Problema de conexão com o servidor', true);
                isApiOnline = false;
            }
            
            return errorMessage;
        }
    }

    // Mostrar notificação de modo offline persistente
    function showOfflineNotification(message, isError = false) {
        const id = 'offline-notification';
        // Remover notificação existente
        const existingNotification = document.getElementById(id);
        if (existingNotification) existingNotification.remove();
        
        const offlineMsg = document.createElement('div');
        offlineMsg.id = id;
        offlineMsg.className = 'offline-notification';
        offlineMsg.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i> ${message}`;
        offlineMsg.style.position = 'fixed';
        offlineMsg.style.top = '10px';
        offlineMsg.style.left = '50%';
        offlineMsg.style.transform = 'translateX(-50%)';
        offlineMsg.style.backgroundColor = isError ? 'rgba(244, 67, 54, 0.9)' : 'rgba(255, 152, 0, 0.9)';
        offlineMsg.style.color = 'white';
        offlineMsg.style.padding = '8px 15px';
        offlineMsg.style.borderRadius = '20px';
        offlineMsg.style.fontSize = '14px';
        offlineMsg.style.zIndex = '1001';
        offlineMsg.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        offlineMsg.style.transition = 'opacity 0.3s ease';
        
        if (isError) {
            // Adicionar botão para tentar novamente
            const retryButton = document.createElement('button');
            retryButton.innerHTML = 'Tentar novamente';
            retryButton.style.marginLeft = '10px';
            retryButton.style.padding = '3px 8px';
            retryButton.style.backgroundColor = 'white';
            retryButton.style.color = '#F44336';
            retryButton.style.border = 'none';
            retryButton.style.borderRadius = '4px';
            retryButton.style.cursor = 'pointer';
            retryButton.style.fontSize = '12px';
            
            retryButton.addEventListener('click', async () => {
                offlineMsg.style.opacity = '0.5';
                const status = await checkApiStatus();
                if (status) {
                    offlineMsg.remove();
                } else {
                    offlineMsg.style.opacity = '1';
                }
            });
            
            offlineMsg.appendChild(retryButton);
        } else {
            // Auto-remover após 5 segundos se não for erro
            setTimeout(() => {
                if (offlineMsg.parentNode) {
                    offlineMsg.style.opacity = '0';
                    setTimeout(() => offlineMsg.remove(), 300);
                }
            }, 5000);
        }
        
        document.body.appendChild(offlineMsg);
    }

    // Event listeners
    sendButton.addEventListener('click', handleSendMessage);
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });

    // Foca no input quando a página carrega
    userInput.focus();
    
    // Adicionar botão de fala para a primeira mensagem do bot
    const firstBotMessage = document.querySelector('.message.bot .message-content');
    if (firstBotMessage && speechSynthesis) {
        addSpeakButton(firstBotMessage, firstBotMessage.textContent);
    }

    // Adicionar um indicador flutuante para o modo de conversação
    function addRealtimeModeIndicator() {
        // Remover qualquer indicador existente
        const existingIndicator = document.getElementById('realtime-mode-indicator');
        if (existingIndicator) existingIndicator.remove();
        
        const indicator = document.createElement('div');
        indicator.id = 'realtime-mode-indicator';
        indicator.innerHTML = '<i class="fas fa-comment-dots"></i> Modo conversa ativo';
        indicator.style.position = 'fixed';
        indicator.style.bottom = '15px';
        indicator.style.right = '15px';
        indicator.style.backgroundColor = 'rgba(76, 175, 80, 0.9)';
        indicator.style.color = 'white';
        indicator.style.padding = '8px 12px';
        indicator.style.borderRadius = '20px';
        indicator.style.fontSize = '14px';
        indicator.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        indicator.style.zIndex = '1000';
        indicator.style.display = 'flex';
        indicator.style.alignItems = 'center';
        indicator.style.gap = '5px';
        
        // Adicionar animação pulsante
        indicator.style.animation = 'pulse 1.5s infinite';
        
        // Adicionar evento de clique para desativar o modo conversa
        indicator.addEventListener('click', function() {
            realtimeModeToggle.checked = false;
            
            // Disparar manualmente o evento change
            const event = new Event('change');
            realtimeModeToggle.dispatchEvent(event);
            
            // Remover o indicador
            this.remove();
        });
        
        document.body.appendChild(indicator);
    }
    
    // Remover o indicador flutuante
    function removeRealtimeModeIndicator() {
        const indicator = document.getElementById('realtime-mode-indicator');
        if (indicator) indicator.remove();
    }
    
    // Atualizar o event listener do toggle para adicionar/remover o indicador
    realtimeModeToggle.addEventListener('change', function() {
        if (this.checked) {
            addRealtimeModeIndicator();
        } else {
            removeRealtimeModeIndicator();
        }
    });

    // Adicionar funcionalidade para interromper a fala no modo contínuo
    if (isRealtimeMode) {
        // Adicionando botão de interrupção no modo conversa
        function addInterruptControls() {
            // Verificar se já existe
            if (document.getElementById('interrupt-controls')) return;
            
            const interruptControls = document.createElement('div');
            interruptControls.id = 'interrupt-controls';
            interruptControls.style.position = 'fixed';
            interruptControls.style.bottom = '65px';
            interruptControls.style.right = '15px';
            interruptControls.style.zIndex = '1000';
            interruptControls.style.display = 'flex';
            interruptControls.style.flexDirection = 'column';
            interruptControls.style.gap = '10px';
            
            // Botão para interromper fala do bot
            const interruptButton = document.createElement('button');
            interruptButton.innerHTML = '<i class="fas fa-hand-paper"></i>';
            interruptButton.title = 'Interromper fala do Atlas';
            interruptButton.style.width = '50px';
            interruptButton.style.height = '50px';
            interruptButton.style.borderRadius = '50%';
            interruptButton.style.backgroundColor = '#DB4437';
            interruptButton.style.color = 'white';
            interruptButton.style.border = 'none';
            interruptButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
            interruptButton.style.cursor = 'pointer';
            
            interruptButton.addEventListener('click', () => {
                // Interromper fala e reconhecimento
                if (speechSynthesis.speaking) {
                    speechSynthesis.cancel();
                    isBotSpeaking = false;
                    showFeedbackMessage('Fala interrompida', 'voice-feedback');
                }
                
                // Limpar sinalizadores de ignorar reconhecimento
                ignoreRecognitionUntil = 0;
                
                // Focar no input para nova mensagem
                userInput.focus();
                
                // Esperar um momento antes de reiniciar o reconhecimento
                // para evitar que qualquer eco residual seja capturado
                setTimeout(() => {
                    // Reiniciar reconhecimento (se estiver no modo conversa)
                    if (realtimeModeToggle.checked && !isListening) {
                        startContinuousListening();
                    }
                }, 300);
            });
            
            interruptControls.appendChild(interruptButton);
            document.body.appendChild(interruptControls);
        }
        
        // Remover controles de interrupção
        function removeInterruptControls() {
            const controls = document.getElementById('interrupt-controls');
            if (controls) controls.remove();
        }
        
        // Atualizar event listener para mostrar/esconder controles
        realtimeModeToggle.addEventListener('change', function() {
            if (this.checked) {
                addInterruptControls();
            } else {
                removeInterruptControls();
            }
        });
    }

    // Adicionar controle de nível de eco às configurações
    function initEcoLevelControl() {
        // Verificar se o controle já existe
        if (document.getElementById('eco-level-control')) return;
        
        // Criar div para controle de eco
        const ecoLevelControl = document.createElement('div');
        ecoLevelControl.id = 'eco-level-control';
        ecoLevelControl.className = 'eco-level-toggle';
        
        // Texto explicativo
        const ecoLabel = document.createElement('span');
        ecoLabel.textContent = 'Nível de eco:';
        
        // Criar select para níveis de eco
        const ecoSelect = document.createElement('select');
        ecoSelect.id = 'eco-level-select';
        
        // Adicionar opções
        const options = [
            { value: 'low', text: 'Baixo' },
            { value: 'medium', text: 'Médio' },
            { value: 'high', text: 'Alto' }
        ];
        
        options.forEach(option => {
            const optEl = document.createElement('option');
            optEl.value = option.value;
            optEl.textContent = option.text;
            if (option.value === ecoLevel) {
                optEl.selected = true;
            }
            ecoSelect.appendChild(optEl);
        });
        
        // Adicionar evento de mudança
        ecoSelect.addEventListener('change', function() {
            ecoLevel = this.value;
            localStorage.setItem('atlas_eco_level', ecoLevel);
            showFeedbackMessage(`Nível de eco ajustado para: ${this.options[this.selectedIndex].text}`, 'eco-level-feedback');
            
            // Notificar o usuário sobre a mudança de configuração
            if (ecoLevel === 'high') {
                showFeedbackMessage('Redução de eco aumentada para ambientes ruidosos', 'eco-level-info');
            }
        });
        
        // Adicionar botão de calibração automática
        const calibrateButton = document.createElement('button');
        calibrateButton.type = 'button';
        calibrateButton.className = 'calibrate-button';
        calibrateButton.title = 'Calibração automática de eco';
        calibrateButton.innerHTML = '<i class="fas fa-magic"></i>';
        calibrateButton.addEventListener('click', detectEcoLevel);
        
        // Montar controle
        ecoLevelControl.appendChild(ecoLabel);
        ecoLevelControl.appendChild(ecoSelect);
        ecoLevelControl.appendChild(calibrateButton);
        
        // Adicionar ao cabeçalho
        const headerToggles = document.querySelector('.header-toggles');
        if (headerToggles) {
            headerToggles.appendChild(ecoLevelControl);
        }
        
        // Executar calibração automática ao iniciar se nunca foi executada antes
        if (!localStorage.getItem('atlas_eco_detection_time')) {
            // Atrasar um pouco para dar tempo da interface carregar
            setTimeout(detectEcoLevel, 5000);
        }
    }

    // Adicionar uma função para calibração automática de eco
    function detectEcoLevel() {
        console.log('Iniciando detecção automática de nível de eco...');
        
        // Verificar se a detecção já foi realizada recentemente
        const lastEcoDetection = localStorage.getItem('atlas_eco_detection_time');
        const now = Date.now();
        
        // Se já detectamos nos últimos 7 dias, não fazer novamente
        if (lastEcoDetection && (now - parseInt(lastEcoDetection)) < 7 * 24 * 60 * 60 * 1000) {
            console.log('Usando nível de eco previamente detectado');
            return;
        }
        
        // Adicionar um pequeno aviso temporário
        const ecoCalibration = document.createElement('div');
        ecoCalibration.id = 'eco-calibration';
        ecoCalibration.textContent = 'Calibrando sensibilidade do microfone...';
        ecoCalibration.style.position = 'fixed';
        ecoCalibration.style.bottom = '100px';
        ecoCalibration.style.left = '50%';
        ecoCalibration.style.transform = 'translateX(-50%)';
        ecoCalibration.style.backgroundColor = 'rgba(66, 133, 244, 0.8)';
        ecoCalibration.style.color = 'white';
        ecoCalibration.style.padding = '8px 15px';
        ecoCalibration.style.borderRadius = '20px';
        ecoCalibration.style.fontSize = '14px';
        ecoCalibration.style.zIndex = '1001';
        
        document.body.appendChild(ecoCalibration);
        
        // Vamos usar o sistema de reconhecimento para detectar eco
        if (SpeechRecognition) {
            const calibrationRecognition = new SpeechRecognition();
            calibrationRecognition.continuous = true;
            calibrationRecognition.interimResults = true;
            calibrationRecognition.lang = 'pt-BR';
            
            // Contador para monitorar repetições
            let repetitionCount = 0;
            let silenceCount = 0;
            let totalSamples = 0;
            
            // Lista para armazenar resultados
            const samples = [];
            
            // Função auxiliar para medir repetições em um texto
            function countRepetitions(text) {
                // Procurar padrões de repetição de palavras
                const words = text.toLowerCase().split(/\s+/);
                let repetitions = 0;
                
                // Contar palavras repetidas
                for (let i = 0; i < words.length - 1; i++) {
                    if (words[i] === words[i + 1] && words[i].length > 2) {
                        repetitions++;
                    }
                }
                
                // Verificar repetições de sílabas no final das palavras
                const syllableRepPattern = /\b(\w+)(\s+\w{1,3})(?=\s|$)/g;
                const syllableMatches = text.match(syllableRepPattern) || [];
                
                // Verificar cada correspondência por eco silábico
                syllableMatches.forEach(match => {
                    const parts = match.trim().split(/\s+/);
                    if (parts.length === 2 && parts[0].endsWith(parts[1])) {
                        repetitions++;
                    }
                });
                
                return repetitions;
            }
            
            calibrationRecognition.onresult = function(event) {
                // Processar os resultados
                totalSamples++;
                
                // Analisar resultados parciais e finais
                for (let i = 0; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        const text = result[0].transcript;
                        
                        // Se há texto reconhecido, analisar repetições
                        if (text && text.trim().length > 0) {
                            const repCount = countRepetitions(text);
                            samples.push(repCount);
                            
                            if (repCount > 0) {
                                repetitionCount++;
                            }
                        } else {
                            silenceCount++;
                        }
                    }
                }
                
                // Após várias amostras, determinar o nível de eco
                if (totalSamples >= 5 || silenceCount >= 10) {
                    calibrationRecognition.stop();
                }
            };
            
            calibrationRecognition.onend = function() {
                // Calcular a média de repetições
                const validSamples = samples.filter(s => s !== undefined);
                const repetitionRate = validSamples.length > 0 ? 
                    validSamples.reduce((a, b) => a + b, 0) / validSamples.length : 0;
                
                console.log(`Taxa de repetições detectada: ${repetitionRate.toFixed(2)}`);
                
                // Determinar o nível de eco com base na taxa de repetições
                let detectedEcoLevel = 'low';
                
                if (repetitionRate > 0.8) {
                    detectedEcoLevel = 'high';
                } else if (repetitionRate > 0.3) {
                    detectedEcoLevel = 'medium';
                }
                
                // Atualizar o nível de eco
                ecoLevel = detectedEcoLevel;
                localStorage.setItem('atlas_eco_level', ecoLevel);
                
                // Atualizar o select se existir
                const ecoSelect = document.getElementById('eco-level-select');
                if (ecoSelect) {
                    const option = Array.from(ecoSelect.options).find(opt => opt.value === ecoLevel);
                    if (option) {
                        ecoSelect.value = ecoLevel;
                    }
                }
                
                // Registrar o tempo da detecção
                localStorage.setItem('atlas_eco_detection_time', now.toString());
                
                // Remover a mensagem de calibração
                const calibration = document.getElementById('eco-calibration');
                if (calibration) {
                    calibration.textContent = `Calibração concluída: nível de eco ${detectedEcoLevel === 'low' ? 'baixo' : detectedEcoLevel === 'medium' ? 'médio' : 'alto'}`;
                    
                    // Remover após alguns segundos
                    setTimeout(() => {
                        if (calibration.parentNode) {
                            calibration.parentNode.removeChild(calibration);
                        }
                    }, 3000);
                }
                
                // Notificar o usuário
                showFeedbackMessage(`Nível de eco calibrado automaticamente: ${detectedEcoLevel === 'low' ? 'Baixo' : detectedEcoLevel === 'medium' ? 'Médio' : 'Alto'}`, 'eco-level-auto');
            };
            
            calibrationRecognition.onerror = function() {
                // Remover a mensagem em caso de erro
                const calibration = document.getElementById('eco-calibration');
                if (calibration && calibration.parentNode) {
                    calibration.parentNode.removeChild(calibration);
                }
                
                // Manter o nível atual em caso de erro
                console.log('Erro na calibração de eco, mantendo nível atual');
            };
            
            // Iniciar a calibração após um pequeno atraso
            setTimeout(() => {
                try {
                    calibrationRecognition.start();
                    console.log('Calibração de eco iniciada');
                } catch (e) {
                    console.error('Erro ao iniciar calibração de eco:', e);
                    // Remover a mensagem em caso de erro
                    const calibration = document.getElementById('eco-calibration');
                    if (calibration && calibration.parentNode) {
                        calibration.parentNode.removeChild(calibration);
                    }
                }
            }, 2000);
        } else {
            // Se não houver suporte a reconhecimento de voz, remover a mensagem
            const calibration = document.getElementById('eco-calibration');
            if (calibration && calibration.parentNode) {
                calibration.parentNode.removeChild(calibration);
            }
        }
    }
}); 
