// Pré-carga exclusiva de testes: impede a leitura automática de arquivos de segredos.
require('dotenv').config = () => ({ parsed: {} });
process.env.GEMINI_API_KEY = 'chave-falsa-somente-testes';
