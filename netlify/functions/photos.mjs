import admin from 'firebase-admin';
import {createClient} from '@supabase/supabase-js';

function response(statusCode, data) {return {statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)};}
export async function handler(event) {
 try {
  if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) return response(503,{error:'サーバー側の認証設定が未完了です'});
  if(!admin.apps.length) admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
  const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
  if(!token) return response(401,{error:'ログインが必要です'});
  const decoded=await admin.auth().verifyIdToken(token,true);
  const profile=await admin.firestore().collection('users').doc(decoded.uid).get();
  if(!profile.exists || profile.data()?.approved!==true) return response(403,{error:'承認された社員のみ利用できます'});
  const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const storage=supabase.storage.from('genba-photos');
  const method=event.httpMethod;
  if(method==='GET') {
   const path=event.queryStringParameters?.path;
   if(!path || !/^sitePhotos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path)) return response(400,{error:'無効な写真パスです'});
   const {data,error}=await storage.createSignedUrl(path,600);
   return error?response(400,{error:error.message}):response(200,{signedUrl:data.signedUrl});
  }
  if(method==='POST') {
   const path=event.queryStringParameters?.path;
   if(!path || !/^sitePhotos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path)) return response(400,{error:'無効な写真パスです'});
   const buffer=Buffer.from(event.body||'',event.isBase64Encoded?'base64':'utf8');
   if(buffer.length>4*1024*1024 || !buffer.length) return response(413,{error:'写真は4MB以下にしてください'});
   const contentType=event.headers['content-type']||'application/octet-stream';
   if(!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(contentType)) return response(415,{error:'画像ファイルのみ対応しています'});
   const {error}=await storage.upload(path,buffer,{contentType,upsert:false});
   return error?response(400,{error:error.message}):response(200,{ok:true});
  }
  if(method==='DELETE') {
   const path=event.queryStringParameters?.path;
   if(!path || !/^sitePhotos\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(path)) return response(400,{error:'無効な写真パスです'});
   const {error}=await storage.remove([path]);
   return error?response(400,{error:error.message}):response(200,{ok:true});
  }
  return response(405,{error:'許可されていない操作です'});
 }catch(e){console.error('photo handler',e);return response(401,{error:'認証または写真処理に失敗しました'});}
}
