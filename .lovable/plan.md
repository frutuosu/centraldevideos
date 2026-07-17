
# Conectar o VBatch ao ChatGPT (via MCP)

Para o ChatGPT (e Claude/Cursor) conseguirem "conversar" com o seu app, o padrão hoje é expor o app como um **servidor MCP** (Model Context Protocol). O ChatGPT então adiciona seu app como um conector e chama as ferramentas que você declarar.

## Ponto importante sobre este projeto

O VBatch é um app que roda **100% no navegador** — o processamento de vídeo acontece na máquina do usuário, não no servidor. MCP é o inverso: são ferramentas executadas no **servidor** do app quando o ChatGPT chama. Ou seja, o ChatGPT **não vai conseguir editar vídeos em massa através do MCP**, porque essa lógica não existe no backend.

O que faz sentido expor via MCP aqui são operações leves de gerenciamento (ex.: listar/criar/duplicar templates, se você mover o armazenamento de templates do `localStorage` para o Lovable Cloud). Sem isso, não há nada útil no servidor para o ChatGPT chamar.

## Duas opções

### Opção A — Só quero o "connect", com ferramentas mínimas (rápido)
- Ativar Lovable Cloud (necessário para auth OAuth do MCP).
- Adicionar `@lovable.dev/mcp-js` + `mcpPlugin()` no `vite.config.ts`.
- Criar 1 tool de teste (`ping`) só para o ChatGPT reconhecer o conector.
- Publicar. Você conecta em ChatGPT → Settings → Connectors → Add.
- Resultado: conexão funciona, mas o ChatGPT não faz nada útil ainda.

### Opção B — Gerenciar templates via ChatGPT (útil de verdade)
Tudo da Opção A, mais:
- Mover templates do `localStorage` para uma tabela `templates` no Lovable Cloud (com RLS por usuário).
- Adicionar login (o MCP com OAuth precisa de contas de usuário).
- Criar tools MCP: `list_templates`, `get_template`, `create_template`, `update_template`, `delete_template`, `duplicate_template`.
- Ajustar a UI para ler/gravar templates do Cloud em vez do localStorage.
- Publicar e conectar no ChatGPT.
- Resultado: você pode pedir "crie um template com logo no canto superior direito e texto 'Promo' no rodapé" direto no ChatGPT.

## Sobre autenticação

Como templates são dados por-usuário, o caminho correto é **OAuth** (cada pessoa que conectar o app no ChatGPT entra com a própria conta). Um MCP público (sem login) exporia os templates de todos os usuários para qualquer um na internet — não é o que você quer.

## Perguntas antes de eu começar

1. **Qual opção você quer?** A (só o botão de conectar funciona, sem uso real) ou B (gerenciar templates pelo ChatGPT)?
2. Se B: tudo bem eu **ativar Lovable Cloud e adicionar login** (email/senha) no app?
