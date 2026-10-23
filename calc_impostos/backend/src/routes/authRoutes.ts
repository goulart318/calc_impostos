import { Router, Request, Response } from 'express';
import { AuthService, AuthError } from '../services/authService';
import { RaufIntegrationService } from '../services/raufIntegrationService';
import { autenticar, exigirSuperadmin } from '../middleware/auth';

function tratarErro(res: Response, err: any) {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('Erro na rota de autenticação/administração:', err);
  return res.status(500).json({ error: 'Erro interno ao processar a requisição.' });
}

// ======================= /api/auth =======================
export const authRouter = Router();

// Lista mínima de UASGs para o seletor da tela de login (pública)
authRouter.get('/uasgs', async (_req: Request, res: Response) => {
  try {
    res.json(await AuthService.listarUasgsPublicas());
  } catch (err) {
    tratarErro(res, err);
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { uasgId, email, senha } = req.body || {};
    const ip = String(req.ip || req.socket.remoteAddress || '');
    res.json(await AuthService.login(Number(uasgId), email, senha, ip));
  } catch (err) {
    tratarErro(res, err);
  }
});

authRouter.get('/me', autenticar, (req: Request, res: Response) => {
  res.json({ usuario: req.sessao!.usuario, uasg: req.sessao!.uasg });
});

authRouter.post('/alterar-senha', autenticar, async (req: Request, res: Response) => {
  try {
    const { senhaAtual, senhaNova } = req.body || {};
    await AuthService.alterarSenha(req.sessao!.usuario.id, senhaAtual, senhaNova);
    res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    tratarErro(res, err);
  }
});

authRouter.post('/trocar-uasg', autenticar, exigirSuperadmin, async (req: Request, res: Response) => {
  try {
    res.json(await AuthService.trocarUasg(req.sessao!.usuario.id, Number(req.body?.uasgId)));
  } catch (err) {
    tratarErro(res, err);
  }
});

// ======================= /api/admin =======================
export const adminRouter = Router();
adminRouter.use(autenticar, exigirSuperadmin);

adminRouter.get('/usuarios', async (_req: Request, res: Response) => {
  try {
    res.json(await AuthService.listarUsuarios());
  } catch (err) {
    tratarErro(res, err);
  }
});

adminRouter.post('/usuarios', async (req: Request, res: Response) => {
  try {
    const { nome, email, uasgOrigemId, senha } = req.body || {};
    res.status(201).json(await AuthService.criarUsuario({ nome, email, uasgOrigemId: Number(uasgOrigemId), senha }));
  } catch (err) {
    tratarErro(res, err);
  }
});

adminRouter.put('/usuarios/:id', async (req: Request, res: Response) => {
  try {
    const { nome, email, uasgOrigemId } = req.body || {};
    await AuthService.atualizarUsuario(Number(req.params.id), {
      nome,
      email,
      uasgOrigemId: uasgOrigemId ? Number(uasgOrigemId) : undefined
    });
    res.json({ success: true });
  } catch (err) {
    tratarErro(res, err);
  }
});

adminRouter.post('/usuarios/:id/resetar-senha', async (req: Request, res: Response) => {
  try {
    res.json(await AuthService.resetarSenha(Number(req.params.id)));
  } catch (err) {
    tratarErro(res, err);
  }
});

adminRouter.patch('/usuarios/:id/ativo', async (req: Request, res: Response) => {
  try {
    await AuthService.definirAtivo(Number(req.params.id), !!req.body?.ativo, req.sessao!.usuario.id);
    res.json({ success: true });
  } catch (err) {
    tratarErro(res, err);
  }
});

adminRouter.get('/uasgs', async (_req: Request, res: Response) => {
  try {
    res.json(await AuthService.listarUasgsAdmin());
  } catch (err) {
    tratarErro(res, err);
  }
});

adminRouter.post('/uasgs', async (req: Request, res: Response) => {
  try {
    res.status(201).json(await AuthService.criarUasg(req.body || {}));
  } catch (err) {
    tratarErro(res, err);
  }
});

adminRouter.put('/uasgs/:id', async (req: Request, res: Response) => {
  try {
    await AuthService.atualizarUasg(Number(req.params.id), req.body || {});
    res.json({ success: true });
  } catch (err) {
    tratarErro(res, err);
  }
});

// Importa os órgãos para os quais este servidor possui chave de integração do Rauf
adminRouter.post('/uasgs/importar-rauf', async (_req: Request, res: Response) => {
  try {
    const instituicoes = await RaufIntegrationService.listarInstituicoesRauf();
    if (instituicoes.length === 0) {
      return res.status(200).json({
        criadas: 0,
        atualizadas: 0,
        mensagem: 'Nenhum órgão disponível: configure RAUF_API_KEYS (ou RAUF_API_KEY) no servidor e verifique a conexão com o Rauf.'
      });
    }
    const resultado = await AuthService.importarUasgsRauf(instituicoes);
    res.json({ ...resultado, mensagem: `Importação concluída: ${resultado.criadas} criada(s), ${resultado.atualizadas} atualizada(s).` });
  } catch (err) {
    tratarErro(res, err);
  }
});
