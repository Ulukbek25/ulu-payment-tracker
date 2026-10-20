import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||'0.0.0.0';
const ENDPOINT='https://corporateapi.db.com/payments/data/gpi/v1/gpiTransactionInfo';
const UETR=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requests=new Map();
const labels={ACSP:'Payment in progress',ACSC:'Settlement completed',ACCC:'Credited to beneficiary',RJCT:'Payment rejected'};
function reply(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/api/health')return reply(res,200,{ok:true,mode:process.env.DB_API_ENABLED==='true'?'live-configured':'integration-disabled'});
 if(req.method==='GET'&&url.pathname==='/api/track'){
  const uetr=(url.searchParams.get('uetr')||'').trim().toLowerCase();
  if(!UETR.test(uetr))return reply(res,400,{error:'Invalid UETR format'});
  if(process.env.DB_API_ENABLED!=='true')return reply(res,503,{error:'Deutsche Bank integration not enabled. Confirm permission and server access first.',code:'INTEGRATION_DISABLED'});
  const ip=req.socket.remoteAddress||'unknown';const now=Date.now();const hits=(requests.get(ip)||[]).filter(t=>now-t<60000);if(hits.length>=10)return reply(res,429,{error:'Rate limit exceeded'});hits.push(now);requests.set(ip,hits);
  try{
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),9000);
   let upstream;try{upstream=await fetch(`${ENDPOINT}?uetr=${encodeURIComponent(uetr)}`,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal,redirect:'error'});}finally{clearTimeout(timeout);}
   if(!upstream.ok)return reply(res,502,{error:'Upstream service did not return a successful response',upstreamStatus:upstream.status});
   const raw=await upstream.text();if(raw.length>10000)return reply(res,502,{error:'Unexpected upstream response size'});
   let data;try{data=JSON.parse(raw);}catch{return reply(res,502,{error:'Upstream response is not valid JSON'});}
   if(!data||typeof data!=='object'||typeof data.status!=='string'||typeof data.uetr!=='string'||data.uetr.toLowerCase()!==uetr)return reply(res,502,{error:'Unexpected upstream response format'});
   return reply(res,200,{uetr,status:data.status,statusLabel:labels[data.status]||'Status provided by bank',lastUpdate:typeof data.lastUpdate==='string'?data.lastUpdate:null,source:'Deutsche Bank',retrievedAt:new Date().toISOString()});
  }catch(e){return reply(res,502,{error:e.name==='AbortError'?'Upstream request timed out':'Unable to reach upstream service'});}
 }

 // PDF MT103 extraction: no persistence; returns only UUID candidates, never the document text.
 if(req.method==='POST'&&url.pathname==='/api/extract-mt103'){
  if(req.headers['content-type']!=='application/pdf')return reply(res,415,{error:'Only PDF documents are accepted'});
  const limit=4*1024*1024;let size=0;const chunks=[];
  try{
   for await(const chunk of req){size+=chunk.length;if(size>limit)return reply(res,413,{error:'PDF exceeds 4 MB'});chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);
   if(bytes.subarray(0,5).toString()!=='%PDF-')return reply(res,400,{error:'Invalid PDF file'});
   const pdfParse=(await import('pdf-parse')).default;
   const parsed=await pdfParse(bytes,{max:12});
   const found=[...new Set((parsed.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig)||[]).map(x=>x.toLowerCase()))].slice(0,10);
   return reply(res,200,{uetrs:found,notice:found.length?'Verify extracted UETR against your document':'No text UETR found. Scanned PDFs are not supported.'});
  }catch{return reply(res,422,{error:'Unable to read PDF text. Encrypted or scanned PDFs may not be supported.'});}
 }
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(filename!=='index.html')return reply(res,404,{error:'Not found'});
 try{const html=await fs.readFile(path.join(root,'public','index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(html);}catch{reply(res,500,{error:'Page unavailable'});}
});
server.listen(PORT,HOST,()=>console.log(`ULU Tracker listening on ${HOST}:${PORT}`));
