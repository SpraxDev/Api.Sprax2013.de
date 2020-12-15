import {
  MinecraftNameHistoryElement,
  MinecraftProfile,
  MinecraftProfileProperty,
  MinecraftUUIDResponse
} from '../global';
import { ApiError, isUUID } from './utils';
import { httpGet } from './web';

let rateLimitedNameHistory = false;

// TODO: Make sure that only the needed parts are requested by the API-Routes. We don't need Name-History every time!

setInterval(() => {
  rateLimitedNameHistory = false;
}, 15 * 60 * 1000 /* 15 minutes */);

// TODO: Check if using fallback-api is needed

export async function fetchUUID(username: string, at?: number): Promise<MinecraftUUIDResponse | null> {
  return new Promise<MinecraftUUIDResponse | null>((resolve, reject) => {
    const cleanUsername = username.trim().toLowerCase();

    // We don't have to check invalid looking usernames (although they exist), because Mojang doesn't return an UUID for them
    if (cleanUsername.length > 16 || !/^[a-z0-9_]+$/.test(cleanUsername)) return resolve(null);

    httpGet(`https://api.mojang.com/users/profiles/minecraft/${cleanUsername}${at != undefined ? `?at=${at}` : ''}`)
        .then((result) => {
          if (result.res.status == 204) return resolve(null);

          if (result.res.status == 200) {
            return resolve(JSON.parse(result.body.toString('utf-8')));
          } else if (result.res.status == 429 && at == undefined) {
            ApiError.log(`Got ${result.res.status} from 'api.mojang.com' for '${cleanUsername}'->uuid - Contacting fallback...`);

            fetchUUIDFallback(cleanUsername)
                .then(resolve)
                .catch(reject);
          } else {
            return reject(createError('api.mojang.com', result.res.status, result.body));
          }
        })
        .catch(reject);
  });
}

async function fetchUUIDFallback(cleanUsername: string): Promise<MinecraftUUIDResponse | null> {
  return new Promise<MinecraftUUIDResponse | null>((resolve, reject) => {
    httpGet(`https://api.ashcon.app/mojang/v1/user/${cleanUsername}`)
        .then((result) => {
          if (result.res.status == 404) return resolve(null);
          if (result.res.status != 200) return reject(createError('api.ashcon.app', result.res.status, result.body));

          const apiRes = JSON.parse(result.body.toString('utf-8'));
          return resolve({id: apiRes.uuid.replace(/-/g, ''), name: apiRes.username});
        })
        .catch(reject);
  });
}

export async function fetchProfile(uuid: string): Promise<MinecraftProfile | null> {
  return new Promise<MinecraftProfile | null>((resolve, reject) => {
    if (!isUUID(uuid)) return reject(new Error('Invalid UUID'));

    const cleanUUID = uuid.trim().toLowerCase().replace(/-/g, '');

    httpGet(`https://sessionserver.mojang.com/session/minecraft/profile/${cleanUUID}?unsigned=false`)
        .then((result) => {
          if (result.res.status == 204) return resolve(null);
          if (result.res.status == 200) {
            const apiRes = JSON.parse(result.body.toString('utf-8')) as MinecraftProfile;

            if (apiRes.legacy == undefined) {
              apiRes.legacy = false;
            }

            return resolve(apiRes);
          } else if (result.res.status == 429) {
            ApiError.log(`Got ${result.res.status} from 'sessionserver.mojang.com' for '${cleanUUID}'->profile - Contacting fallback...`);

            fetchProfileFallback(cleanUUID)
                .then(resolve)
                .catch(reject);
          } else {
            return reject(createError('sessionserver.mojang.com', result.res.status, result.body));
          }
        })
        .catch(reject);
  });
}

async function fetchProfileFallback(cleanUUID: string): Promise<MinecraftProfile | null> {
  return new Promise<MinecraftProfile | null>((resolve, reject) => {
    httpGet(`https://api.ashcon.app/mojang/v2/user/${cleanUUID}`)
        .then((result) => {
          if (result.res.status == 404) return resolve(null);
          if (result.res.status != 200) return reject(createError('api.ashcon.app', result.res.status, result.body));

          const apiRes = JSON.parse(result.body.toString('utf-8'));

          const profileProps: MinecraftProfileProperty[] = apiRes.textures?.raw?.value ? [{
            name: 'textures',
            value: apiRes.textures.raw.value,
            signature: apiRes.textures.raw.signature || undefined
          }] : [];

          return resolve({
            id: apiRes.uuid.replace(/-/g, ''),
            name: apiRes.username,
            properties: profileProps
          });
        })
        .catch(reject);
  });
}

export async function fetchNameHistory(uuid: string): Promise<MinecraftNameHistoryElement[] | null> {
  return new Promise<MinecraftNameHistoryElement[] | null>((resolve, reject) => {
    if (!isUUID(uuid)) return reject(new Error('Invalid UUID'));

    const cleanUUID = uuid.toLowerCase().replace(/-/g, '');

    if (rateLimitedNameHistory) {
      return fetchNameHistoryFallback(cleanUUID)
          .then(resolve)
          .catch(reject);
    }

    httpGet(`https://api.mojang.com/user/profiles/${cleanUUID}/names`)
        .then((result) => {
          if (result.res.status == 204) return resolve(null);
          if (result.res.status == 200) {
            return resolve(JSON.parse(result.body.toString('utf-8')));
          } else if (result.res.status == 429) {
            if (!rateLimitedNameHistory) {
              rateLimitedNameHistory = true;
              ApiError.log(`Got ${result.res.status} from 'sessionserver.mojang.com' for '${cleanUUID}'->name_history - Using fallback for the next 15 minutes`);
            }

            fetchNameHistoryFallback(cleanUUID)
                .then(resolve)
                .catch(reject);
          } else {
            return reject(createError('sessionserver.mojang.com', result.res.status, result.body));
          }
        })
        .catch(reject);
  });
}

async function fetchNameHistoryFallback(cleanUUID: string): Promise<MinecraftNameHistoryElement[] | null> {
  return new Promise<MinecraftNameHistoryElement[] | null>((resolve, reject) => {
    httpGet(`https://api.ashcon.app/mojang/v2/user/${cleanUUID}`)
        .then((result) => {
          if (result.res.status == 404) return resolve(null);
          if (result.res.status != 200) return reject(createError('api.ashcon.app', result.res.status, result.body));

          const apiRes = JSON.parse(result.body.toString('utf-8')).username_history;
          const nameHistory: MinecraftNameHistoryElement[] = [];

          for (const entry of apiRes) {
            nameHistory.push({
              name: entry.username,
              changedToAt: entry.changed_at ? new Date(entry.changed_at).getTime() : undefined
            });
          }

          nameHistory.reverse();

          return resolve(nameHistory);
        })
        .catch(reject);
  });
}

export async function fetchBlockedServers(): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    httpGet('https://sessionserver.mojang.com/blockedservers')
        .then((result) => {
          if (result.res.status != 200) return reject(createError('sessionserver.mojang.com', result.res.status, result.body));

          const hashes = [];

          for (const hash of result.body.toString('utf-8').split('\n')) {
            hashes.push(hash);
          }

          if (hashes[hashes.length - 1].trim() == '') {
            hashes.pop();
          }

          return resolve(hashes);
        })
        .catch(reject);
  });
}

function createError(host: string, status: number, body: Buffer): Error & { status?: number, body?: string } {
  const err: Error & { status?: number, body?: string } = new Error(`An unknown error occurred while contacting '${host}'`);

  err.status = status;
  err.body = body.toString('utf-8');

  return err;
}