const SUPABASE_URL = 'https://qnfqeprgvmyapgagmcqf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RmJoMDzSSqC46U1nNZR1XA_--7pm3y8';
const MAPS_ENDPOINT = SUPABASE_URL + '/rest/v1/arena_map_editor_maps';

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body?.message || body?.hint || body?.details || 'Erro HTTP ' + response.status;
    throw new Error(message);
  }
  return body;
}

export async function listSharedMaps({ creatorId = null, limit = 60 } = {}) {
  const params = new URLSearchParams();
  params.set('select', 'id,map_code,creator_id,creator_name,map_name,map_payload,created_at,updated_at');
  params.set('order', 'created_at.desc');
  params.set('limit', String(Math.max(1, Math.min(100, limit))));
  if (creatorId) params.set('creator_id', 'eq.' + creatorId);
  return request(MAPS_ENDPOINT + '?' + params.toString(), { method: 'GET' }) || [];
}

export async function publishSharedMap({ creatorId, creatorName, mapName, objects, mapCode }) {
  if (!creatorId) throw new Error('Identidade do criador não configurada.');
  const payload = {
    version: 1,
    objects: Array.isArray(objects) ? objects : [],
  };
  await request(MAPS_ENDPOINT, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      map_code: mapCode,
      creator_id: creatorId,
      creator_name: creatorName,
      map_name: mapName,
      map_payload: payload,
    }),
  });
  return { mapCode };
}
