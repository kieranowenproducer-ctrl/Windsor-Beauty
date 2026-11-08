/** Staff passkeys remain off until explicit configuration and release review.
 * Beauty origin and credentials are always separate from Glow. */
export function passkeyConfig(env:Record<string,string|undefined>=process.env) {
  if(!env.WB_PASSKEY_ORIGIN) throw new Error('Administrator passkeys are not configured.');
  const origin=new URL(env.WB_PASSKEY_ORIGIN);
  const local=origin.hostname==='localhost' && origin.protocol==='http:';
  const production=origin.hostname==='windsorbeauty.is' && origin.protocol==='https:' && !origin.port;
  if(origin.origin!==env.WB_PASSKEY_ORIGIN || origin.username || origin.password || (!local && !production)) throw new Error('Invalid Beauty passkey origin.');
  const rpID=env.WB_PASSKEY_RP_ID || origin.hostname;
  if(rpID!==origin.hostname) throw new Error('Invalid Beauty passkey relying party.');
  return {origin:origin.origin,rpID,rpName:'Windsor Beauty'};
}
export function assertPasskeyOrigin(request:Request) {
  const config=passkeyConfig();
  if(request.headers.get('origin')!==config.origin || new URL(request.url).origin!==config.origin) throw new Error('Open Windsor Beauty directly to continue.');
  return config;
}
