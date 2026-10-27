import React, { useState } from 'react';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

// --- TYPE DEFINITIONS ---

export interface Highlight {
  icon: React.ReactNode;
  title: string;
  text: string;
}

export interface SignInPageProps {
  /** Marca exibida acima do título (logo + nome do sistema). */
  brand?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  /** Cards flutuantes sobre a imagem (substitui os depoimentos do modelo original). */
  highlights?: Highlight[];
  /** Campos adicionais renderizados antes do e-mail (ex.: seletor de UASG). */
  extraFields?: React.ReactNode;

  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: (event: React.FormEvent<HTMLFormElement>) => void;

  loading?: boolean;
  submitDisabled?: boolean;
  error?: string | null;
  submitLabel?: string;
  loadingLabel?: string;
  footer?: React.ReactNode;
  onResetPassword?: () => void;
}

// --- SUB-COMPONENTS ---

export const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-slate-700/80 bg-white/[0.04] backdrop-blur-sm transition-colors focus-within:border-blue-400/70 focus-within:bg-blue-500/10">
    {children}
  </div>
);

const HighlightCard = ({ item, delay }: { item: Highlight; delay: string }) => (
  <div
    className={`animate-testimonial ${delay} flex items-start gap-3 rounded-3xl bg-slate-900/50 backdrop-blur-xl border border-white/10 p-5 w-64`}
  >
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30">
      {item.icon}
    </div>
    <div className="text-sm leading-snug">
      <p className="font-medium text-white">{item.title}</p>
      <p className="mt-1 text-xs text-slate-300/90">{item.text}</p>
    </div>
  </div>
);

// --- MAIN COMPONENT ---

export const SignInPage: React.FC<SignInPageProps> = ({
  brand,
  title = <span className="font-light text-white tracking-tighter">Bem-vindo</span>,
  description = 'Acesse sua conta para continuar.',
  heroImageSrc,
  highlights = [],
  extraFields,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  loading = false,
  submitDisabled = false,
  error,
  submitLabel = 'Entrar',
  loadingLabel = 'Autenticando...',
  footer,
  onResetPassword,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col md:flex-row bg-[#0a0f1d] text-slate-100">
      {/* Coluna esquerda: formulário */}
      <section className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            {brand && <div className="animate-element animate-delay-100">{brand}</div>}

            <h1 className="animate-element animate-delay-100 text-4xl md:text-5xl font-semibold leading-tight">
              {title}
            </h1>
            <p className="animate-element animate-delay-200 text-slate-400">{description}</p>

            {error && (
              <div
                role="alert"
                className="animate-element animate-delay-200 flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-950/60 p-4 text-sm text-red-200"
              >
                <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
                <p className="font-medium leading-snug">{error}</p>
              </div>
            )}

            <form className="space-y-5" onSubmit={onSignIn}>
              {extraFields && <div className="animate-element animate-delay-300">{extraFields}</div>}

              <div className="animate-element animate-delay-300">
                <label htmlFor="email-input" className="text-sm font-medium text-slate-400">
                  E-mail institucional
                </label>
                <GlassInputWrapper>
                  <input
                    id="email-input"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="usuario@ebserh.gov.br"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    disabled={loading}
                    required
                    className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 p-4 rounded-2xl focus:outline-none disabled:opacity-60"
                  />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-400">
                <label htmlFor="password-input" className="text-sm font-medium text-slate-400">
                  Senha
                </label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      id="password-input"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      value={password}
                      onChange={(e) => onPasswordChange(e.target.value)}
                      disabled={loading}
                      required
                      className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 p-4 pr-12 rounded-2xl focus:outline-none disabled:opacity-60"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center cursor-pointer"
                      title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5 text-slate-400 hover:text-white transition-colors" />
                      ) : (
                        <Eye className="w-5 h-5 text-slate-400 hover:text-white transition-colors" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              {onResetPassword && (
                <div className="animate-element animate-delay-500 flex justify-end text-sm">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onResetPassword();
                    }}
                    className="text-blue-400 hover:underline transition-colors"
                  >
                    Esqueci minha senha
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || submitDisabled}
                className="animate-element animate-delay-600 w-full flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-semibold text-white shadow-xl shadow-blue-600/25 hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    {loadingLabel}
                  </>
                ) : (
                  submitLabel
                )}
              </button>
            </form>

            {footer && <div className="animate-element animate-delay-700">{footer}</div>}
          </div>
        </div>
      </section>

      {/* Coluna direita: imagem hero + destaques */}
      {heroImageSrc && (
        <section className="hidden md:block flex-1 relative p-4">
          <div
            className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center ring-1 ring-white/10"
            style={{ backgroundImage: `url(${heroImageSrc})` }}
          />
          {highlights.length > 0 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 px-8 w-full justify-center">
              <HighlightCard item={highlights[0]} delay="animate-delay-1000" />
              {highlights[1] && (
                <div className="hidden xl:flex">
                  <HighlightCard item={highlights[1]} delay="animate-delay-1200" />
                </div>
              )}
              {highlights[2] && (
                <div className="hidden 2xl:flex">
                  <HighlightCard item={highlights[2]} delay="animate-delay-1400" />
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
