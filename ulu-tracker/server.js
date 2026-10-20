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
 if(req.method==='GET'&&url.pathname==='/api/qr'){
  const uetr=(url.searchParams.get('uetr')||'').trim().toLowerCase();
  if(!UETR.test(uetr))return reply(res,400,{error:'Invalid UETR'});
  try{
   const QRCode=(await import('qrcode')).default;
   const origin=process.env.PUBLIC_URL||'https://ulu-payment-tracker.onrender.com';
   const link=new URL('/',origin);link.searchParams.set('uetr',uetr);
   const png=await QRCode.toBuffer(link.toString(),{type:'png',width:320,margin:1,errorCorrectionLevel:'M'});
   res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(png);
  }catch{return reply(res,500,{error:'QR unavailable'});}
 }
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
  const contentType=(req.headers['content-type']||'').split(';')[0].toLowerCase();
  const supported=new Set(['application/pdf','image/png','image/jpeg','image/webp','image/bmp','image/tiff']);
  if(!supported.has(contentType))return reply(res,415,{error:'Unsupported file type'});
  const limit=5*1024*1024;let size=0;const chunks=[];
  try{
   for await(const chunk of req){size+=chunk.length;if(size>limit)return reply(res,413,{error:'File exceeds 5 MB'});chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);
   const signatures={
    'application/pdf':bytes.subarray(0,5).toString()==='%PDF-',
    'image/png':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/jpeg':bytes[0]===255&&bytes[1]===216,
    'image/webp':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP',
    'image/bmp':bytes.subarray(0,2).toString()==='BM',
    'image/tiff':bytes.subarray(0,4).toString()==='II*\0'||bytes.subarray(0,4).toString()==='MM\0*'
   };
   if(!signatures[contentType])return reply(res,400,{error:'File content does not match its type'});
   let extracted='';
   if(contentType==='application/pdf'){
    const pdfParse=(await import('pdf-parse')).default;
    const parsed=await pdfParse(bytes,{max:12});extracted=parsed.text||'';
   }else{
    const {createWorker}=await import('tesseract.js');
    const worker=await createWorker('eng',1,{logger:()=>{}});
    try{
      const job=worker.recognize(bytes);
      const timer=new Promise((_,reject)=>setTimeout(()=>reject(new Error('OCR timeout')),35000));
      const recognized=await Promise.race([job,timer]);extracted=recognized.data.text||'';
    }finally{await worker.terminate();}
   }
   // OCR often inserts whitespace around hyphens: normalize only UUID-shaped matches.
   const normalized=extracted.replace(/([0-9a-f])\s*-\s*(?=[0-9a-f])/ig,'$1-');
   const found=[...new Set((normalized.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig)||[]).map(x=>x.toLowerCase()))].slice(0,10);
   return reply(res,200,{uetrs:found,notice:found.length?'Verify extracted UETR against your document':'No UETR detected'});

  }catch{return reply(res,422,{error:'Unable to read document. Try a clear PNG/JPG image or a text-based PDF.'});}
 }
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 const filename=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(filename!=='index.html')return reply(res,404,{error:'Not found'});
 try{const html=await fs.readFile(path.join(root,'public','index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});res.end(html);}catch{reply(res,500,{error:'Page unavailable'});}
});
server.listen(PORT,HOST,()=>console.log(`ULU Tracker listening on ${HOST}:${PORT}`));
