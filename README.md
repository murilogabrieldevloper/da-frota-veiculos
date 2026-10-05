# Da Frota Veículos

Site institucional e sistema de gestão de uma revenda de seminovos premium em Brasília – DF.
No ar em **[dafrotaveiculos.com](https://dafrotaveiculos.com)**.

O projeto tem duas partes:

- **Site público:** vitrine do estoque, ficha de financiamento online e contato direto pelo WhatsApp.
- **Área do Consultor:** painel interno com login para a equipe gerenciar estoque, leads, fichas de financiamento e o financeiro da loja.

## Funcionalidades

### Site
- Estoque carregado da API, com filtro por categoria e página de detalhes com galeria de fotos
- Ficha de financiamento em etapas, com validação de CPF e máscaras de telefone e dinheiro
- Formulário de contato e chat de atendimento que geram leads no painel
- Animações de entrada, layout responsivo e suporte a `prefers-reduced-motion`
- SEO: meta tags Open Graph, `canonical` e dados estruturados `AutoDealer` (JSON-LD)

### Área do Consultor
- Login por consultor com senha em hash (`password_hash`), sessão com expiração e código de ativação no primeiro acesso
- **Leads:** funil (novo → contato → negociação → vendido/perdido), responsável, anotações, histórico e exportação CSV
- **Fichas de financiamento:** recebidas pelo site ou importadas a partir da mensagem do WhatsApp
- **Estoque:** cadastro de veículos com várias fotos (compressão no navegador e regravação no servidor)
- **Financeiro:**
  - custo por carro: compra e gastos (documentação, preparação, comissão…), com lucro, margem e dias em estoque calculados
  - despesas fixas da loja, com cópia das despesas do mês anterior
  - fechamento do mês (faturamento, lucro bruto, despesas, lucro líquido), histórico de 6 meses e exportação para Excel
  - ao registrar a venda, o anúncio vinculado sai do site automaticamente
- Backup e restauração de todos os dados em JSON

## Tecnologia

| Camada | Escolha | Por quê |
|---|---|---|
| Front-end | HTML, CSS e JavaScript puro (sem framework e sem etapa de build) | Hospedagem compartilhada simples, carregamento rápido |
| Back-end | PHP 8.1 (`api/index.php`) | Disponível em qualquer hospedagem compartilhada |
| Banco | SQLite (criado sozinho no primeiro acesso) | Nada para configurar no painel da hospedagem |
| Hospedagem | Hostinger (Apache/LiteSpeed) | `.htaccess` com cabeçalhos de segurança e cache |

**Modo sem servidor:** sem PHP (abrindo os arquivos direto ou em prévia), o site e o painel continuam funcionando e guardam os dados no `localStorage`. Isso facilita testar sem configurar um servidor.

## Segurança

- Rotas de escrita exigem `Content-Type: application/json` e um cabeçalho próprio (`X-DF`) para barrar CSRF
- Limite de tentativas por IP no login e no envio de leads, além de campo-armadilha contra robôs
- O banco fica em arquivo `.ht.*` dentro de uma pasta bloqueada pelo `.htaccess`
- Fotos enviadas são validadas e regravadas com GD, e a pasta de uploads não executa scripts
- Dados financeiros (valor de compra, placa) ficam em tabelas separadas, só acessíveis com login; a rota pública de veículos nunca os expõe

## Estrutura

```
index.html            Site (vitrine)
financiamento.html    Ficha de financiamento
consultor.html        Área do Consultor
css/                  style.css (site) e consultor.css (painel)
js/
  store.js            Camada de dados compartilhada (API ou localStorage)
  main.js             Site
  financiamento.js    Ficha de financiamento
  consultor.js        Painel
  financeiro.js       Cálculos do financeiro (sem dependência de tela)
api/
  index.php           API: sessão, veículos, leads, configurações, backup
  financeiro.php      API do financeiro
  config.example.php  Modelo de configuração
tests/
  financeiro.test.js  Testes dos cálculos do financeiro
```

## Rodando localmente

1. Copie `api/config.example.php` para `api/config.php` e defina um código de ativação.
2. Rode um servidor PHP 8.1 ou mais novo na pasta do projeto:
   ```bash
   php -S localhost:8000
   ```
3. Abra `http://localhost:8000` (site) e `http://localhost:8000/consultor.html` (painel).

Testes dos cálculos do financeiro:

```bash
node tests/financeiro.test.js
```
