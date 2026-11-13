# Ascensão

App pessoal de rotina gamificada: missões diárias e semanais, XP, níveis, ranks (E a S), atributos e sequência de dias — mais um módulo de gastos do casal, mês a mês e por tipo de gasto, alimentado por extratos da conta e do cartão.

## Rodar

```bash
npm install
npm run dev      # desenvolvimento
npm test         # testes das regras do jogo e do leitor de extratos
npm run build    # gera a pasta dist/ (site estático, instalável no celular como PWA)
```

## Como funciona

- **Missões**: cada conclusão gera um evento de XP. Concluir todas as diárias dá bônus e mantém a sequência; falhar gera uma missão de penalidade no dia seguinte, que salva a sequência se cumprida.
- **Treino**: treino do dia montado pelo tempo disponível (a prioridade é desempenho na corrida, depois estética e composição corporal), esquema animado e instruções de cada exercício, registro de carga e repetições por série com cronômetro de descanso, sugestão de progressão e histórico de cargas.
- **Saúde**: composição corporal (IMC, % de gordura medido ou estimado por circunferências, massa magra), metas diárias de calorias e macros conforme o objetivo, avaliação da evolução e plano de musculação para 2 ou 3 dias por semana. São estimativas por fórmulas, não prescrição.
- **Gastos**: importe PDF, OFX ou CSV (conta ou cartão, de qualquer uma das duas pessoas). Os lançamentos são classificados por regras; ao corrigir uma categoria, o app aprende o estabelecimento. Pagamento de fatura e transferências não entram no total, para não contar o cartão em dobro.
- **Finanças no jogo**: importar o extrato de um mês e fechar o mês dentro do orçamento rendem XP.
- **Dados**: ficam no navegador do aparelho (localStorage). Use Ajustes → Exportar backup.

## Estrutura

- `src/game.ts` — regras do jogo (funções puras)
- `src/health.ts` — composição corporal, metas de alimentação e princípios do plano de força
- `src/workout/` — exercícios e seus esquemas, treinos A/B/C, montagem por tempo e progressão
- `src/finance/parse.ts` — leitura de OFX/CSV
- `src/finance/pdf.ts` — leitura de extrato e fatura em PDF
- `src/finance/categorize.ts` — categorias, regras e resumos mensais
- `src/store.ts` — estado persistido
- `src/cloud.ts` — sincronização com Supabase
- `src/strava.ts` — login e leitura de treinos do Strava
- `src/pages/` — telas

## Rodar como artefato do Claude

`npm run build:artifact` gera `dist-artifact/page.html` e os arquivos do leitor de PDF. Dentro do artefato o app usa o banco do próprio artefato (gastos compartilhados em `finance/`, dados pessoais em `data/users/<id>/`) e o conector Strava da conta Claude, no lugar de Supabase e do login do Strava.

## Publicação, nuvem e Strava

O app é um site estático. As conexões são configuradas dentro do app, em Ajustes — nenhuma chave fica no repositório.

1. **Publicar**: em Settings → Pages do repositório, escolha "GitHub Actions" como fonte. O workflow `deploy.yml` publica a cada push.
2. **Nuvem (Supabase)**: crie um projeto, rode `supabase/schema.sql` no SQL Editor e cole o endereço do projeto e a chave pública em Ajustes. Cada pessoa cria a própria conta; quem importou os gastos informa o e-mail da outra em "Dividir os gastos com".
3. **Strava**: crie um aplicativo em strava.com/settings/api com o domínio do site em "Authorization Callback Domain" e cole Client ID e Client Secret em Ajustes.

Só os gastos são compartilhados; missões, saúde e Strava ficam na conta de cada um.

## Próximos passos

1. Google Agenda
2. Investimentos (aportes e metas)
3. Registro de refeições
