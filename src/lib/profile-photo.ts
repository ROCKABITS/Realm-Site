import { getSupabase } from './auth';
import { validPhotoPath } from './member-model';

export const photoBucket = 'realm-profile-photos';
const signed = new Map<string, { url: string; until: number }>();
export async function preparePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('Choose a photo smaller than 8 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('This image could not be opened. Please choose another photo.'); }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (!side || bitmap.width * bitmap.height > 40_000_000) throw new Error('Choose a smaller image (up to 40 megapixels).');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 384, 384);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .85));
    if (!blob || blob.type !== 'image/webp' || blob.size > 524288) throw new Error('This photo could not be prepared. Please choose another image.');
    return blob;
  } finally { bitmap.close(); }
}
export async function photoUrl(path: string): Promise<string | undefined> {
  if (!validPhotoPath(path)) return;
  const cached = signed.get(path); if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await (await getSupabase()).storage.from(photoBucket).createSignedUrl(path, 300);
  if (error || !data) return;
  const url = new URL(data.signedUrl); const origin = new URL(import.meta.env.PUBLIC_SUPABASE_URL).origin;
  if (url.origin !== origin || !url.pathname.startsWith(`/storage/v1/object/sign/${photoBucket}/`)) return;
  signed.set(path, { url: url.href, until: Date.now() + 240_000 }); return url.href;
}
export function initials(name: string) { return Array.from(name.trim() || 'Adventurer').slice(0, 2).join('').toUpperCase(); }
export function showPhoto(element: HTMLElement, path: string, name: string) {
  const key = `${path}:${name}`; element.dataset.photoKey = key; element.textContent = initials(name);
  if (!path) return;
  void photoUrl(path).then(url => {
    if (!url || element.dataset.photoKey !== key || !element.isConnected) return;
    const image = new Image(); image.alt = ''; image.width = image.height = 80; image.src = url;
    image.onerror = () => { if (element.dataset.photoKey === key) element.textContent = initials(name); };
    element.replaceChildren(image);
  }).catch(() => { /* Initials remain available if the photo service is offline. */ });
}
export async function uploadPhoto(userId: string, photo: Blob) {
  const path = `${userId}/${crypto.randomUUID()}.webp`;
  const { error } = await (await getSupabase()).storage.from(photoBucket).upload(path, photo, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error('Your photo could not be uploaded. Please try again.');
  return path;
}
export async function deletePhoto(path: string) {
  if (!validPhotoPath(path)) return;
  signed.delete(path);
  const { error } = await (await getSupabase()).storage.from(photoBucket).remove([path]);
  if (error) throw error;
}
