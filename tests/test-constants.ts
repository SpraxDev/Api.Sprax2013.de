import { UuidToProfileResponse } from '../src/minecraft/MinecraftApiClient.js';
import MinecraftProfile from '../src/minecraft/value-objects/MinecraftProfile.js';

export const EXISTING_MC_PROFILE_RESPONSE: UuidToProfileResponse = {
  id: '955e4cf6411c40d1a1765bc8e03a8a9a',
  name: 'SpraxDev',
  properties: [{
    name: 'textures',
    value: Buffer.from('{\n' +
      '  "timestamp" : 1724858950646,\n' +
      '  "profileId" : "955e4cf6411c40d1a1765bc8e03a8a9a",\n' +
      '  "profileName" : "SpraxDev",\n' +
      '  "signatureRequired" : true,\n' +
      '  "textures" : {\n' +
      '    "SKIN" : {\n' +
      '      "url" : "http://textures.minecraft.net/texture/cc69184e66d39fc1f5ed11a5e19e250a0561c289bf8bdb69362b11bc7fc659c1",\n' +
      '      "metadata" : {\n' +
      '        "model" : "slim"\n' +
      '      }\n' +
      '    }\n' +
      '  }\n' +
      '}').toString('base64'),
    signature: 'mYYatMsbU9b7ISiZZAW/qm00CjTkVbf04UBrOVJ+HLkGg/eTHStZnDz0BfE+K4FXWrRXOhIdIgyimsuhnfC8NXnNpgJ4iIgWSfSPKt7502AWX7W+QQHIQ6HD9yCuN4bxnQnPF7z/p+hndC5tRGnvImGTtpSdBge+bvksBKCw+Gpg9kMxy48ckLt15i5iOfHtv0cQ0re/ePr+gcUas+Xyp8+ErMrFhC3JJdsfXMMMgg801uzFnJ89EwXNmCr2rVsFEnwZUOyBE8A9BCxIl7rO5AvaT4eMclAR23tuwYnVPL/Jd6G5ykpkG5YBwSszAT/SixTeEVAn80XWPcItUdMkAtWb1sZjgqSZtCL3AUhkL2Rfs0iyGydfV/HSgDgVCBME6OCp1h4O8Lo56qyfIfoj68SW/atwtOHAPrRyc6qL0UhppoyQqTVto4bOwNO3nszYKkuv4ADQmjIT782WAaWNg5Ry06owWl6QhT78FxL03BKtaIHhxt5QVt0r+TXuQGaBgLo87RZddvMXLKleFDJY5N2eiP6BB3yC2FSN2S9DtyLHryrh0tRLLKJZoUy8Ij/I4yRX81YGsYSDukEYAsEpzjP8Nx5v6l1i1mmYyjckQVSyPiww55fLqDT+D87t23GvtQEeaH5vQ/atbzY6uCBgXeyWdXpO2+NMx7u8B3F1F/A='
  }],
  profileActions: []
};
export const EXISTING_MC_NAME = EXISTING_MC_PROFILE_RESPONSE.name;
export const EXISTING_MC_ID = EXISTING_MC_PROFILE_RESPONSE.id;
export const EXISTING_MC_ID_WITH_HYPHENS = '955e4cf6-411c-40d1-a176-5bc8e03a8a9a';
export const EXISTING_MC_PROFILE = new MinecraftProfile(EXISTING_MC_PROFILE_RESPONSE);
