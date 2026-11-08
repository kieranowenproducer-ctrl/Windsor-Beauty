import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransport } from '@simplewebauthn/server';
import { requireDb } from '@/lib/db/client';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/auth';
function getSessionTokenFromRequest(request:Request,name:string) {
  const values=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  return values.length===1 ? values[0].slice(name.length+1) : null;
}
import { assertPasskeyOrigin } from './policy';
import { passkeyRateLimit, tokenHash } from './store';

const cookieName='wb_admin_passkey_challenge';
const cookiePath='/api/admin/passkeys';
const handlePrefix='wb-admin:';
type PasskeyConfig=ReturnType<typeof assertPasskeyOrigin>;
function config() {
  const username=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD,session=process.env.ADMIN_SESSION_TOKEN;
  if(process.env.WB_ADMIN_PASSKEYS_ENABLED!=='true'||!username||!password||!session||session.length<32)throw new Error('Staff passkeys are not configured. Use the administrator password.');
  return {username,password,session,identity:createHmac('sha256',session).update(JSON.stringify([username,password])).digest('hex')};
}
function passwordMatches(input: unknown, expected: string) {
  return typeof input==='string'&&input.length<=1024&&timingSafeEqual(createHash('sha256').update(input).digest(),createHash('sha256').update(expected).digest());
}
function json(body: object,status=200) {return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});}
export function isAdminPasskeyHandle(value: unknown): boolean {
  if(typeof value!=='string'||value.length>128)return false;
  try {const raw=Buffer.from(value,'base64url');return raw.length===handlePrefix.length+32&&raw.subarray(0,handlePrefix.length).toString()===handlePrefix;} catch{return false;}
}
async function save(challenge:string,purpose:'register'|'authenticate',identity:string|null) {
  const token=randomBytes(32).toString('hex');
  await requireDb()`INSERT INTO admin_passkey_challenges(token_hash,challenge,purpose,identity_key,expires_at)
    VALUES(${tokenHash(token)},${challenge},${purpose},${identity},now()+interval '5 minutes')`;
  return token;
}
async function consume(token:string|null,purpose:'register'|'authenticate') {
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const rows=await requireDb()`UPDATE admin_passkey_challenges SET consumed_at=now() WHERE token_hash=${tokenHash(token)}
    AND purpose=${purpose} AND consumed_at IS NULL AND expires_at>now() RETURNING challenge,identity_key`;
  return rows[0]||null;
}
function challengeResponse(options:object,token:string,origin:string) {
  const response=json(options);response.cookies.set(cookieName,token,{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'strict',maxAge:300,path:cookiePath});return response;
}

/** The prefixed handle only selects a verifier. Signature, current staff config,
 * user verification and the stored staff credential decide authority. */
export async function authenticateAdminPasskey(assertion:AuthenticationResponseJSON,challenge:string,policy:PasskeyConfig,rememberMe=true) {
  const staff=config(),db=requireDb();
  const rows=await db`SELECT p.*,u.user_handle FROM admin_passkeys p JOIN admin_passkey_users u ON u.identity_key=p.identity_key
    WHERE p.credential_id=${assertion.id} AND p.identity_key=${staff.identity} AND p.revoked_at IS NULL`;
  const key=rows[0];
  if(!key||!isAdminPasskeyHandle(assertion.response?.userHandle)||assertion.response.userHandle!==key.user_handle)return json({error:'Unable to sign in with this administrator passkey. Use your administrator password.'},401);
  const verified=await verifyAuthenticationResponse({response:assertion,expectedChallenge:challenge,expectedOrigin:policy.origin,expectedRPID:policy.rpID,requireUserVerification:true,
    credential:{id:String(key.credential_id),publicKey:new Uint8Array(Buffer.from(String(key.public_key),'base64url')),counter:Number(key.counter),transports:key.transports as AuthenticatorTransport[]}});
  if(!verified.verified)return json({error:'Administrator passkey verification failed. Please try again.'},401);
  // Recheck configuration after the device prompt, then serialise counter/revocation.
  if(config().identity!==staff.identity)return json({error:'Administrator access changed. Sign in again.'},401);
  const result=await db.transaction([
    db`SELECT identity_key FROM admin_passkey_users WHERE identity_key=${staff.identity} FOR UPDATE`,
    db`WITH used AS (UPDATE admin_passkeys SET counter=${verified.authenticationInfo.newCounter},last_used_at=now(),backed_up=${verified.authenticationInfo.credentialBackedUp}
      WHERE credential_id=${assertion.id} AND identity_key=${staff.identity} AND revoked_at IS NULL AND counter=${Number(key.counter)} RETURNING credential_id)
      INSERT INTO admin_passkey_events(identity_key,credential_id,event) SELECT ${staff.identity},credential_id,'authenticated' FROM used RETURNING credential_id`,
  ]);
  if(!result[1]?.length)return json({error:'Administrator access changed. Sign in again.'},401);
  const response=json({success:true,redirect:'/admin/dashboard'});
  // Same finite staff session and permissions as the existing password login.
  response.cookies.set('wb_admin_session',staff.session,{httpOnly:true,secure:policy.origin.startsWith('https:'),sameSite:'lax',maxAge:(rememberMe?30:7)*86400,path:'/'});
  response.cookies.set(CUSTOMER_SESSION_COOKIE,'',{httpOnly:true,secure:policy.origin.startsWith('https:'),sameSite:'lax',maxAge:0,path:'/'});
  response.cookies.set(cookieName,'',{maxAge:0,path:cookiePath});return response;
}

export async function adminPasskeyAction(request:Request,action:string) {
  let policy:PasskeyConfig,staff:ReturnType<typeof config>;
  try{policy=assertPasskeyOrigin(request);staff=config();}catch{return json({error:'Administrator passkeys are unavailable here. Use your administrator password.'},403);}
  if(!['register-options','register-verify','authenticate-options','authenticate-verify','credentials','revoke'].includes(action))return json({error:'Not found.'},404);
  try{
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    if(!await passkeyRateLimit('staff-passkey:'+action+':'+ip,15))return json({error:'Please wait a few minutes and try again.'},429);
    const body=await request.json().catch(()=>null);if(!body||typeof body!=='object')return json({error:'Please try again.'},400);
    if(action==='authenticate-options'){
      const options=await generateAuthenticationOptions({rpID:policy.rpID,userVerification:'required',timeout:60000});
      return challengeResponse(options,await save(options.challenge,'authenticate',null),policy.origin);
    }
    if(action==='authenticate-verify'){
      const challenge=await consume(getSessionTokenFromRequest(request,cookieName),'authenticate');
      if(!challenge||typeof body.response?.id!=='string')return json({error:'This sign-in request expired. Please try again.'},400);
      return await authenticateAdminPasskey(body.response,challenge.challenge,policy,body.rememberMe!==false);
    }
    if(getSessionTokenFromRequest(request,'wb_admin_session')!==staff.session)return json({error:'Sign in with your administrator credentials first.'},401);
    const db=requireDb();
    if(action==='credentials')return json({credentials:await db`SELECT credential_id,label,created_at,last_used_at FROM admin_passkeys WHERE identity_key=${staff.identity} AND revoked_at IS NULL ORDER BY created_at DESC`});
    if(action!=='register-verify'){
      if(!await passkeyRateLimit('staff-passkey-password:'+staff.identity,5))return json({error:'Please wait before trying your administrator password again.'},429);
      if(!passwordMatches(body.password,staff.password))return json({error:'Confirm your current administrator password.',code:'REAUTH_REQUIRED'},401);
    }
    if(action==='revoke'){
      if(typeof body.credentialId!=='string')return json({error:'Choose an administrator passkey.'},400);
      await db.transaction([
        db`SELECT identity_key FROM admin_passkey_users WHERE identity_key=${staff.identity} FOR UPDATE`,
        db`WITH removed AS (UPDATE admin_passkeys SET revoked_at=now() WHERE credential_id=${body.credentialId} AND identity_key=${staff.identity} AND revoked_at IS NULL RETURNING credential_id)
          INSERT INTO admin_passkey_events(identity_key,credential_id,event) SELECT ${staff.identity},credential_id,'revoked' FROM removed`,
      ]);
      const response=json({success:true,redirect:'/admin/login'});response.cookies.set('wb_admin_session','',{httpOnly:true,secure:policy.origin.startsWith('https:'),sameSite:'lax',maxAge:0,path:'/'});return response;
    }
    if(action==='register-options'){
      const handle=Buffer.concat([Buffer.from(handlePrefix),randomBytes(32)]).toString('base64url');
      const users=await db`INSERT INTO admin_passkey_users(identity_key,user_handle) VALUES(${staff.identity},${handle})
        ON CONFLICT(identity_key) DO UPDATE SET identity_key=excluded.identity_key RETURNING user_handle`;
      const previous=await db`SELECT credential_id,transports FROM admin_passkeys WHERE identity_key=${staff.identity} AND revoked_at IS NULL`;
      if(previous.length>=10)return json({error:'Remove an old administrator passkey before adding another.'},400);
      const options=await generateRegistrationOptions({rpName:policy.rpName+' Admin',rpID:policy.rpID,userID:new Uint8Array(Buffer.from(users[0].user_handle,'base64url')),
        userName:'Administrator: '+staff.username,userDisplayName:'Windsor Beauty administrator',attestationType:'none',
        authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:previous.map(row=>({id:row.credential_id,transports:row.transports}))});
      return challengeResponse(options,await save(options.challenge,'register',staff.identity),policy.origin);
    }
    const challenge=await consume(getSessionTokenFromRequest(request,cookieName),'register');
    if(!challenge||challenge.identity_key!==staff.identity)return json({error:'This setup request expired. Begin again.'},400);
    const verified=await verifyRegistrationResponse({response:body.response as RegistrationResponseJSON,expectedChallenge:challenge.challenge,expectedOrigin:policy.origin,expectedRPID:policy.rpID,requireUserVerification:true});
    if(!verified.verified||!verified.registrationInfo)return json({error:'The administrator passkey could not be saved.'},400);
    if(config().identity!==staff.identity)return json({error:'Administrator access changed. Begin again.'},401);
    const {credential,credentialDeviceType,credentialBackedUp}=verified.registrationInfo;
    const label=typeof body.label==='string'?body.label.trim().slice(0,80)||'My admin passkey':'My admin passkey';
    const result=await db.transaction([
      db`SELECT identity_key FROM admin_passkey_users WHERE identity_key=${staff.identity} FOR UPDATE`,
      db`WITH saved AS (INSERT INTO admin_passkeys(credential_id,identity_key,public_key,counter,transports,device_type,backed_up,label)
        SELECT ${credential.id},${staff.identity},${Buffer.from(credential.publicKey).toString('base64url')},${credential.counter},${JSON.stringify(credential.transports||[])}::jsonb,${credentialDeviceType},${credentialBackedUp},${label}
        WHERE (SELECT count(*) FROM admin_passkeys WHERE identity_key=${staff.identity} AND revoked_at IS NULL)<10
        ON CONFLICT(credential_id) DO NOTHING RETURNING credential_id)
        INSERT INTO admin_passkey_events(identity_key,credential_id,event) SELECT ${staff.identity},credential_id,'registered' FROM saved RETURNING credential_id`,
    ]);
    if(!result[1]?.length)return json({error:'This administrator passkey could not be added. Try another passkey.'},409);
    const response=json({success:true});response.cookies.set(cookieName,'',{maxAge:0,path:cookiePath});return response;
  }catch{return json({error:'Administrator passkey sign-in could not finish. Try again or use your administrator password.'},503);}
}
