// Detecta se o app está rodando como artefato do Claude e dá acesso às capacidades do visualizador.
/* eslint-disable @typescript-eslint/no-explicit-any */
const claude: any = typeof window !== 'undefined' ? (window as any).claude : undefined

export const inArtifact = typeof claude?.use === 'function'

/** Capacidade do artefato, ou null quando não existe nesta visualização. */
export async function use(name: string): Promise<any> {
  if (!inArtifact) return null
  try {
    return await claude.use(name)
  } catch {
    return null
  }
}
