import type { InstagramProfile } from "@site-forge/shared";
import { config, metaCredentialsAvailable } from "./config.js";
import { readSecret } from "./secrets.js";

interface MetaMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

interface MetaDiscovery {
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  media?: { data: MetaMedia[] };
}

/**
 * Coleta autorizada via Instagram Graph API (Business Discovery).
 * Se as credenciais Meta ainda não estiverem configuradas, devolve um perfil de demonstração
 * baseado apenas no @ digitado — assim a aplicação já pode rodar antes de você fazer o
 * cadastro no Meta for Developers.
 */
export async function fetchInstagramProfile(username: string): Promise<InstagramProfile> {
  if (!metaCredentialsAvailable()) {
    return buildDemoProfile(username);
  }

  const accessToken = await readSecret(config.metaAccessTokenSecretArn()!);
  const fields = `business_discovery.username(${username}){username,name,biography,website,profile_picture_url,followers_count,media_count,media.limit(6){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}`;
  const url = new URL(`https://graph.facebook.com/${config.metaGraphApiVersion()}/${config.metaBusinessAccountId()}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const payload = (await response.json()) as { business_discovery?: MetaDiscovery; error?: { message?: string } };
  if (!response.ok || !payload.business_discovery) {
    // Fallback: mantém o app funcionando mesmo quando a Meta recusa a consulta
    // (perfil pessoal, sem permissão da conta profissional configurada, etc.).
    console.warn("Business Discovery falhou, usando modo demonstração:", payload.error?.message);
    return buildDemoProfile(username);
  }

  const profile = payload.business_discovery;
  return {
    username: profile.username,
    name: profile.name,
    biography: profile.biography,
    website: profile.website,
    profilePictureUrl: profile.profile_picture_url,
    followersCount: profile.followers_count,
    mediaCount: profile.media_count,
    media: (profile.media?.data ?? []).map((media) => ({
      id: media.id,
      caption: media.caption,
      mediaType: media.media_type,
      mediaUrl: media.media_url,
      thumbnailUrl: media.thumbnail_url,
      permalink: media.permalink,
      timestamp: media.timestamp
    }))
  };
}

function buildDemoProfile(username: string): InstagramProfile {
  const nice = username.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    username,
    name: nice,
    biography: `Este é um preview gerado a partir do @${username}. Conecte a API oficial do Instagram para trazer as fotos reais do perfil.`,
    website: undefined,
    profilePictureUrl: undefined,
    followersCount: undefined,
    mediaCount: 6,
    media: Array.from({ length: 6 }, (_, index) => ({
      id: `demo-${index}`,
      caption: `Publicação ${index + 1}`,
      mediaType: "IMAGE",
      mediaUrl: `https://picsum.photos/seed/${encodeURIComponent(username)}-${index}/900/900`,
      thumbnailUrl: `https://picsum.photos/seed/${encodeURIComponent(username)}-${index}/600/600`,
      permalink: `https://instagram.com/${username}`,
      timestamp: new Date().toISOString()
    }))
  };
}
