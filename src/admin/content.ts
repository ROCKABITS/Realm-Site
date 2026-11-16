import { parse, stringify } from 'yaml';

export type Data = Record<string, any>;
export type Document = { path: string; sha?: string; text: string };
export type Article = { data: Data; body: string };
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const wikiCategories = ['Getting started', 'Character & society', 'Economy & trade', 'Kingdom & justice', 'Activities & rewards'];
export function readArticle(text: string): Article {
  const match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Este artigo não tem um cabeçalho válido. Usa o editor avançado para o rever.');
  const data = parse(match[1]);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('O cabeçalho do artigo é inválido.');
  return { data, body: text.replace(/^\uFEFF/, '').slice(match[0].length).trim() };
}
export function writeArticle(article: Article): string {
  return `---\n${stringify(article.data, { lineWidth: 0 })}---\n\n${article.body.trim()}\n`;
}
export function makeSlug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).replace(/-$/, '');
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function httpUrl(value: string): boolean {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
export function validateArticle(kind: 'wiki' | 'changelog', article: Article): string | undefined {
  const { data, body } = article;
  if (!data.title?.trim() || !body.trim()) return 'Preenche o título e o conteúdo.';
  if (kind === 'wiki' && (!data.description?.trim() || !wikiCategories.includes(data.category))) return 'Preenche a descrição e escolhe uma categoria.';
  if (kind === 'wiki' && (!Number.isInteger(data.order) || data.order < 0)) return 'A posição na lista deve ser um número inteiro positivo ou zero.';
  if (kind === 'changelog' && (!data.version?.trim() || !data.summary?.trim() || !validDate(data.date))) return 'Preenche a versão, o resumo e uma data válida.';
}
export function updateMod(source: Data, slug: string, changes: Data): Data {
  if (!Array.isArray(source.mods) || !source.mods.some((mod: Data) => mod.slug === slug)) throw new Error('Este mod já não existe no catálogo. Atualiza o painel.');
  return { ...source, mods: source.mods.map((mod: Data) => mod.slug === slug ? { ...mod, ...changes, slug: mod.slug } : mod) };
}
export function encodeContent(text: string): string {
  const bytes = new TextEncoder().encode(text); let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function decodeContent(text: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), character => character.charCodeAt(0)));
}
